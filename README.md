# Warden

**A trust layer for your personal AI agent.**

Your agent is starting to act for you — reading email, replying, soon paying invoices and sharing your details. The moment it talks to *other* agents and people, one question decides everything: **who is it allowed to trust, and what is it allowed to do on your behalf?**

Warden is that layer. It gives your agent an email inbox, earns a live trust registry from the mail it actually receives, and refuses to act on anything it can't stand behind — an unverified sender, a request for sensitive info, a payment over a limit you set. You define the rules; it enforces them.

Built for the **Convex All Gas Hackathon** on Convex + AgentMail + Firecrawl + OpenAI.

---

## What it does

- **Earns trust, doesn't assume it.** Every inbound email is checked for DMARC authentication. A domain's grade (A–F) is *earned* from observed authenticated mail — not SEO, not a hardcoded allowlist. The registry is the app's spine, exposed to agents at `GET /registry/domains`.

- **Holds what it can't stand behind.** A disclosure gate holds any email that asks for sensitive info (SSN, bank, address) or comes from a sender it couldn't verify. Held items wait for your one-click approve/dismiss. It never says "fake" — only "verified" or "couldn't verify", because legitimate ATS mail routinely fails DMARC alignment.

- **Enforces your policy.** A user-owned **policy engine** (structured rules, no LLM in the enforcement path) governs what the agent may do on its own: *reply / payment / share info / schedule / custom*, each with conditions (amount threshold, require-verified, min-grade, per-domain scope) and an allow / hold / deny decision. First match wins; anything unmatched holds. An unauthorized payment **always** holds.

- **Learns from your approvals.** Approve a held item and Warden offers to *remember the decision* — one click writes a standing rule so the agent handles that counterpart itself next time.

- **Shows who vouches for whom.** A force-directed trust graph renders the registry: verified ATS hubs (greenhouse.io, lever.co…) vouch for the companies that reach through them, so a company inherits trust the first time it appears.

- **Multi-tenant by construction.** Each user gets their own AgentMail inbox. The registry is global under the hood (collective reputation — everyone's observations sharpen the scores) but each user only sees the domains their own agent corresponded with.

## The four sponsors, each doing real work

| Sponsor | Role |
|---|---|
| **Convex** | Backend, reactive queries, auth, scheduled functions, HTTP webhook + public API, static hosting |
| **AgentMail** | Per-user agent inbox — real inbound (webhook) and outbound (in-thread replies) |
| **Firecrawl** | v2 scrape enriches each counterpart domain so you know *who* you're about to share with |
| **OpenAI** | Typed extraction from raw emails (with a keyless rule-based fallback) |

## Convex depth

Schema with indexes; queries / mutations / actions / internalActions / internalMutations; HTTP actions (the AgentMail webhook and an agent-queryable `/registry/domains` endpoint); scheduled functions (`ctx.scheduler.runAfter`) for enrichment + outbound replies; reactive queries with `usePaginatedQuery` and `withOptimisticUpdate` for instant UI; per-user data isolation enforced server-side via Convex Auth.

## Architecture

```
inbound email ─▶ AgentMail webhook ─▶ httpAction (resolve inbox owner)
                                         │
                                         ▼
                       ingestInbound: sender-auth verdict, dedup,
                       observe domain (+ hub/company trust-transfer)
                                         │
                              schedule OpenAI extraction
                                         │
                                         ▼
                     applyExtraction: decideAction(policy first,
                     safe default gate fallback) ─▶ auto-answer | hold
                                         │
                              auto-answer ─▶ AgentMail reply
```

## Tests

77 unit + integration tests (`npx vitest run`), including ground-truth gates: a verified $200 invoice auto-answers, a $5,000 wire holds, and cross-tenant isolation (user B never sees user A's data).

## Run locally

```bash
npm install
npx convex dev        # provisions the backend, watches convex/
npm run dev           # Vite frontend

# Backend env (Convex dashboard → Settings → Environment Variables):
#   AGENTMAIL_API_KEY, FIRECRAWL_API_KEY, OPENAI_API_KEY (all optional —
#   each integration no-ops safely without its key)
```

## Not job search

Warden began as a job-application copilot and grew into the general case: a trust layer for any personal agent that corresponds over email — vendors, clients, services, anyone. The job-pipeline board is one view of the same conversation engine.
