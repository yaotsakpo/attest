# Attest — Convex All Gas Hackathon Submission Copy

Hybrid framing: **lead with the everyday app** (stop email scams), reveal the
depth (agent trust layer + published research) as the "how." Paste into the
vibeapps.dev form; trim to its limits.

---

## Name
**Attest**

## Tagline (one line)
Let your AI agent run your inbox without getting scammed. Attest verifies who
really sent each email — so it auto-handles the verified recruiter and the $20
invoice, and holds the SSN request and the $5k wire for you.

## Links
- **Live app (convex.site):** https://dynamic-egret-864.convex.site
- **Live app (custom domain):** https://attestagent.dev
- **Code:** https://github.com/yaotsakpo/attest
- **Demo video:** _[paste after recording]_
- **Build post (X/LinkedIn):** _[paste after posting]_

---

## What it does (the everyday-app pitch — lead with this)
More and more people are letting an AI agent run their inbox — most visibly a job
search: the agent applies, replies to recruiters, shares your details, and
handles the back-and-forth. The catch: your agent can't tell a real recruiter
from a scam any better than you can, and a job hunt is exactly where you're asked
for sensitive info (salary, availability, references, and yes — SSN for
background checks) over and over.

Attest is the assistant that does the telling-apart. For every email it asks:
**did this actually come from who it claims?** It grades every sender from real
email authentication (DMARC), and then it decides both ways:

- **YES** — a *verified* recruiter asks for your availability and salary range?
  You approved sharing those with verified senders once, so it just replies for
  you. A *verified* $20 invoice under your limit? It pays it. This is the payoff:
  you can finally let an agent hold your details and act for you.
- **NO** — an SSN request? Held — always, even from a verified sender (sensitive
  PII can never be auto-shared). A $5,000 wire from an address that never
  authenticated? Held. A "confirm your bank details" email? Held.

The difference is provable: the exact same info request from an *unverified*
sender holds. Verification is what unlocks the yes.

**Also protects the most vulnerable:** set it up for an aging parent or anyone
who can't easily spot a fake, and it does the checking they can't — the scam gets
held before it reaches them, while their real mail flows.

## The depth underneath (the "how" — reveal after the hook)
Attest never trusts what a message *says* about itself; it derives trust from the
authenticated channel. Every message runs a deterministic gate — **continuity**
(has a trusted sender been taken over?), **reputation** (flagged anywhere?),
**sensitive** (SSN/bank request → always hold), **your policy**, then a safe
default. First match wins; anything unmatched holds. **No LLM in the decision
path**, so it can't be persuaded by text.

A live trust registry grades every sending domain from observed authenticated
mail (not SEO), and a trust graph shows how verified hubs (Greenhouse, Lever)
vouch for the companies that reach you through them.

It's the working implementation of three published papers (authority, continuity,
reputation), each a mechanism wired into the codebase and tested — 156 unit +
integration tests, including ground-truth gates and cross-tenant isolation.

---

## How each sponsor does real work
- **Convex** — the entire backend: schema + indexes; queries / mutations /
  actions / internal functions; HTTP actions (the AgentMail webhook + a public
  `/registry/domains` API); scheduled functions for enrichment + replies;
  reactive live-updating UI; Convex Auth (passwordless email code); per-user data
  isolation enforced server-side. Hosted on convex.site.
- **AgentMail** — each user's real inbox: inbound email via webhook, outbound
  in-thread replies.
- **Firecrawl** — scrapes each counterpart's site so you (and the assistant) know
  who you're about to deal with before sharing anything.
- **OpenAI** — extracts structured details from raw emails (with a keyless
  rule-based fallback).

## Tech stack
Convex (backend + hosting), AgentMail, Firecrawl, OpenAI, React + Vite,
TypeScript. Passwordless email-code auth (Convex Auth + Resend).

---

## The research (if there's a field)
- Authority — *Context References Over Payloads* — https://doi.org/10.5281/zenodo.21860668
- Continuity — *Agent-Identity Continuity* — https://doi.org/10.5281/zenodo.22119416
- Reputation — *Transferable and Local Evidence in Agent Reputation* — https://doi.org/10.5281/zenodo.22133570

## Try it
Open the live URL, sign in with any email, and click **Load demo data** — it
seeds a live inbox through the real pipeline and runs a guided tour so you can
watch it hold the scam and answer the real ones.
