import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// Resolve which user owns a given AgentMail inbox address. Used by the inbound
// webhook to route an incoming email to the right user. Internal: never exposed
// to clients.
export const userByInbox = internalQuery({
  args: { inbox: v.string() },
  handler: async (ctx, args): Promise<Id<"users"> | null> => {
    const p = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("agentmailInbox"), args.inbox))
      .first();
    return p?.userId ?? null;
  },
});

// Look up a user's profile row (their inbox). Used by inbox provisioning
// (Task 7) to avoid creating a second inbox for the same user.
export const byUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Doc<"profiles"> | null> => {
    return await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// Persist a newly-provisioned AgentMail inbox for a user (Task 7).
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    agentmailInbox: v.string(),
    agentmailInboxId: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"profiles">> => {
    return await ctx.db.insert("profiles", {
      userId: args.userId,
      agentmailInbox: args.agentmailInbox,
      agentmailInboxId: args.agentmailInboxId,
    });
  },
});
