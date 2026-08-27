# Attest — Convex All Gas Hackathon Submission Copy

Paste these into the vibeapps.dev form fields. Trim to the form's limits.

---

## Name
**Attest**

## Tagline (one line)
The trust layer for your AI agent — it decides who your agent trusts and what it
may do on your behalf, deterministically, with no LLM in the decision path.

## Links
- **Live app:** https://attestagent.dev
- **Code:** https://github.com/yaotsakpo/attest
- **Demo video:** _[paste after recording]_

---

## What it does (short)
Your AI agent is starting to act for you over email — reading, replying, soon
paying invoices and sharing your details. Attest is the trust layer that governs
it. It earns a live A–F trust score for every counterpart from authenticated
mail (not SEO), holds anything it can't stand behind (an unverified sender, an
SSN request, a payment over your limit), and learns your rules so it handles the
next one itself. The gate is a deterministic policy engine — no LLM in the
decision path — so it can't be talked out of a hold by clever text.

## What it does (longer, if there's room)
A stranger emails your agent asking for your SSN. A content filter might be
persuaded. Attest says no — because the sender never authenticated, and an SSN
request is sensitive by rule.

Every inbound email runs a gate in priority order: **continuity** (has a trusted
counterpart been taken over?), **reputation** (proven-compromised anywhere?),
**sensitive** (SSN/bank request → always hold), **policy** (your own rules:
allow / hold / deny), then a safe default. First match wins; anything unmatched
holds for you. An unauthorized payment always holds, and a remembered payment
stays capped at the amount you approved.

Trust is derived from the authenticated channel, never from what a message says
about itself. A trust registry grades every sending domain from observed
DMARC-authenticated mail, and a trust graph shows how verified hubs (Greenhouse,
Lever) vouch for the companies that reach you through them — so a company
inherits trust the first time it appears.

Attest is the working implementation of three published papers (authority,
continuity, reputation), each a mechanism wired into the codebase and tested —
falsifiable, not just argued. 151 unit + integration tests, including
ground-truth gates and cross-tenant isolation.

---

## How each sponsor is used
- **Convex** — the entire backend and trust engine: schema with indexes;
  queries / mutations / actions / internal functions; HTTP actions (the AgentMail
  webhook + an agent-queryable `/registry/domains` API); scheduled functions for
  enrichment and outbound replies; reactive queries for the live UI; Convex Auth
  (passwordless email code); per-user data isolation enforced server-side.
- **AgentMail** — each user's agent inbox: real inbound email via webhook and
  outbound in-thread replies.
- **Firecrawl** — v2 scrape enriches each counterpart domain, so you know who
  you're about to share with.
- **OpenAI** — typed extraction of structured events from raw emails, with a
  keyless rule-based fallback.

## Tech stack
Convex, AgentMail, Firecrawl, OpenAI, React + Vite (frontend hosted on Vercel,
backend on Convex), TypeScript. Passwordless email-code auth via Convex Auth +
Resend.

---

## The research behind it (if there's a field for it)
- Authority — *Context References Over Payloads* — https://doi.org/10.5281/zenodo.21860668
- Continuity — *Agent-Identity Continuity* — https://doi.org/10.5281/zenodo.22119416
- Reputation — *Transferable and Local Evidence in Agent Reputation* — https://doi.org/10.5281/zenodo.22133570

## Try it
Open https://attestagent.dev, sign in with any email, and click **Load demo
data** — it seeds a live dashboard through the real pipeline and runs a guided
tour.
