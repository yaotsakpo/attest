import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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

const activityItem = v.object({
  _id: v.id("events"),
  fromAddress: v.string(),
  subject: v.string(),
  senderVerified: v.boolean(),
  sensitiveRequest: v.boolean(),
  gateAction: v.union(
    v.literal("auto_answer"),
    v.literal("hold_for_approval"),
    v.null(),
  ),
  gateReason: v.union(v.string(), v.null()),
  gateResolved: v.union(v.literal("approved"), v.literal("dismissed"), v.null()),
  createdAt: v.number(),
});

function toItem(e: Doc<"events">): ActivityItem {
  return {
    _id: e._id,
    fromAddress: e.fromAddress,
    subject: e.subject,
    senderVerified: e.senderVerified,
    sensitiveRequest: e.sensitiveRequest ?? false,
    gateAction: e.gateAction ?? null,
    gateReason: e.gateReason ?? null,
    gateResolved: e.gateResolved ?? null,
    createdAt: e._creationTime,
  };
}

// The items the agent HELD for the user — the dramatic surface. Bounded and
// small by nature (held + unresolved), so no pagination needed; we read a
// reasonable window and filter. Newest first.
export const held = query({
  args: {},
  returns: v.array(activityItem),
  handler: async (ctx): Promise<ActivityItem[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const events = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return events
      .filter((e) => e.gateAction === "hold_for_approval" && !e.gateResolved)
      .map(toItem);
  },
});

// The full handled log — PAGINATED. Judges can scroll a real history without
// dumping the whole table. "Load more" driven on the client.
export const log = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(activityItem),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
        v.null(),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const res = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...res, page: res.page.map(toItem) };
  },
});

// Resolve a held item: approve (you chose to release / let the agent reply) or
// dismiss (ignore this sender). Auth + ownership enforced.
export const resolve = mutation({
  args: {
    id: v.id("events"),
    decision: v.union(v.literal("approved"), v.literal("dismissed")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const ev = await ctx.db.get("events", args.id);
    if (!ev || ev.userId !== userId) return null;
    await ctx.db.patch("events", args.id, { gateResolved: args.decision });
    // On approval, the agent actually sends the reply via AgentMail.
    if (args.decision === "approved") {
      await ctx.scheduler.runAfter(0, internal.agentmail.sendAgentReply, {
        eventId: args.id,
        kind: "approved",
      });
    }
    return null;
  },
});
