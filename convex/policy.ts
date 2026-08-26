import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Rule } from "./lib/policyEngine";

// The validator for one policy rule, shared by get + save so the wire shape and
// the stored shape stay in lock-step with the schema.
const ruleValidator = v.object({
  id: v.string(),
  action: v.union(
    v.literal("reply"),
    v.literal("payment"),
    v.literal("share_info"),
    v.literal("schedule"),
    v.literal("custom"),
  ),
  customLabel: v.optional(v.string()),
  appliesTo: v.optional(v.string()),
  maxAmount: v.optional(v.number()),
  requireVerified: v.optional(v.boolean()),
  minGrade: v.optional(
    v.union(
      v.literal("A"),
      v.literal("B"),
      v.literal("C"),
      v.literal("D"),
      v.literal("F"),
    ),
  ),
  decision: v.union(
    v.literal("allow"),
    v.literal("hold"),
    v.literal("deny"),
  ),
});

// The signed-in user's ordered policy ruleset (empty array if none saved).
// Auth-scoped; identity derived server-side.
export const get = query({
  args: {},
  returns: v.array(ruleValidator),
  handler: async (ctx): Promise<Rule[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const row = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
      .catch(() => null);
    return row?.rules ?? [];
  },
});

// Replace the user's entire ruleset (whole-array save; the panel owns ordering).
// Upserts the single per-user row. Ownership enforced via getAuthUserId; a
// signed-out call is a safe no-op.
export const save = mutation({
  args: { rules: v.array(ruleValidator) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const now = Date.now();
    const existing = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
      .catch(() => null);
    if (existing) {
      await ctx.db.patch(existing._id, { rules: args.rules, updatedAt: now });
    } else {
      await ctx.db.insert("policies", {
        userId,
        rules: args.rules,
        updatedAt: now,
      });
    }
    return null;
  },
});
