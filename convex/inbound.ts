import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { evaluateSender } from "./lib/senderAuth";
import { domainFor } from "./lib/trustScore";

// Persist an inbound email as an `events` row, then schedule OpenAI extraction.
// Idempotent: a duplicate delivery (same AgentMail message id) is dropped so the
// webhook can be retried safely. Internal: only the httpAction calls this.
export const ingestInbound = internalMutation({
  args: {
    userId: v.id("users"),
    agentmailMsgId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    rawText: v.string(),
    authResultsHeader: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"events"> | null> => {
    // Dedup on the message id (idempotent webhook).
    const existing = await ctx.db
      .query("events")
      .withIndex("by_msg", (q) => q.eq("agentmailMsgId", args.agentmailMsgId))
      .unique()
      .catch(() => null); // .unique() throws on >1 — treat as "already seen"
    if (existing) return null;

    const verdict = evaluateSender(
      args.fromAddress,
      args.authResultsHeader ?? null,
    );

    const now = Date.now();
    const domain = domainFor(args.fromAddress, args.authResultsHeader ?? null);
    const eventId = await ctx.db.insert("events", {
      userId: args.userId,
      agentmailMsgId: args.agentmailMsgId,
      fromAddress: args.fromAddress,
      subject: args.subject,
      rawText: args.rawText,
      senderVerified: verdict.verified,
      verifyReason: verdict.reason,
      registryDomain: domain,
    });

    // Earn trust for the sending domain — the registry grows on every email.
    // (Same transaction as the event insert, so the two can never drift.)
    await ctx.runMutation(internal.registry.observeDomain, {
      domain,
      verified: verdict.verified,
      at: now,
    });

    // Schedule extraction (Task 5) — never block the webhook on the LLM call.
    await ctx.scheduler.runAfter(0, internal.extract.run, { eventId });

    return eventId;
  },
});
