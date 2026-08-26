import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

// The signed-in user's vault rows. Auth-scoped; identity derived server-side.
export const list = query({
  args: {},
  handler: async (ctx): Promise<Doc<"vault">[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("vault")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    value: v.string(),
    sensitive: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"vault"> | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const label = args.label.trim();
    if (!label) return null;
    return await ctx.db.insert("vault", {
      userId,
      label,
      value: args.value.trim(),
      sensitive: args.sensitive,
    });
  },
});

// Toggle a row's sensitive flag — the user decides what's precious.
export const setSensitive = mutation({
  args: { id: v.id("vault"), sensitive: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.get("vault", args.id);
    if (!row || row.userId !== userId) return null; // ownership check
    await ctx.db.patch("vault", args.id, { sensitive: args.sensitive });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("vault") },
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.get("vault", args.id);
    if (!row || row.userId !== userId) return null; // ownership check
    await ctx.db.delete("vault", args.id);
    return null;
  },
});
