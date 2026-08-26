import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Dev/demo helpers. Internal only — never exposed to clients. Used from the CLI
// (`npx convex run dev:linkDemoInbox '{"inbox":"..."}'`) to wire the most-recent
// signed-up user to a demo AgentMail inbox so the inbound webhook has a target
// before auto-provisioning (Task 7) exists.
export const linkDemoInbox = internalMutation({
  args: { inbox: v.string(), inboxId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    // Most-recently-created user (the account you just made).
    const users = await ctx.db.query("users").order("desc").take(1);
    const user = users[0];
    if (!user) return "no users yet — sign up first";

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.patch("profiles", existing._id, {
        agentmailInbox: args.inbox,
        agentmailInboxId: args.inboxId ?? existing.agentmailInboxId,
      });
      return `updated profile for ${user._id}: ${args.inbox}`;
    }
    await ctx.db.insert("profiles", {
      userId: user._id,
      agentmailInbox: args.inbox,
      agentmailInboxId: args.inboxId ?? "demo_inbox",
    });
    return `linked ${user._id} -> ${args.inbox}`;
  },
});

// Wipe demo data (applications, events, drafts, domains) for a clean re-run.
// Leaves users/profiles intact so you stay signed in.
export const resetDemo = internalMutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    for (const table of ["applications", "events", "drafts", "domains"] as const) {
      const rows = await ctx.db.query(table).take(1000);
      for (const r of rows) await ctx.db.delete(table, r._id);
    }
    return "demo data cleared";
  },
});
