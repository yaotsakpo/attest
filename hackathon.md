# Hackathon log

- **Project:** Attest
- **Event:** Convex All Gas Hackathon
- **What it does:** A trust layer for your personal AI agent. Your agent talks to other agents and people over email (AgentMail), and Attest governs what it may do on your behalf. It earns a live trust registry from observed DMARC-authenticated email, holds anything it can't stand behind (an unverified sender, a request for sensitive info, a payment) for your approval, and enforces a user-defined **policy engine** — structured rules you set (e.g. "auto-pay verified counterparts under $500, hold everything else"). It visualizes who it trusts as a force-directed graph where verified ATS-style hubs vouch for the companies that reach through them.
- **Live app:** https://dynamic-egret-864.convex.site (also https://attestagent.dev)
- **Repo:** https://github.com/yaotsakpo/attest (public)
- **Frontend:** Convex static hosting (also mirrored on a custom domain)
- **Convex deployment (prod):** https://dynamic-egret-864.convex.cloud
- **Components:** @convex-dev/static-hosting; raw fetch for AgentMail + Firecrawl
- **Convex features:** schema, indexes, queries, mutations, actions, internalActions/internalMutations, HTTP actions (AgentMail webhook + agent-queryable /registry/domains endpoint), scheduled functions, reactive queries + pagination (usePaginatedQuery), optimistic updates (withOptimisticUpdate), Convex Auth
- **Auth:** Convex Auth, passwordless email-code sign-in (no password to forget/reset), per-user data isolation enforced server-side
- **Sponsors (all do real work):** Convex (backend/live/auth/hosting), AgentMail (per-user inbox in/out, real inbound webhook + outbound replies), Firecrawl (v2 scrape enriches each counterpart domain), OpenAI (typed email extraction; keyless rule-based fallback)
- **AI models:** OpenAI gpt-4o-mini (email extraction; falls back to a keyless rule-based extractor)
- **Tests:** 156 unit + integration (npx vitest run), incl. ground-truth gates + cross-tenant isolation
- **Started:** 2026-08-26T01:32:33Z
- **Last updated:** 2026-08-30

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

### 2026-08-27 - prod deploy + passwordless auth
Deployed backend + static frontend to prod (convex.site). Replaced the password provider with passwordless email-code sign-in (Convex Auth Email provider + Resend), since a real user can't "forget password" on an agent. Set all sponsor keys on prod, ran auth setup, verified the live site serves and the /registry API responds. Later pointed a custom domain (attestagent.dev) at the same app via Vercel static hosting while the backend stays 100% on Convex, so all four sponsors are intact and the app runs on Convex.

### 2026-08-27 - landing page (high-design)
Built a real landing page in the terminal-editorial brand: a full-bleed 3D rotating node-sphere hero (canvas, Fibonacci sphere, projected each frame), a living atmospheric gradient, the ATTEST wordmark, line-art glyph icons per mechanism, the gate as a vertical pipeline with a traveling pulse, and a live "attest · gate" terminal that replays real gate decisions. Landing → sign-in flow with back-links. All theme-aware, reduced-motion safe, zero new runtime deps.

### 2026-08-27 - "Load demo data" + guided tour
Added a one-click demo seed (auth-scoped action) that runs a coherent set of realistic emails through the REAL pipeline (ingest → extraction → the disclosure gate), so the board, registry, trust graph, activity log and gate verdicts all populate with data the actual engine produced, not hand-written rows. Then a guided spotlight tour walks each panel with an explanation. Makes the app instantly demoable for a judge signing in cold.

### 2026-08-28 - 3D trust graph
Rebuilt the trust map as a real interactive 3D node-sphere (rotate/orbit/click), matching the hero, with rank + level-of-detail label decluttering so it stays legible as the graph grows (agent/hubs/held always labelled; ordinary counterparts label on front-facing/hover). Curved-then-straightened edges; depth-shaded lit-sphere nodes. Dropped the react-force-graph/three dependencies in favor of a dependency-free canvas renderer (bundle down ~180 KB).

### 2026-08-29 - the YES cases (not just holds) + proof
Sharpened the product from "blocks scams" to "let your agent act for you, safely." Added the payoff to the demo: a VERIFIED recruiter asking for non-sensitive info (availability, salary range) auto-answers, and a VERIFIED $20 invoice under the user's limit auto-pays. Alongside the holds: an SSN request holds ALWAYS (containment guarantee — sensitive PII can never auto-share, even from a verified sender), and an unverified $5,000 wire holds. New test file proves the whole yes/no story through the real gate, incl. that the SAME info request from an UNVERIFIED sender holds — verification is what unlocks the yes. 156 tests green. Reframed hero + title + submission copy consumer-first (job-seeker-led everyday app; vulnerable users as the key "also protects" case), with the agent-trust/research depth underneath.

### 2026-08-30 - OG image + submission
Added a 1200×630 OG image and social meta (attestagent.dev/og.png) so the submission link renders a rich card. Verified prod end-to-end (both URLs serve the current build, backend + demo seed live). Submitted on vibeapps.dev.
