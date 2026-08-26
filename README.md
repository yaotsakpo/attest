# Attest

**A stranger just emailed your AI agent asking for your SSN. Attest is the reason it said no.**

Your agent is starting to act for you — reading email, replying, soon paying invoices and sharing your details. The moment it talks to *other* agents and people, one question decides everything: **who is it allowed to trust, and what is it allowed to do on your behalf?**

Attest is the trust layer that answers it. Give your agent an email inbox and Attest does three things:

- **Earn** — it builds a live trust score for every counterpart from the mail it actually receives (authenticated, not SEO).
- **Hold** — it refuses to act on anything it can't stand behind: an unverified sender, a request for your SSN, a payment over your limit. That waits for you.
- **Learn** — approve something once and it becomes a standing rule, so your agent handles it itself next time.

You set the policy in plain, structured rules. It enforces them — deterministically, with no LLM in the decision path.

Built for the **Convex All Gas Hackathon** on Convex + AgentMail + Firecrawl + OpenAI.

---

## Earn · Hold · Learn

**Earn.** Every inbound email is checked for DMARC authentication. A domain's grade (A–F) is *earned* from observed authenticated mail — not SEO, not a hardcoded allowlist. The registry is the app's spine, exposed to agents at `GET /registry/domains`. It never says "fake" — only "verified" or "couldn't verify", because legitimate mail routed through tools routinely fails DMARC alignment.

**Hold.** A user-owned **policy engine** (structured rules, no LLM in the enforcement path) governs what the agent may do on its own: *reply / payment / share info / custom*, each with conditions (amount threshold, require-verified, min-grade, per-domain scope) and an allow / hold / deny decision. First match wins; anything unmatched holds. An unauthorized payment **always** holds, and a remembered payment is capped at the amount you approved.

**Learn.** Approve a held item and Attest offers to *remember the decision* — one click writes a standing rule so the agent handles that counterpart itself next time.

### Under the hood

- **A trust graph** renders the registry: verified hubs (greenhouse.io, lever.co…) vouch for the companies that reach through them, so a company inherits trust the first time it appears.
- **Multi-tenant by construction.** Each user gets their own AgentMail inbox. The registry is global (collective reputation — everyone's observations sharpen the scores) but each user only sees the domains their own agent corresponded with.

## The principle

Attest applies a single idea: **derive trust from the authenticated channel, not from message content.** A message that *claims* to be from a company means nothing; a message that *authenticated* as that domain is evidence. The agent never trusts what a message says about itself.

This is the same principle behind my published research, [*Context References Over Payloads: Authority Scoped to the Predicate, Not the Principal*](https://doi.org/10.5281/zenodo.21860668) (Zenodo, with formal proofs) — which shows that an agent deriving authority from the authenticated channel is *structurally* immune to a spoofed instruction, no matter how convincing the text. That work secures which instructions an agent obeys; Attest applies the same principle one layer out, to which counterparts it trusts and what it may do on your behalf.

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

78 unit + integration tests (`npx vitest run`), including ground-truth gates: a verified $200 invoice auto-answers, a $5,000 wire holds, a remembered payment stays capped at the approved amount, and cross-tenant isolation (user B never sees user A's data).

## Run locally

```bash
npm install
npx convex dev        # provisions the backend, watches convex/
npm run dev           # Vite frontend

# Backend env (Convex dashboard → Settings → Environment Variables):
#   AGENTMAIL_API_KEY, FIRECRAWL_API_KEY, OPENAI_API_KEY (all optional —
#   each integration no-ops safely without its key)
```

## Any counterpart

Attest works for anyone your agent corresponds with over email — vendors, clients, recruiters, services. The conversations board is one view of the same trust engine that powers the registry, the gate, and the graph.
