# Hackathon log

- **Project:** jobcopilot
- **Event:** Convex All Gas Hackathon
- **What it does:** An AI job-search copilot: applications you make with an AgentMail inbox, where recruiter replies land and move a live Convex pipeline board, and every sender's email authentication is shown honestly (verified / couldn't verify).
- **Live app:** not deployed
- **Repo:** none
- **Frontend:** Convex static hosting
- **Convex deployment:** https://agreeable-dogfish-859.convex.cloud (dev)
- **Components:** none
- **Convex features:** none yet
- **Auth:** none
- **AI models:** none
- **Started:** 2026-08-26T01:32:33Z
- **Last updated:** 2026-08-26T08:19:01Z

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
