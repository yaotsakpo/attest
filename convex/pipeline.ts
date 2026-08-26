import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { gradeFor } from "./lib/grade";
import { domainFor } from "./lib/trustScore";
import { detectSensitiveRequest } from "./lib/disclosureGate";
import { decideAction } from "./lib/policyEngine";
import { tierFor, isNetworkDomain } from "./lib/membership";

type Stage = Doc<"applications">["stage"];

const ORDER: Stage[] = ["applied", "screen", "technical", "onsite", "offer"];
const EVENT_TO_STAGE: Record<string, Stage> = {
  confirmation: "applied",
  recruiter_reply: "screen",
  interview_invite: "technical",
  offer: "offer",
  rejection: "rejected",
};

// Never move a card backward through the funnel; terminal states always allowed.
function forwardOnly(current: Stage, next: Stage): Stage {
  if (next === "rejected" || next === "ghosted") return next;
  const ci = ORDER.indexOf(current);
  const ni = ORDER.indexOf(next);
  return ni > ci ? next : current;
}

function normalize(company: string): string {
  return company.toLowerCase().replace(/\s+/g, "");
}

// Apply OpenAI's extracted fields to the pipeline: match the event to an
// application (or create one), advance the stage forward-only, and roll up the
// trust state. Honesty gate: an unverified sender may move lower-stakes stages
// but may NOT push a card to "offer".
export const applyExtraction = internalMutation({
  args: { eventId: v.id("events"), extracted: v.any() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ev = await ctx.db.get("events", args.eventId);
    if (!ev) return null;

    // --- The disclosure gate -------------------------------------------------
    // Decide whether the agent may auto-answer this sender or must hold for the
    // user's approval, based on (a) the sender's earned domain grade and (b)
    // whether the email asks for sensitive info the agent holds on file.
    const domain = ev.registryDomain ?? domainFor(ev.fromAddress, null);
    const domRow = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique()
      .catch(() => null);
    const grade = domRow
      ? gradeFor(domRow.trustScore, domRow.verifiedCount, domRow.unverifiedCount)
      : "F";
    const text = `${ev.subject}\n${ev.rawText}`;
    const sensitiveRequest = detectSensitiveRequest(text);
    // Consult the user's OWN policy first (a payment threshold, an auto-reply
    // rule, a share_info allow…). decideAction falls back to the safe default
    // disclosure gate when no rule matches, and never auto-releases a payment
    // the user didn't authorize.
    const policy = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", ev.userId))
      .unique()
      .catch(() => null);
    // Trust TIER (second axis): is this counterpart in Attest's network (Attest
    // holds its identity) or outside it? In-network gets a routine-reply lift;
    // it never lifts payment/sensitive holds.
    const tier = tierFor({
      domain,
      senderVerified: ev.senderVerified,
      isNetworkMember: isNetworkDomain(domain),
    });
    const decision = decideAction({
      grade,
      senderVerified: ev.senderVerified,
      sensitiveRequest,
      domain,
      text,
      rules: policy?.rules ?? [],
      tier,
    });
    await ctx.db.patch("events", args.eventId, {
      sensitiveRequest,
      gateAction: decision.action,
      gateReason: decision.reason,
    });
    // On auto-answer (verified counterpart, routine request), the agent replies
    // for you via AgentMail. Held items wait for approval (see activity.resolve).
    if (decision.action === "auto_answer") {
      await ctx.scheduler.runAfter(0, internal.agentmail.sendAgentReply, {
        eventId: args.eventId,
        kind: "auto",
      });
    }

    const ex = (args.extracted ?? {}) as {
      company?: string | null;
      role?: string | null;
      eventType?: string | null;
    };
    const company = (ex.company ?? "").toString().trim();

    // Candidate applications for this user (bounded read).
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", ev.userId))
      .take(200);

    // Match priority: (1) exact company name, (2) from-address contains the
    // normalized company of a known application (most recent first).
    let app: Doc<"applications"> | null =
      apps.find(
        (a) => company && a.company.toLowerCase() === company.toLowerCase(),
      ) ?? null;
    if (!app) {
      app =
        [...apps]
          .sort((a, b) => b.lastEventAt - a.lastEventAt)
          .find((a) => ev.fromAddress.toLowerCase().includes(normalize(a.company))) ??
        null;
    }

    const eventType = (ex.eventType ?? "recruiter_reply").toString();

    if (!app) {
      // No match -> create a new application (a recruiter from a company you
      // didn't track yet still lands cleanly).
      const stage: Stage = EVENT_TO_STAGE[eventType] ?? "applied";
      // A brand-new card can't be born at "offer" on an unverified sender.
      const safeStage: Stage =
        !ev.senderVerified && stage === "offer" ? "applied" : stage;
      const newId: Id<"applications"> = await ctx.db.insert("applications", {
        userId: ev.userId,
        company: company || ev.fromAddress.split("@")[1] || "Unknown",
        role: (ex.role ?? "").toString(),
        stage: safeStage,
        trustState: ev.senderVerified ? "verified" : "unverified",
        lastEventAt: Date.now(),
      });
      await ctx.db.patch("events", args.eventId, {
        applicationId: newId,
        extracted: ex,
        eventType: (EVENT_TO_STAGE[eventType]
          ? (eventType as Doc<"events">["eventType"])
          : "recruiter_reply") as Doc<"events">["eventType"],
      });
      return null;
    }

    // Existing application: advance forward-only, gate "offer" on verification.
    const target: Stage = EVENT_TO_STAGE[eventType] ?? app.stage;
    const gated: Stage =
      !ev.senderVerified && target === "offer" ? app.stage : target;
    const nextStage = forwardOnly(app.stage, gated);

    // Trust rollup: verified+unverified history => mixed.
    const nextTrust: Doc<"applications">["trustState"] =
      app.trustState === "verified" && !ev.senderVerified
        ? "mixed"
        : app.trustState === "unverified" && ev.senderVerified
          ? "mixed"
          : ev.senderVerified
            ? "verified"
            : "unverified";

    await ctx.db.patch("applications", app._id, {
      stage: nextStage,
      trustState: nextTrust,
      lastEventAt: Date.now(),
    });
    await ctx.db.patch("events", args.eventId, {
      applicationId: app._id,
      extracted: ex,
      eventType: (EVENT_TO_STAGE[eventType]
        ? (eventType as Doc<"events">["eventType"])
        : "recruiter_reply") as Doc<"events">["eventType"],
    });
    return null;
  },
});

// Firecrawl enrichment writer (Task 8) — patch enrichment onto an application.
export const setEnrichment = internalMutation({
  args: { applicationId: v.id("applications"), enrichment: v.any() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch("applications", args.applicationId, {
      enrichment: args.enrichment,
    });
    return null;
  },
});
