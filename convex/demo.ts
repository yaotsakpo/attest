import {
  action,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// The signed-in user id, for the action (actions can't call getAuthUserId on
// ctx.db directly — they read it through a query).
export const currentUser = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx): Promise<Id<"users"> | null> => {
    return await getAuthUserId(ctx);
  },
});

// Internal reset used by the seed action (the public `reset` mutation wraps the
// same clearing for the UI's "reset" affordance).
export const resetFor = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }): Promise<null> => {
    for (const table of ["applications", "events", "drafts"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(2000);
      for (const r of rows) await ctx.db.delete(table, r._id);
    }
    const conts = await ctx.db
      .query("continuity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    for (const c of conts) await ctx.db.delete("continuity", c._id);
    return null;
  },
});

// Demo seeding, callable from the dashboard's "Load demo data" button. Runs a
// coherent set of realistic inbound emails through the REAL pipeline
// (inbound.ingestInbound -> extraction -> the disclosure gate), so the board,
// registry, trust graph, activity log, and gate decisions all populate with
// data the actual engine produced, not hand-written rows. Auth-scoped: the user
// is derived server-side, never passed in.

// Each scenario is a real email. The Authentication-Results header is crafted to
// exercise a distinct path: aligned DMARC pass (verified), a hub mismatch
// (greenhouse/lever vouch), and unauthenticated senders (couldn't verify /
// sensitive-info hold). Nothing here bypasses the gate; the verdicts are
// computed downstream exactly as they would be for live mail.
const SCENARIOS: Array<{
  from: string;
  subject: string;
  body: string;
  // authResultsHeader shape drives the verdict. Omit for "no auth" (unverified).
  auth?: string;
}> = [
  {
    from: "recruiting@greenhouse.io",
    subject: "Stripe — Backend Engineer: application received",
    body: "Thanks for applying to the Backend Engineer role at Stripe. Our team is reviewing your application and will be in touch. Reference: STR-4821.",
    // hub: authenticates as greenhouse.io, From is greenhouse.io (aligned hub)
    auth: "dmarc=pass; spf=pass; header.from=greenhouse.io",
  },
  {
    from: "talent@stripe.com",
    subject: "Stripe — quick details before we schedule",
    body: "Great news — before we book your first-round screen, can you confirm your general availability next week and your expected salary range? Nothing sensitive, just so we line up the right panel.",
    // aligned DMARC pass => VERIFIED, A-grade. Non-sensitive info request +
    // your 'share with verified recruiters' rule => AUTO-ANSWERS (a YES). The
    // agent replies with the availability/range you approved once.
    auth: "dmarc=pass; spf=pass; header.from=stripe.com",
  },
  {
    from: "billing@vercel.com",
    subject: "Vercel Pro — invoice #A-2231 ($20.00)",
    body: "Your monthly Vercel Pro subscription invoice is ready: $20.00, due now. Thanks for building with us.",
    // aligned DMARC pass => VERIFIED. $20 is at/under your $200 verified-payment
    // limit => AUTO-PAYS (a YES). The same charge from an unverified sender, or
    // over the limit, would hold.
    auth: "dmarc=pass; spf=pass; header.from=vercel.com",
  },
  {
    from: "recruiter@acme.com",
    subject: "Acme — Senior Engineer role",
    body: "We came across your profile and think you'd be a great fit for our Senior Engineer opening. Would you be open to a conversation?",
    // hub mismatch: authenticates as lever.co but From is acme.com
    // => couldn't-verify for acme, but records lever.co -> acme.com edge (vouch)
    auth: "dmarc=pass; spf=pass; header.from=lever.co",
  },
  {
    from: "no-reply@lever.co",
    subject: "Notion — interview confirmed for Tuesday",
    body: "Your technical interview with Notion is confirmed for Tuesday 2:00pm PT. The panel will cover system design and a coding exercise. Good luck!",
    auth: "dmarc=pass; spf=pass; header.from=lever.co",
  },
  {
    from: "careers@vercel.com",
    subject: "Vercel — offer details",
    body: "We're thrilled to extend an offer for the Staff Engineer position. Base compensation and equity details are attached. We'd love to have you.",
    auth: "dmarc=pass; spf=pass; header.from=vercel.com",
  },
  {
    from: "hr-team@offer-onboarding.co",
    subject: "Complete your onboarding — SSN required",
    body: "Congratulations on your new role! To finalize onboarding, please reply with your Social Security Number and a photo of your bank card so we can set up direct deposit.",
    // no auth header => unverified; body triggers the sensitive-info hold
  },
  {
    from: "billing@vendor-invoices.net",
    subject: "Invoice #2231 — payment due",
    body: "Please remit payment of $5,000 for services rendered. Wire instructions are attached. This invoice is past due; prompt payment is appreciated.",
    // unauthenticated payment request => holds (over any limit, unverified)
  },
  {
    from: "recruiter@datadog.com",
    subject: "Datadog — following up",
    body: "Just circling back on your application for the Platform Engineer role. Are you still interested? Happy to answer any questions about the team.",
    auth: "dmarc=pass; spf=pass; header.from=datadog.com",
  },
];

// Seed a demo policy for a user (mirrors dev.seedPolicy but callable internally
// from the action below). Idempotent.
export const seedPolicyFor = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }): Promise<null> => {
    const rules = [
      // YES on small verified payments — auto-pay an invoice at/under $200 from a
      // verified sender. Anything larger, or unverified, still holds.
      {
        id: "demo_pay",
        action: "payment" as const,
        maxAmount: 200,
        requireVerified: true,
        decision: "allow" as const,
      },
      // YES on sharing NON-sensitive info (availability, salary range, a
      // reference) with A-grade verified recruiters — the info you approved once,
      // reused for you. NOTE: SSN/bank is sensitive PII and can NEVER auto-share
      // (the gate's containment guarantee overrides any allow rule), so this only
      // ever releases the ordinary stuff you'd repeat on every application.
      {
        id: "demo_share",
        action: "share_info" as const,
        requireVerified: true,
        minGrade: "A" as const,
        decision: "allow" as const,
      },
      {
        id: "demo_reply",
        action: "reply" as const,
        minGrade: "B" as const,
        decision: "allow" as const,
      },
    ];
    const existing = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
      .catch(() => null);
    if (existing) {
      await ctx.db.patch(existing._id, { rules, updatedAt: 0 });
    } else {
      await ctx.db.insert("policies", { userId, rules, updatedAt: 0 });
    }
    return null;
  },
});

// Clear this user's demo-able data so the seed is repeatable without wiping the
// account. Auth-scoped. Leaves users/profiles/policies/vault intact.
export const reset = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("not signed in");
    // per-user tables
    for (const table of ["applications", "events", "drafts"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(2000);
      for (const r of rows) await ctx.db.delete(table, r._id);
    }
    const conts = await ctx.db
      .query("continuity")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(2000);
    for (const c of conts) await ctx.db.delete("continuity", c._id);
    return "reset";
  },
});

// The dashboard button target. Runs the scenarios through the real pipeline.
// An ACTION because ingestInbound schedules extraction and we run several in
// sequence; it derives the user via a helper query, then feeds each email in.
// Declared agent identities for the demo counterparts (accountability axis).
// Keyed by agentId == domain, the same key the registry + pipeline look up.
// GLOBAL (not per-user) and upserted, so replaying the demo never duplicates.
// One is left deliberately STALE (an old statusCheckedAt) so the registry shows
// the "status stale" state a person needs to understand.
const DEMO_IDENTITIES: Array<{
  agentId: string;
  scopes: Array<"read_only" | "correspond" | "transact" | "administer">;
  issuer: string;
  fresh: boolean;
}> = [
  // Real agents do several things at once — the reason scope is a SET.
  { agentId: "greenhouse.io", scopes: ["read_only", "correspond"], issuer: "self", fresh: true },
  { agentId: "lever.co", scopes: ["correspond"], issuer: "self", fresh: true },
  { agentId: "acme.com", scopes: ["read_only", "correspond", "transact"], issuer: "self", fresh: false },
];

export const seedIdentitiesFor = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now();
    for (const d of DEMO_IDENTITIES) {
      const existing = await ctx.db
        .query("agentIdentities")
        .withIndex("by_agent", (q) => q.eq("agentId", d.agentId))
        .first();
      const fields = {
        agentId: d.agentId,
        ownerId: `owner:${d.agentId}`,
        scopes: d.scopes,
        issuer: d.issuer,
        issuedAt: now,
        issuerSignature: "demo", // display-only; the binding grants nothing
        revocationRef: `https://${d.agentId}/agent/revocation`,
        status: "active" as const,
        // A stale cache (older than the 15m TTL) resolves to "status stale".
        statusCheckedAt: d.fresh ? now : now - 30 * 60_000,
      };
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("agentIdentities", fields);
    }
    return null;
  },
});

export const seed = action({
  args: {},
  returns: v.object({ seeded: v.number() }),
  handler: async (ctx): Promise<{ seeded: number }> => {
    const userId: Id<"users"> | null = await ctx.runQuery(
      internal.demo.currentUser,
      {},
    );
    if (!userId) throw new Error("not signed in");

    // clean slate for a repeatable demo (safe: only this user's demo tables)
    await ctx.runMutation(internal.demo.resetFor, { userId });

    // seed the policy so the gate has real rules to consult + the Agent drawer
    // shows rendered rules
    await ctx.runMutation(internal.demo.seedPolicyFor, { userId });

    // declare identities for the demo counterparts so the registry's Identity
    // column is populated (one stale, to show the revocation-freshness state)
    await ctx.runMutation(internal.demo.seedIdentitiesFor, {});

    // feed each email through the REAL ingest pipeline. Unique msg ids keep it
    // idempotent; ingestInbound earns registry trust, detects hubs, and
    // schedules extraction + the gate for each one.
    let i = 0;
    for (const s of SCENARIOS) {
      await ctx.runMutation(internal.inbound.ingestInbound, {
        userId,
        agentmailMsgId: `demo-${userId}-${i}`,
        fromAddress: s.from,
        subject: s.subject,
        rawText: s.body,
        authResultsHeader: s.auth,
      });
      i++;
    }
    return { seeded: SCENARIOS.length };
  },
});
