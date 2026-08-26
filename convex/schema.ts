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
    registryDomain: v.optional(v.string()), // the domain key this email earned trust for
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
    // The disclosure gate's verdict for this email: did the agent auto-answer,
    // or hold for the user because it couldn't stand behind releasing info?
    sensitiveRequest: v.optional(v.boolean()),
    gateAction: v.optional(
      v.union(v.literal("auto_answer"), v.literal("hold_for_approval")),
    ),
    gateReason: v.optional(v.string()),
    // For held items: has the user resolved it? (approved to release / dismissed)
    gateResolved: v.optional(
      v.union(v.literal("approved"), v.literal("dismissed")),
    ),
  })
    .index("by_user", ["userId"])
    .index("by_msg", ["agentmailMsgId"]),

  // The vault: the user's info the agent draws on to answer recruiters. Each
  // row is a label/value the user added; `sensitive` (user-controlled) gates
  // whether the agent may auto-release it or must hold for approval.
  vault: defineTable({
    userId: v.id("users"),
    label: v.string(),
    value: v.string(),
    sensitive: v.boolean(),
  }).index("by_user", ["userId"]),

  // The trust registry: one row per sending domain, trust EARNED from observed
  // authenticated mail (not SEO). Every inbound email updates the domain it
  // authenticated as. This is the app's spine — an agent's own trust map of the
  // internet — and is exposed read-only at /registry/domains.
  domains: defineTable({
    domain: v.string(), // the authenticated domain (or the From domain if none)
    verifiedCount: v.number(), // # of DMARC-aligned sightings
    unverifiedCount: v.number(), // # of couldn't-verify sightings
    trustScore: v.number(), // derived 0..1, monotonic-ish reputation
    firstSeen: v.number(),
    lastSeen: v.number(),
  }).index("by_domain", ["domain"]),

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
