import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Fetch the continuity record for a (user, counterpart) pair so the outbound
// reply can embed the forward-secret token. Internal only.
export const getRecord = internalQuery({
  args: { userId: v.id("users"), counterpart: v.string() },
  returns: v.union(
    v.object({
      seed: v.string(),
      seeded: v.boolean(),
      counter: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const rec = await ctx.db
      .query("continuity")
      .withIndex("by_user_and_counterpart", (q) =>
        q.eq("userId", args.userId).eq("counterpart", args.counterpart),
      )
      .unique()
      .catch(() => null);
    if (!rec) return null;
    return { seed: rec.seed, seeded: rec.seeded, counter: rec.counter };
  },
});
