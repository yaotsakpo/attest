import { query } from "./_generated/server";
import { v } from "convex/values";
import { aggregateClassified, type ClassifiedEvent } from "./lib/reputationClass";

// The network-wide reputation standing for a counterpart domain, derived from
// attestable events (continuity confirmations / proven takeovers). Public:
// reputation is a collective signal built only on checkable facts, not claims —
// so exposing the standing leaks nothing a peer couldn't attest itself. This is
// the NETWORK view: no querier-local omission (a_Z) enters, so it never shows
// `suspected` — that state is local to a specific agent's own channel.
export const forDomain = query({
  args: { domain: v.string() },
  returns: v.object({
    confirmed: v.number(),
    proven: v.number(),
    absent: v.number(),
    networkWide: v.boolean(),
    localSuspicion: v.boolean(),
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
    const classified: ClassifiedEvent[] = events.map((e) => ({
      kind: e.kind, // stored kinds already match the classified vocabulary
      class: "commission",
      transferable: true,
      observer: e.userId,
      at: e.at,
    }));
    // `self` is the network viewpoint here (a sentinel that never matches an
    // observer), so no omission is self-scoped and `suspected` cannot arise.
    return aggregateClassified(classified, { self: "__network__" });
  },
});
