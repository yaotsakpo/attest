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
  })
    .index("by_user", ["userId"])
    .index("by_inbox", ["agentmailInbox"])
    .index("by_inbox_id", ["agentmailInboxId"]),

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
    agentmailInboxId: v.optional(v.string()), // inbox that received it (for in-thread replies)
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
    // Trust-transfer flags. `isHub` = this domain has authenticated on behalf of
    // >=1 DISTINCT other (company) From-domain — i.e. it's an ATS intermediary
    // (greenhouse.io, lever.co, workday.com...). `hubCompanyCount` is how many
    // distinct companies we've seen reach recruits through it. Both are derived
    // from the `domainEdges` table and kept in sync in the same mutation.
    isHub: v.optional(v.boolean()),
    hubCompanyCount: v.optional(v.number()),
    // Firecrawl enrichment: who this counterpart actually is, scraped from its
    // own site. Lets the agent (and you) know who you're about to share with.
    enrichTitle: v.optional(v.string()),
    enrichDescription: v.optional(v.string()),
    enrichedAt: v.optional(v.number()),
  }).index("by_domain", ["domain"]),

  // The trust GRAPH's edges: one row per (hub -> company) relationship, learned
  // from from/auth mismatches on DMARC-pass mail. When `recruiter@acme.com`
  // authenticates as `greenhouse.io`, that IS a relationship: Acme recruits
  // THROUGH Greenhouse. We store the many-to-many as its own table (never as an
  // unbounded array on the domain doc). `count` = how many such sightings,
  // `verifiedVia` = the hub passed DMARC on at least one sighting (so it can
  // vouch). Idempotent per (hub, company): upserted, not appended.
  domainEdges: defineTable({
    hub: v.string(), // the authenticated (intermediary) domain — greenhouse.io
    company: v.string(), // the From-address domain reached through it — acme.com
    count: v.number(), // # of mismatch sightings for this pair
    verifiedVia: v.boolean(), // hub authenticated (DMARC pass) on >=1 sighting
    firstSeen: v.number(),
    lastSeen: v.number(),
  })
    .index("by_hub", ["hub"])
    .index("by_company", ["company"])
    .index("by_hub_and_company", ["hub", "company"]),

  // The user's POLICY: the structured ruleset their agent obeys before acting on
  // their behalf. Free-form to configure in the panel, structured to store and
  // enforce (Inbin schema pattern — no LLM in the enforcement path). One ordered
  // list per user; first matching rule wins, so a domain-scoped rule placed
  // above a global one overrides it. See convex/lib/policyEngine.ts.
  policies: defineTable({
    userId: v.id("users"),
    rules: v.array(
      v.object({
        id: v.string(), // client-generated stable id (edit/remove/reorder)
        action: v.union(
          v.literal("reply"),
          v.literal("payment"),
          v.literal("share_info"),
          v.literal("schedule"),
          v.literal("custom"),
        ),
        customLabel: v.optional(v.string()), // required when action === "custom"
        appliesTo: v.optional(v.string()), // domain scope; absent = global
        maxAmount: v.optional(v.number()), // payment threshold; auto-act at/below
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
      }),
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

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
