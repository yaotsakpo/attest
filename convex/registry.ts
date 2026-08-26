import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import { computeTrustScore } from "./lib/trustScore";

// Record one observation of a sending domain into the trust registry. Called
// from ingestInbound on every email. Upserts the domain row and recomputes its
// earned trust score. Internal: the registry is written only by the pipeline.
export const observeDomain = internalMutation({
  args: {
    domain: v.string(),
    verified: v.boolean(),
    at: v.number(),
  },
  handler: async (ctx, args): Promise<null> => {
    if (!args.domain) return null;

    const existing = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique()
      .catch(() => null);

    if (!existing) {
      const verifiedCount = args.verified ? 1 : 0;
      const unverifiedCount = args.verified ? 0 : 1;
      await ctx.db.insert("domains", {
        domain: args.domain,
        verifiedCount,
        unverifiedCount,
        trustScore: computeTrustScore(verifiedCount, unverifiedCount),
        firstSeen: args.at,
        lastSeen: args.at,
      });
      return null;
    }

    const verifiedCount = existing.verifiedCount + (args.verified ? 1 : 0);
    const unverifiedCount = existing.unverifiedCount + (args.verified ? 0 : 1);
    await ctx.db.patch("domains", existing._id, {
      verifiedCount,
      unverifiedCount,
      trustScore: computeTrustScore(verifiedCount, unverifiedCount),
      lastSeen: args.at,
    });
    return null;
  },
});

// The live registry for the UI panel — domains this agent has learned to trust,
// most-trusted first. Public read; the registry is not user-private (it's the
// agent's map of the internet), but we bound the read.
export const listDomains = query({
  args: {},
  handler: async (ctx): Promise<Doc<"domains">[]> => {
    const rows = await ctx.db.query("domains").take(500);
    return rows.sort((a, b) => b.trustScore - a.trustScore);
  },
});

// The DECISION view for the trust-map: each domain plus the agent's gate story
// for the signed-in user — did any message from it request sensitive info, and
// did the agent auto-answer or HOLD it. This is what turns the graph from
// decoration into "why the agent withheld your SSN". Auth-scoped on the events.
export type DomainDecision = {
  domain: string;
  trustScore: number;
  verifiedCount: number;
  unverifiedCount: number;
  askedSensitive: boolean; // any email from this domain requested sensitive info
  held: boolean; // agent held (didn't auto-release) at least one message
  heldSubject: string | null; // the held message subject, for the popover
  reason: string | null; // the gate's honest reason
};

export const domainsWithDecisions = query({
  args: {},
  handler: async (ctx): Promise<DomainDecision[]> => {
    const userId = await getAuthUserId(ctx);
    const domains = await ctx.db.query("domains").take(500);

    // events for this user, to attach the gate story per domain
    const events = userId
      ? await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(500)
      : [];

    const byDomain = new Map<string, typeof events>();
    for (const e of events) {
      const d = e.registryDomain ?? "";
      if (!d) continue;
      const arr = byDomain.get(d) ?? [];
      arr.push(e);
      byDomain.set(d, arr);
    }

    return domains
      .map((d) => {
        const evs = byDomain.get(d.domain) ?? [];
        const heldEv = evs.find((e) => e.gateAction === "hold_for_approval");
        const askedSensitive = evs.some((e) => e.sensitiveRequest === true);
        return {
          domain: d.domain,
          trustScore: d.trustScore,
          verifiedCount: d.verifiedCount,
          unverifiedCount: d.unverifiedCount,
          askedSensitive,
          held: !!heldEv,
          heldSubject: heldEv?.subject ?? null,
          reason: heldEv?.gateReason ?? null,
        };
      })
      .sort((a, b) => b.trustScore - a.trustScore);
  },
});

// Clean, stable shape for the public /registry/domains endpoint — no Convex
// system fields (_id/_creationTime) leak into the agent-facing contract.
export type RegistryEntry = {
  domain: string;
  trustScore: number;
  verifiedCount: number;
  unverifiedCount: number;
  firstSeen: number;
  lastSeen: number;
};

export const listForAgents = internalQuery({
  args: {},
  handler: async (ctx): Promise<RegistryEntry[]> => {
    const rows = await ctx.db.query("domains").take(500);
    return rows
      .sort((a, b) => b.trustScore - a.trustScore)
      .map((d) => ({
        domain: d.domain,
        trustScore: Math.round(d.trustScore * 1000) / 1000,
        verifiedCount: d.verifiedCount,
        unverifiedCount: d.unverifiedCount,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
      }));
  },
});
