# Attest — Convex All Gas Hackathon Submission Copy

Hybrid framing: **lead with the everyday app** (stop email scams), reveal the
depth (agent trust layer + published research) as the "how." Paste into the
vibeapps.dev form; trim to its limits.

---

## Name
**Attest**

## Tagline (one line)
An assistant on your inbox that refuses to get you scammed — it verifies who
actually sent each email and holds anything sketchy (an SSN request, a fake
invoice, an unverified wire) until you say yes.

## Links
- **Live app (convex.site):** https://dynamic-egret-864.convex.site
- **Live app (custom domain):** https://attestagent.dev
- **Code:** https://github.com/yaotsakpo/attest
- **Demo video:** _[paste after recording]_
- **Build post (X/LinkedIn):** _[paste after posting]_

---

## What it does (the everyday-app pitch — lead with this)
Everyone's inbox is full of recruiters, vendors, invoices, and the occasional
stranger asking for something sensitive. Most of us can't tell a real message
from a convincing fake — that's how phishing works.

Attest is an assistant that sits on your inbox and does the checking for you. For
every email it asks one question: **did this actually come from who it claims?**
It grades every sender from real email authentication (DMARC), auto-handles the
ones it can verify, and **holds** anything it can't stand behind — a request for
your Social Security Number, a $5,000 wire from an address that never
authenticated, a "confirm your bank details" onboarding email. Those wait for
you. Approve one and it remembers the rule, so it handles the next one itself.

You get the convenience of an assistant that answers routine mail, without the
risk of it being talked into handing over your details by clever wording.

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
reputation), each a mechanism wired into the codebase and tested — 151 unit +
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
