import { query } from "./_generated/server";
import { v } from "convex/values";
import { aggregateReputation } from "./lib/reputation";

// The network-wide reputation standing for a counterpart domain, derived from
// attestable events (continuity confirmations / suspected takeovers). Public:
// reputation is a collective signal, and it's built only on checkable facts, not
// claims — so exposing the standing leaks nothing a peer couldn't attest itself.
export const forDomain = query({
  args: { domain: v.string() },
  returns: v.object({
    confirmed: v.number(),
    takeovers: v.number(),
    localAbsent: v.number(),
    flagged: v.boolean(),
    standing: v.union(
      v.literal("unknown"),
      v.literal("suspected"),
      v.literal("good"),
      v.literal("compromised"),
    ),
  }),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("reputationEvents")
      .withIndex("by_counterpart", (q) => q.eq("counterpart", args.domain))
      .take(500);
    // This is the NETWORK standing — the portable, a_Z-independent view. Local
    // suspicion (a_Z) is per-querier and never network-wide, so it's 0 here by
    // design; the graph panel shows collective reputation, not local friction.
    return aggregateReputation(
      events.map((e) => ({ kind: e.kind, at: e.at })),
    );
  },
});
