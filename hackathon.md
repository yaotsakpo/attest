# Hackathon log

- **Project:** Warden
- **Event:** Convex All Gas Hackathon
- **What it does:** A trust layer for your personal AI agent. Your agent talks to other agents and people over email (AgentMail), and Warden never lets it release sensitive info (SSN, bank details, address) to a counterpart it can't verify. It earns a live trust registry from observed DMARC-authenticated email, shows the agent's decisions honestly (auto-answered vs held-for-approval), and visualizes who it trusts as a force-directed graph where verified ATS-style hubs vouch for the companies that recruit through them.
- **Live app:** not deployed
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** https://agreeable-dogfish-859.convex.cloud (dev)
- **Components:** none
- **Convex features:** schema, indexes, queries, mutations, actions, HTTP actions (AgentMail webhook + agent-queryable /registry/domains endpoint), scheduled functions, reactive pagination (usePaginatedQuery), Convex Auth
- **Auth:** Convex Auth (password)
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
Built the full product and reframed it. Backend (Convex): schema (domains, domainEdges, events, vault, applications, drafts, profiles + authTables); the honest sender-auth evaluator (verified vs couldn't-verify, never "fake"); AgentMail inbound webhook (httpAction, dedup, fast-ack); OpenAI extraction with a keyless rule-based fallback; a forward-only pipeline; the earned trust registry with an agent-queryable HTTP endpoint (`/registry/domains`); the disclosure gate (releases sensitive info only to verified counterparts, else holds for approval); a per-user vault; and trust-transfer (ATS hubs vouch for the companies that recruit through them). Frontend: terminal-native UI (Terminal.css shape + the founder's brand palette, Inter + JetBrains Mono), a stable react-force-graph trust map, pagination + search + skeleton/empty states across every list. Reframed from a job copilot to **Warden**, a general trust layer for a personal agent that talks to other agents/people over email about anything. 28/28 unit tests green. (`convex/`, `src/`)
