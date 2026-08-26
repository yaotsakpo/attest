import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
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
