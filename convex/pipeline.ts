import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

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
  handler: async (ctx, args): Promise<null> => {
    const ev = await ctx.db.get("events", args.eventId);
    if (!ev) return null;

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
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch("applications", args.applicationId, {
      enrichment: args.enrichment,
    });
    return null;
  },
});
