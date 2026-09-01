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
    // THE USER'S OWN AGENT IDENTITY (accountability axis). What this user
    // declares their agent does, shown to counterparts + logged, never
    // authorizing. `identityScopes` is the SET of capabilities (any
    // combination); empty/absent = nothing declared. Issued by "self" (no CA
    // network yet), so we don't store an issuer field. `identityRevocationRef`
    // is optional — only set if the user hosts a revocation endpoint.
    identityScopes: v.optional(
      v.array(
        v.union(
          v.literal("read_only"),
          v.literal("correspond"),
          v.literal("transact"),
          v.literal("administer"),
        ),
      ),
    ),
    identityRevocationRef: v.optional(v.string()),
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
    // Age (ms) of the counterpart's cached identity-revocation status at the
    // moment the gate decided. Recorded so the revocation-propagation window
    // stays OBSERVABLE (spec §5: emit the age at decision time; do not optimise
    // the delay away before it is measured). Absent when no identity on file.
    identityStatusAgeMs: v.optional(v.number()),
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

  // CONTINUITY state per (user, counterpart). On a trusted first contact we seed
  // the counterpart (a key our reply carries, which every Attest agent decodes);
  // thereafter every message must carry the forward-secret response. `seed` is
  // the shared secret; `counter` is the ratchet step; `status` is the last
  // verdict. See convex/lib/continuity.ts (crypto) + continuityState.ts (machine).
  // AGENT IDENTITY (third axis: accountability). Answers "who is this agent
  // acting for, and what is it authorised to do?" — distinct from continuity
  // (still the same principal?) and reputation (should a report travel?).
  // See docs/specs/agent-identity-layer.md.
  //
  // NON-NEGOTIABLE: this object carries ZERO authentication weight (spec §2 /
  // RFC 6749 §2.2). Every field is public. Possession of it grants nothing. It
  // may be displayed, logged, resolved, and used to scope a lookup — NEVER an
  // input to an authorisation decision (enforced by tests). `scope` is a
  // DECLARED label for humans/logs; it never widens what the agent may do.
  agentIdentities: defineTable({
    agentId: v.string(), // stable, public, opaque. NOT derived from owner/address.
    ownerId: v.string(), // resolves to an accountable PRINCIPAL (org/role/person), opaque
    // The SET of capabilities the identity declares (independent, any
    // combination). Zero-authority: shown for accountability, never widens what
    // the agent may do.
    scopes: v.array(
      v.union(
        v.literal("read_only"),
        v.literal("correspond"),
        v.literal("transact"),
        v.literal("administer"),
      ),
    ),
    issuer: v.string(), // who attests the binding: "self" or a registry id
    issuedAt: v.number(),
    issuerSignature: v.string(), // binds the fields above; grants nothing by itself
    revocationRef: v.string(), // where current status is checked
    // Cached revocation status. AUTHORITATIVE answer comes from revocationRef;
    // a cached value is stale by construction (spec §5). `statusCheckedAt` lets
    // the gate expose staleness/age at decision time.
    status: v.union(v.literal("active"), v.literal("revoked")),
    statusCheckedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_owner", ["ownerId"]),

  continuity: defineTable({
    userId: v.id("users"),
    counterpart: v.string(), // the counterpart domain we track continuity for
    seed: v.string(),
    seeded: v.boolean(),
    // `counter` is the HIGHEST step accepted so far. It is no longer sufficient on
    // its own: a single monotone counter falsely flags a legitimate peer whenever
    // messages arrive out of order (measured at ~61% of sessions at 5% reordering,
    // and a forward look-ahead does not help because a reordered step arrives
    // BEHIND the counter). `seenSteps` carries the consumed steps still inside the
    // anti-replay window, per RFC 4303 §3.4.3. See convex/lib/replayWindow.ts.
    counter: v.number(),
    seenSteps: v.optional(v.array(v.number())),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("takeover_suspected"),
      v.literal("unproven_gap"), // missing token: held locally, not propagated
    ),
    updatedAt: v.number(),
    // PER-AGENT KEYING (spec §7), migrated NON-DESTRUCTIVELY: the optional
    // agentId is the finer key. Existing rows have only `counterpart` (domain)
    // and are never rewritten — reads resolve by agentId first, then fall back
    // to domain (see continuityKey.ts / the pipeline lookup). This closes the
    // "one compromised mailbox flags a whole domain" limitation both papers
    // record, without ever dropping a seed (a lost seed forces re-establishment,
    // which is the flow an attacker wants).
    agentId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_counterpart", ["userId", "counterpart"])
    .index("by_user_and_agent", ["userId", "agentId"]),

  // REPUTATION events — the third axis (portable, attestable standing). Each row
  // is an OBSERVED, checkable fact about a counterpart's conduct (a continuity
  // confirmation or a suspected takeover), NOT a claim or a vote — reputation
  // must be built only on facts an agent can attest to, or it becomes the thing
  // to game. Seed of a network-wide reputation signal; today it records the
  // continuity outcomes the gate already computes.
  reputationEvents: defineTable({
    counterpart: v.string(), // the domain the event is about
    kind: v.union(
      v.literal("continuity_confirmed"),
      v.literal("takeover_proven"), // persisted ONLY when verdict.provable — it is proof, not suspicion
    ),
    userId: v.id("users"), // who observed it (provenance of the observation)
    at: v.number(),
    // Per-agent keying (spec §7), same non-destructive migration as continuity:
    // optional finer key; existing domain-keyed rows keep working via fallback.
    agentId: v.optional(v.string()),
  })
    .index("by_counterpart", ["counterpart"])
    .index("by_agent", ["agentId"]),

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

  // POLICY COMMITMENTS — the version-chained governance record. Each row commits
  // to a ruleset via H(canonical(rules) | nonce | prev) WITHOUT revealing the
  // rules (see convex/lib/policyCommitment.ts). The chain lets a counterpart
  // check that an agent's governance is unchanged, and makes a change a visible
  // event — an attacker who takes over a mailbox must either act inside rules it
  // can't see, or bump the version right before an unusual request. The `nonce`
  // is stored so the agent can later prove a specific ruleset matches a commit;
  // it must never be reused across versions.
  policyCommitments: defineTable({
    userId: v.id("users"),
    version: v.number(),
    commit: v.string(),
    nonce: v.string(),
    prev: v.union(v.string(), v.null()),
    at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_version", ["userId", "version"]),

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
