import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { gradeFor } from "./lib/grade";
import { domainFor } from "./lib/trustScore";
import { detectSensitiveRequest } from "./lib/disclosureGate";
import { decideAction } from "./lib/policyEngine";
import { tierFor } from "./lib/membership";
import { continuityVerdict } from "./lib/continuityState";
import { aggregateClassified, type ClassifiedEvent } from "./lib/reputationClass";
import { deriveSeed } from "./lib/continuity";
import { readToken } from "./lib/continuityToken";
import { acceptStep, type ReplayWindow } from "./lib/replayWindow";

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
    // holds its identity) or outside it? A member is a counterpart Attest itself
    // provisioned — determined by a real profile lookup, NOT a domain guess (many
    // AgentMail users share agentmail.to; only OUR provisioned inboxes are
    // members). In-network gets a routine-reply lift; never lifts high-stakes.
    const memberProfile = await ctx.db
      .query("profiles")
      .withIndex("by_inbox", (q) => q.eq("agentmailInbox", ev.fromAddress))
      .unique()
      .catch(() => null);
    const isMember = !!memberProfile;
    const tier = tierFor({
      domain,
      senderVerified: ev.senderVerified,
      isNetworkMember: isMember,
    });

    // CONTINUITY (third check, impersonation axis): only applies to in-network
    // counterparts we've seeded — that's where both ends speak the protocol and a
    // message can carry the forward-secret response. For ordinary email there's
    // no record, so the verdict is not_applicable and nothing changes. A seeded
    // member whose message fails the check is a possible takeover → hold.
    let continuityHold = false;
    // a_Z for §5.1: does THIS querying user have an unmet continuity expectation
    // (an absent proof) for this counterpart? An omission is local, so it enters
    // reputation only through the querier's own view, never as a network event.
    let localAbsent = 0;
    if (isMember) {
      const rec = await ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", ev.userId).eq("counterpart", domain),
        )
        .unique()
        .catch(() => null);
      // REAL cryptographic check: read the token and verify it against the
      // stored seed at the step we expect. Marker-presence is NOT enough — an
      // impostor can include a well-formed token, but without the seed it won't
      // verify. A seeded member that sends no token, or a wrong one, is the
      // takeover signal.
      // Verification runs against an ANTI-REPLAY WINDOW rather than a single
      // expected step. Ordinary email reorders and drops messages, and a lone
      // monotone counter flags a legitimate peer as a takeover whenever that
      // happens. The window accepts any fresh step in range exactly once, in any
      // order, and still rejects a replayed step. See convex/lib/replayWindow.ts.
      const tokenHex = readToken(ev.rawText);
      let accept: { accepted: boolean; step: number | null; window: ReplayWindow } | null = null;
      if (rec && rec.seeded && tokenHex !== null) {
        accept = await acceptStep(
          { highest: rec.counter, size: 64, seen: rec.seenSteps ?? [] },
          rec.seed,
          tokenHex,
        );
      }
      const responseValid = accept?.accepted ?? false;
      const proof = { hasResponse: tokenHex !== null, responseValid };
      const verdict = continuityVerdict(
        rec
          ? { seeded: rec.seeded, counter: rec.counter, lastStatus: rec.status }
          : null,
        proof,
      );
      continuityHold = verdict.shouldHold;
      if (verdict.status === "unproven_gap") localAbsent = 1;
      // On a confirmed step, persist the advanced window so the consumed step can
      // never be replayed, while later out-of-order steps remain acceptable.
      if (rec && verdict.status === "confirmed" && accept?.accepted) {
        await ctx.db.patch(rec._id, {
          counter: accept.window.highest,
          seenSteps: accept.window.seen,
        });
      }
      // Update the local continuity record for every applicable verdict.
      if (rec && verdict.status !== "not_applicable") {
        await ctx.db.patch(rec._id, {
          status: verdict.status,
          updatedAt: Date.now(),
        });
        // Emit a NETWORK-WIDE reputation event ONLY for outcomes that carry a
        // self-contained proof: a confirmed continuity, or a PROVABLE takeover
        // (a wrong token). An `unproven_gap` (missing token) holds LOCALLY but
        // must NOT propagate — an omission is indistinguishable from reordering
        // or a drop (Haeberlen/Kuznetsov), so a lost message must never smear an
        // honest agent's standing across the network.
        if (verdict.status === "confirmed") {
          await ctx.db.insert("reputationEvents", {
            counterpart: domain,
            kind: "continuity_confirmed",
            userId: ev.userId,
            at: Date.now(),
          });
        } else if (verdict.status === "takeover_suspected" && verdict.provable) {
          await ctx.db.insert("reputationEvents", {
            counterpart: domain,
            kind: "takeover_suspected",
            userId: ev.userId,
            at: Date.now(),
          });
        }
      }
    }

    // REPUTATION (third axis): fold this counterpart's ATTESTABLE event history
    // (network-wide, all users) into a standing. A takeover observed ANYWHERE
    // flags the counterpart — reputation earned elsewhere protects this user.
    const repEvents = await ctx.db
      .query("reputationEvents")
      .withIndex("by_counterpart", (q) => q.eq("counterpart", domain))
      .take(500);
    // Map stored (commission-class) events into the classified shape, and add
    // THIS user's own omission (if any) as a self-observed `proof_absent` — an
    // omission is never persisted network-wide, so it enters only as the
    // querier's local view (a_Z of §5.1). Then fold from this user's viewpoint.
    const classified: ClassifiedEvent[] = repEvents.map((e) => ({
      kind: e.kind === "takeover_suspected" ? "takeover_proven" : "continuity_confirmed",
      class: "commission",
      transferable: true,
      observer: e.userId,
      at: e.at,
    }));
    if (localAbsent > 0) {
      classified.push({
        kind: "proof_absent",
        class: "omission",
        transferable: false,
        observer: ev.userId,
        at: Date.now(),
      });
    }
    const reputation = aggregateClassified(classified, { self: ev.userId });
    const reputationCompromised = reputation.standing === "compromised";

    const decision = decideAction({
      grade,
      senderVerified: ev.senderVerified,
      sensitiveRequest,
      domain,
      text,
      rules: policy?.rules ?? [],
      tier,
      continuityHold,
      reputationFlagged: reputationCompromised,
    });
    await ctx.db.patch("events", args.eventId, {
      sensitiveRequest,
      gateAction: decision.action,
      gateReason: decision.reason,
    });

    // SEED ON TRUST: if we just decided to trust an in-network counterpart and
    // have no continuity record yet, establish one (our reply carries the seed;
    // every Attest agent decodes it). From next message on, we watch for the
    // rotating proof. Only seed on a trusting outcome — never seed something held.
    if (
      isMember &&
      decision.action === "auto_answer" &&
      !continuityHold &&
      !reputationCompromised
    ) {
      const already = await ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", ev.userId).eq("counterpart", domain),
        )
        .unique()
        .catch(() => null);
      if (!already) {
        const seed = await deriveSeed(
          "attest-agent",
          domain,
          `${ev.userId}:${domain}:trust-established`,
        );
        await ctx.db.insert("continuity", {
          userId: ev.userId,
          counterpart: domain,
          seed,
          seeded: true,
          counter: 0,
          status: "pending",
          updatedAt: Date.now(),
        });
      }
    }

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
