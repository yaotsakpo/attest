import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// `authTables` provides the `users` and auth session/account tables that Convex
// Auth manages. Our app tables reference `v.id("users")` against it.

export default defineSchema({
  ...authTables,

  // One row per user: their AgentMail inbox + optional search context.
  profiles: defineTable({
    userId: v.id("users"),
    agentmailInbox: v.string(), // "name@agentmail.to" — the apply-with address
    agentmailInboxId: v.string(),
    searchProfile: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // One row per job applied to = the pipeline cards.
  applications: defineTable({
    userId: v.id("users"),
    company: v.string(),
    role: v.string(),
    jobUrl: v.optional(v.string()),
    stage: v.union(
      v.literal("applied"),
      v.literal("screen"),
      v.literal("technical"),
      v.literal("onsite"),
      v.literal("offer"),
      v.literal("rejected"),
      v.literal("ghosted"),
    ),
    enrichment: v.optional(v.any()), // Firecrawl'd company facts (bounded by the action)
    trustState: v.union(
      v.literal("verified"),
      v.literal("unverified"),
      v.literal("mixed"),
    ),
    lastEventAt: v.number(),
  }).index("by_user", ["userId"]),

  // One row per inbound email = audit trail + what drives stage changes.
  events: defineTable({
    userId: v.id("users"),
    applicationId: v.optional(v.id("applications")),
    agentmailMsgId: v.string(), // dedup key — makes the webhook idempotent
    fromAddress: v.string(),
    subject: v.string(),
    rawText: v.string(),
    senderVerified: v.boolean(), // true iff dmarc=pass AND aligned; else "couldn't verify"
    verifyReason: v.optional(v.string()), // human-readable why-not
    extracted: v.optional(v.any()), // OpenAI typed fields (null for absent, never guessed)
    eventType: v.optional(
      v.union(
        v.literal("confirmation"),
        v.literal("recruiter_reply"),
        v.literal("interview_invite"),
        v.literal("rejection"),
        v.literal("offer"),
      ),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_msg", ["agentmailMsgId"]),

  // AI-drafted replies awaiting human approval (approve-before-send).
  drafts: defineTable({
    userId: v.id("users"),
    applicationId: v.id("applications"),
    eventId: v.id("events"),
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("discarded"),
    ),
  }).index("by_user", ["userId"]),
});
