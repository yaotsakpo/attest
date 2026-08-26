import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";

export type ActivityItem = {
  _id: Doc<"events">["_id"];
  fromAddress: string;
  subject: string;
  senderVerified: boolean;
  sensitiveRequest: boolean;
  gateAction: "auto_answer" | "hold_for_approval" | null;
  gateReason: string | null;
  gateResolved: "approved" | "dismissed" | null;
  createdAt: number;
};

// The agent-activity feed: what the agent did with each inbound email — answered
// on your behalf, or held it for you because it couldn't stand behind releasing
// your info. This is the demo's dramatic surface. Newest first.
export const feed = query({
  args: {},
  handler: async (ctx): Promise<ActivityItem[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const events = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    return events.map((e) => ({
      _id: e._id,
      fromAddress: e.fromAddress,
      subject: e.subject,
      senderVerified: e.senderVerified,
      sensitiveRequest: e.sensitiveRequest ?? false,
      gateAction: e.gateAction ?? null,
      gateReason: e.gateReason ?? null,
      gateResolved: e.gateResolved ?? null,
      createdAt: e._creationTime,
    }));
  },
});

// Resolve a held item: approve (you chose to release / let the agent reply) or
// dismiss (ignore this sender). Auth + ownership enforced.
export const resolve = mutation({
  args: {
    id: v.id("events"),
    decision: v.union(v.literal("approved"), v.literal("dismissed")),
  },
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const ev = await ctx.db.get("events", args.id);
    if (!ev || ev.userId !== userId) return null;
    await ctx.db.patch("events", args.id, { gateResolved: args.decision });
    return null;
  },
});
