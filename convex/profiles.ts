import { internalQuery, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

// The signed-in user's own agent inbox (public, auth-scoped). Returns null when
// they haven't connected one yet — the UI shows a "Connect inbox" prompt.
export const myInbox = query({
  args: {},
  returns: v.union(
    v.object({ email: v.string(), inboxId: v.string() }),
    v.null(),
  ),
  handler: async (ctx): Promise<{ email: string; inboxId: string } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return p
      ? { email: p.agentmailInbox, inboxId: p.agentmailInboxId }
      : null;
  },
});

// Resolve which user owns a given AgentMail inbox address. Used by the inbound
// webhook to route an incoming email to the right user. Internal: never exposed
// to clients.
export const userByInbox = internalQuery({
  args: { inbox: v.string(), inboxId: v.optional(v.string()) },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args): Promise<Id<"users"> | null> => {
    // Prefer the stable AgentMail inbox_id when we have one (it's the real
    // identity of the inbox); fall back to matching the email address for our
    // own simulated webhooks that only carry a `to` address.
    if (args.inboxId) {
      const inboxId = args.inboxId;
      const byId = await ctx.db
        .query("profiles")
        .withIndex("by_inbox_id", (q) => q.eq("agentmailInboxId", inboxId))
        .first();
      if (byId) return byId.userId;
    }
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_inbox", (q) => q.eq("agentmailInbox", args.inbox))
      .first();
    return p?.userId ?? null;
  },
});

// Look up a user's profile row (their inbox). Used by inbox provisioning
// (Task 7) to avoid creating a second inbox for the same user.
export const byUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      userId: v.id("users"),
      agentmailInbox: v.string(),
      agentmailInboxId: v.string(),
      searchProfile: v.optional(v.string()),
    }),
    v.null(),
  ),
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
  returns: v.id("profiles"),
  handler: async (ctx, args): Promise<Id<"profiles">> => {
    return await ctx.db.insert("profiles", {
      userId: args.userId,
      agentmailInbox: args.agentmailInbox,
      agentmailInboxId: args.agentmailInboxId,
    });
  },
});
