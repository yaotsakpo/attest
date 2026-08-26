# Hackathon log

- **Project:** Attest
- **Event:** Convex All Gas Hackathon
- **What it does:** A trust layer for your personal AI agent. Your agent talks to other agents and people over email (AgentMail), and Attest governs what it may do on your behalf. It earns a live trust registry from observed DMARC-authenticated email, holds anything it can't stand behind (an unverified sender, a request for sensitive info, a payment) for your approval, and enforces a user-defined **policy engine** — structured rules you set (e.g. "auto-pay verified counterparts under $500, hold everything else"). It visualizes who it trusts as a force-directed graph where verified ATS-style hubs vouch for the companies that reach through them.
- **Live app:** _pending deploy to convex.site_
- **Repo:** _pending public_
- **Frontend:** Convex static hosting
- **Convex deployment:** https://agreeable-dogfish-859.convex.cloud (dev)
- **Components:** none (raw fetch for AgentMail + Firecrawl)
- **Convex features:** schema, indexes, queries, mutations, actions, internalActions/internalMutations, HTTP actions (AgentMail webhook + agent-queryable /registry/domains endpoint), scheduled functions, reactive queries + pagination (usePaginatedQuery), optimistic updates (withOptimisticUpdate), Convex Auth
- **Auth:** Convex Auth (password), per-user data isolation enforced server-side
- **Sponsors (all do real work):** Convex (backend/live/auth/hosting), AgentMail (per-user inbox in/out, real inbound webhook + outbound replies), Firecrawl (v2 scrape enriches each counterpart domain), OpenAI (typed email extraction; keyless rule-based fallback)
- **AI models:** OpenAI gpt-4o-mini (email extraction; falls back to a keyless rule-based extractor)
- **Started:** 2026-08-26T01:32:33Z
- **Last updated:** 2026-08-26T16:20:00Z

## Log

### 2026-08-26 - 5fc60d6
Wrote the design spec for the job copilot: an anti-phishing job-search assistant on Convex (backend, live board, auth, HTTP action for the inbound webhook), AgentMail (the inbox that sends and receives), Firecrawl (company/job crawl), and OpenAI (typed extraction from emails, reply drafting). Design only, no product code yet (`docs/superpowers/specs/2026-08-25-job-copilot-design.md`).

### 2026-08-26 - 7dd2c2a
Revised the spec after review. Verified AgentMail exposes the email Authentication-Results header, and reframed the trust signal to two honest states, verified and couldn't-verify, never "fake" (ATS mail legitimately fails DMARC alignment). Added a warn-and-acknowledge path instead of a hard block, a concrete onboarding path, and an MVP cut line around the Sep 15-17 AI Infra Summit conflict (`docs/superpowers/specs/2026-08-25-job-copilot-design.md`).

### 2026-08-26 - 0546744
Wrote the implementation plan: 11 TDD tasks covering the Convex schema, auth, the sender-auth parser, the AgentMail inbound webhook, OpenAI extraction with a forward-only stage machine, and the live board, plus a cuttable tail (Firecrawl enrichment, AI reply approve-and-send, search summary). No product code yet (`docs/superpowers/plans/2026-08-26-job-copilot-plan.md`).

### 2026-08-26 - 51f4465
Reconciled the plan with the hackathon page: flagged that Convex Auth is the v2 super-alpha (verify version and imports before installing), noted no OpenAI or Convex build credits are provided, and confirmed submission is on vibeapps.dev (`docs/superpowers/plans/2026-08-26-job-copilot-plan.md`).

### 2026-08-26 - working tree
Scaffolded the app and provisioned Convex. Vite + React 19 + TypeScript frontend, installed the `convex` client, and ran `npx convex dev` to create the dev deployment `agreeable-dogfish-859`. Convex wrote its AI guidelines, `AGENTS.md`, and `CLAUDE.md` into the repo. No product code or schema yet; the frontend host is Convex static hosting. (`package.json`, `convex/`, `.env.local`)

### 2026-08-26 - 9dadc16
Built the full product and reframed it. Backend (Convex): schema (domains, domainEdges, events, vault, applications, drafts, profiles + authTables); the honest sender-auth evaluator (verified vs couldn't-verify, never "fake"); AgentMail inbound webhook (httpAction, dedup, fast-ack); OpenAI extraction with a keyless rule-based fallback; a forward-only pipeline; the earned trust registry with an agent-queryable HTTP endpoint (`/registry/domains`); the disclosure gate (releases sensitive info only to verified counterparts, else holds for approval); a per-user vault; and trust-transfer (ATS hubs vouch for the companies that recruit through them). Frontend: terminal-native UI (Terminal.css shape + the founder's brand palette, Inter + JetBrains Mono), a stable react-force-graph trust map, pagination + search + skeleton/empty states across every list. Reframed from a job copilot to **Attest**, a general trust layer for a personal agent that talks to other agents/people over email about anything. 28/28 unit tests green. (`convex/`, `src/`)

### 2026-08-26 - sponsor integrations verified end-to-end
Wired the three non-Convex sponsors to do real work and proved each live. AgentMail: per-user inbox provisioning (each signup mints its own inbox, idempotent via client_id) + real inbound (external Gmail → webhook → Attest held an SSN request) + real outbound (approve → in-thread reply sent). Firecrawl: v2 scrape enriches each first-seen counterpart domain (verified against greenhouse.io, acme.com). OpenAI: typed extraction on real inbound. All no-op safely without a key so the demo never errors.

### 2026-08-26 - multi-user isolation
Made the app genuinely multi-tenant. Each user has their own AgentMail inbox; the trust registry stays global under the hood (collective reputation — every user's observations sharpen the scores) but each user only SEES the domains their own agent corresponded with. Inbound webhook attributes events to the inbox owner; every read query is auth-scoped by user. A cross-tenant test proves user B never sees user A's correspondents.

### 2026-08-26 - policy engine (the differentiator)
Generalized the hardcoded gate into a user-owned policy engine — structured rules the agent enforces, NO LLM in the enforcement path (an Inbin-style schema, not a prompt). `policies` table = one ordered ruleset per user; each rule = action (reply/payment/share_info/schedule/custom) + conditions (maxAmount, requireVerified, minGrade, appliesTo domain) + decision (allow/hold/deny). Pure `evaluatePolicy` (first-match-wins) + `decideAction` wrapper (policy first, safe default gate fallback; an unauthorized payment always holds). Right-side drawer to build rules visually. "Remember this decision": after an approve, one click writes a standing domain-scoped allow rule so the agent handles it itself next time. Wired into the pipeline with integration tests proving a verified $200 invoice auto-answers and a $5,000 wire holds. 77 unit tests green.

### 2026-08-26 - layout + polish
Restructured the dashboard: Conversations board full-width on top (all 6 stages on one row), then a 2×2 of Registry, Needs-you (held + remember), Activity log, and the Trust map. Split the overloaded inbox panel into two single-purpose panels. Decision history now reads the whole story (held → approved/dismissed). Removed dev cruft (auth-bypass preview path, obsolete CLI helper) before making the repo public.
