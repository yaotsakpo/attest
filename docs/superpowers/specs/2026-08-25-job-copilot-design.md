# Job Copilot — Design Spec

*Convex All Gas Hackathon. Submissions due Sep 22 2026, 12:00 PM PT. Goal: win ($25K).*

## What it is

**"Your AI job-search copilot that can't be phished."** A job seeker applies to jobs using an AI-managed inbox. Every reply (confirmation, recruiter message, rejection, interview invite) lands there, gets typed by AI, and moves their pipeline live. Because job seekers are a top phishing target, the copilot **verifies every sender's authenticity** before moving a card to a risky stage or drafting a reply, and visibly flags fakes. It also crawls each company to prep the user, and drafts recruiter replies the user approves before sending.

**Positioning discipline (rubric-critical):** this is a *consumer app for job seekers*, never framed as email infrastructure, a trust layer, or a dev tool. Judges explicitly score down copycats and developer tools. The anti-phishing feature is a *consumer safety* benefit, not an infra pitch.

## Why it wins (differentiation)

A generic job tracker (Teal/Huntr/Simplify exist) does not win. Three edges, un-copyable because they come from the builder's specific prior work:

1. **Sender verification / anti-phishing (THE headline).** Parse SPF/DKIM/DMARC from AgentMail's raw email. Flag fake recruiters. Never move a card to a high-stakes stage or auto-draft a reply on an unverified sender. No competitor does this; it is a real safety benefit for a hunted user.
2. **Firecrawl-grounded interview prep.** Scrape company + role; OpenAI generates real prep and drafts replies citing the company's own site. "Prep, not just track."
3. **Approve-before-send (responsible AI).** AI drafts; the human approves before AgentMail sends. Rewarded by judges (esp. OpenAI). Also a clean Convex mutation flow.

The live board is the demo *hook*; sender-verification is the *why-you-win*.

## Stack (all four sponsors do real work — mandatory)

- **Convex** — backend + the "magic." Tables, `useQuery` live subscriptions (the self-moving board), mutations on every email event, Convex Auth (per-user pipelines), an httpAction receiving the AgentMail webhook, scheduled actions for extraction/enrichment.
- **AgentMail** — each user gets an AgentMail inbox (existing test inbox: `yaobuilds-6614@agentmail.to`). Inbound recruiter email arrives; outbound approved replies send. Central.
- **Firecrawl** — scrapes the job posting URL + company site → enrichment feeding prep and reply drafting.
- **OpenAI** — extracts typed fields from each email; drafts recruiter replies grounded in Firecrawl data; generates the "how's my search" summary.

## Data model (Convex, 5 tables)

```
users            // Convex Auth manages identity; per-user isolation on everything
  agentmailInbox    string   // "name@agentmail.to" — the apply-with address
  agentmailInboxId  string
  searchProfile     object?  // target role/context; feeds drafting (can start as one field)

applications     // one row per job applied to = the pipeline cards
  userId, company, role, jobUrl?
  stage            "applied"|"screen"|"technical"|"onsite"|"offer"|"rejected"|"ghosted"
  enrichment       object?  // Firecrawl'd company facts / prep
  trustState       "verified"|"unverified"|"mixed"  // rollup of its events' sender auth
  lastEventAt, createdAt

events           // one row per email = audit trail + what drives stage changes
  userId, applicationId?
  agentmailMsgId   string   // dedup key (idempotent webhook)
  fromAddress, subject, rawText
  senderVerified   boolean  // parsed from Authentication-Results (dmarc=pass)
  extracted        object?  // OpenAI: {company, role?, stage, eventType, interview_date?, next_action?, sentiment}
  eventType        "confirmation"|"recruiter_reply"|"interview_invite"|"rejection"|"offer"
  createdAt

drafts           // AI replies awaiting human approval (approve-before-send)
  userId, applicationId, eventId
  subject, body
  status           "pending_approval"|"approved"|"sent"|"discarded"
  createdAt
```

Convex-depth rationale: live `useQuery` on applications+events = self-moving board; `drafts` status enum = approve-before-send mutation flow; per-`userId` isolation = real auth; `agentmailMsgId` dedup = idempotent, production-grade webhook.

## The pipeline (hero path)

```
recruiter emails name@agentmail.to
  → AgentMail webhook → Convex httpAction /agentmail/webhook
      · verify it's a known inbox
      · dedup on agentmailMsgId (drop repeats)
      · parse Authentication-Results → senderVerified
      · write raw events row (extracted=null), FAST ACK
      · schedule internal.extract.run (action) — never block the webhook
  → OpenAI extraction action
      · strict JSON schema; return null for absent fields (NEVER guess — a fabricated
        interview date moving a card is the worst failure)
      · match to an existing application, in priority order: (1) same AgentMail thread id
        if AgentMail groups it; (2) exact company match on the OpenAI-extracted company;
        (3) from-address domain matches a known application's company domain. No match →
        create a new application (a recruiter from a company you didn't track yet still
        lands cleanly). Ties → most recent application for that company.
  → stage-transition mutation
      · map eventType→stage, FORWARD-ONLY (an old "thanks for applying" can't drag an
        interviewing candidate back)
      · GATE on senderVerified: an unverified sender may set a low-stakes stage but MUST NOT
        trigger risky actions (no "offer"/no auto-draft); card shows ⚠ flag
      · update applications.stage + lastEventAt, link the event
  → live useQuery pushes → board card moves, no refresh   ← THE HERO SHOT
```

**Firecrawl enrichment** runs as a separate, non-blocking action when an application is created or a jobUrl is added: scrape posting + company site → write `enrichment`. Never blocks the pipeline.

**Approve-before-send:** on a verified recruiter_reply, an action drafts a reply (OpenAI + Firecrawl'd company facts) → `drafts` row `pending_approval`. User edits/approves in the UI → mutation → action sends via AgentMail → status `sent`. Unverified senders never get an auto-draft.

## Error handling

Every external call (OpenAI, Firecrawl, AgentMail) is its own action with try/catch. A failure writes an error marker and never corrupts the pipeline or blocks the webhook. Extraction failure = event stays raw (still visible on the card), re-runnable. Webhook is idempotent via agentmailMsgId.

## UI screens (minimal, demo-focused)

1. **Onboarding** — Convex Auth sign-in; provision AgentMail address; "use this on your job applications."
2. **The Board** — live pipeline columns (Applied→Screen→Technical→Onsite→Offer, plus Rejected/Ghosted). Cards move on their own. Each shows company, stage, and a **trust badge** (✓ verified / ⚠ unverified). *Hero shot.*
3. **Application detail** — email thread, Firecrawl'd company prep, the AI-drafted reply with approve/send.
4. **"How's my search?"** — OpenAI funnel summary + insight.

## 3-minute video arc

- 0:00 "Job hunting is chaos — and job seekers are a top phishing target."
- 0:20 Apply with your copilot's inbox address.
- 0:40 HERO: send a real recruiter email live → board moves Applied→Interview, no refresh.
- 1:20 TWIST: send a spoofed "Google recruiter" email → card flags ⚠ "failed authentication, not really Google," refuses to draft a reply. *The winning moment.*
- 2:00 Firecrawl prep + approve-a-reply.
- 2:40 "Built on Convex, AgentMail, Firecrawl, OpenAI." Live URL.

## Reuse from SentSignal (fast-track, not submitted)

SentSignal (`~/Marketing/flightdeck`, FastAPI outreach product) is the reference. Port these proven patterns to the mandated stack:
- `enrich.py` shape: crawl → score/enrich against a profile → set status.
- `personalize.py` approval split: draft → pending_approval → approved → send.
- reply-webhook → parse → update-state pipeline.
- forward-only status machine discipline; evidence-based (never fabricate) enrichment.

## Build order

1. Convex project + schema + Convex Auth.
2. AgentMail inbox wiring + webhook httpAction (dedup + fast ack).
3. OpenAI extraction action + Authentication-Results parsing (senderVerified).
4. Stage-transition mutation (forward-only + verification gate).
5. Live board UI (the hero shot).
6. Firecrawl enrichment action.
7. AI reply drafting + approve/send via AgentMail.
8. Spoofed-email safety flag (the differentiator, visible).
9. "How's my search" summary.
10. Polish, deploy to convex.site, record video, X/LinkedIn post, hackathon.md.

## Submission checklist (from the rules)

- [ ] Public repo, `hackathon.md` at root, run `/hackathon` after each session
- [ ] Live URL on convex.site (no localhost)
- [ ] <3-min video (click through the real product, talk less)
- [ ] X/LinkedIn post tagging @convex @OpenAI @firecrawl @agentmail
- [ ] Submit repo + live URL + video on vibeapps.dev before Sep 22 12pm PT
- [ ] Register on Luma (unlocks $20k Firecrawl credits)

## Out of scope (YAGNI for the 3 weeks)

- Multi-inbox / team features. Mobile app. Payment. Real-recruiter integrations (ATS). A browser extension for auto-apply (tempting, but a separate build). Anything not visible in the 3-minute demo.
