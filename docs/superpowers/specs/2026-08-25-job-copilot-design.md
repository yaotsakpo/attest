# Job Copilot — Design Spec

*Convex All Gas Hackathon. Submissions due Sep 22 2026, 12:00 PM PT. Goal: win ($25K).*

## What it is

**"Your AI job-search copilot that can't be phished."** A job seeker applies to jobs using an AI-managed inbox. Every reply (confirmation, recruiter message, rejection, interview invite) lands there, gets typed by AI, and moves their pipeline live. Because job seekers are a top phishing target, the copilot **verifies every sender's authenticity** before moving a card to a risky stage or drafting a reply, and visibly flags fakes. It also crawls each company to prep the user, and drafts recruiter replies the user approves before sending.

**Positioning discipline (rubric-critical):** this is a *consumer app for job seekers*, never framed as email infrastructure, a trust layer, or a dev tool. Judges explicitly score down copycats and developer tools. The anti-phishing feature is a *consumer safety* benefit, not an infra pitch.

## Why it wins (differentiation)

A generic job tracker (Teal/Huntr/Simplify exist) does not win. Three edges, un-copyable because they come from the builder's specific prior work:

1. **Sender verification / trust signal (THE headline).** Parse SPF/DKIM/DMARC from AgentMail's raw email (VERIFIED 2026-08-25: AgentMail exposes `Authentication-Results` in the message `headers` field; parses cleanly to spf/dkim/dmarc verdicts). No competitor does this; it is a real safety benefit for a hunted user (job seekers are a top phishing target).

   **CRITICAL HONESTY RULE (do not build the naive version):** DMARC failure does NOT mean spoofed. Legitimate recruiting mail routed through ATS platforms (Greenhouse, Lever, Workday, LinkedIn) frequently fails strict DMARC *alignment* against the company's own domain. Flagging a real recruiter as "fake" is a WORSE failure than not checking — it could make a user ignore a genuine opportunity. So:
   - Two states only: **"verified"** (dmarc=pass, aligned) and **"couldn't verify"** — never "spoofed"/"fake".
   - Copy is a transparent uncertainty statement with the reason, e.g. "We couldn't verify this sender: DMARC did not align with acme.com. Real recruiters sometimes send via tools that trip this — treat as lower confidence, not fake." NEVER "likely not really Acme."
   - "Unverified" = *lower confidence*, not *presumed fake*. Same discipline as the Inbin/PSAP review: it proves "verified channel" vs "unverified channel", NOT "safe" vs "attack".
2. **Firecrawl-grounded interview prep.** Scrape company + role; OpenAI generates real prep and drafts replies citing the company's own site. "Prep, not just track."
3. **Approve-before-send (responsible AI).** AI drafts; the human approves before AgentMail sends. Rewarded by judges (esp. OpenAI). Also a clean Convex mutation flow.

The live board is the demo *hook*; sender-verification is the *why-you-win*.

## THE SPINE (added 2026-08-26 — this is what makes it NOT a job tracker)

A job tracker with a security badge is forgettable (and too close to SentSignal/Teal/Huntr). The reframe: **the app is an agent building its own trust map of the internet, live, using the job search as the data source.**

The human web is indexed for humans, SEO, ads, pages engineered to look relevant. Agents inherit that polluted index and get fooled. So this agent earns its OWN trust surface: every DMARC-aligned email it receives is a verifiable data point ("this domain is real and behaves"). It accumulates those into a **live, per-domain trust registry** and exposes it as a **read-only endpoint an agent could query** ("give me domains you actually trust"). Earned reputation, not SEO.

- **Not** "track my applications" → **"watch an agent learn which domains on the internet it can trust, from real signal."**
- Same PSAP/ICP DNA leveled up: sender verification = trust for ONE email; the registry = trust ACCUMULATED into a queryable asset.
- Hackathon scope is a LIGHTWEIGHT, single-user seed of a much larger Inbin-scale idea (parked). We label it as a seed; we do not overclaim a global reputation graph.
- This replaces the weak "how's my search" summary (old Task 10) as the thing built on top of the foundation.
- Demo spine order: (1) board moves on its own = wow; (2) the trust registry grows live as mail lands = the insight; (3) the couldn't-verify catch = the safety punchline; (4) Firecrawl prep + approve-a-reply = useful.

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
  senderVerified   boolean  // true iff dmarc=pass AND aligned; else false = "couldn't verify"
  verifyReason     string?   // human-readable why-not, e.g. "DMARC didn't align with acme.com"
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
      · GATE on senderVerified: an unverified sender's email still moves the card and is fully
        visible, but any RISKY downstream action (auto-drafting a reply, or acting on an "offer"
        that asks for money/credentials) is gated behind an explicit user acknowledgment, NOT a
        hard block. The card shows a transparent "couldn't verify (reason)" note, not an
        accusation. Verified senders skip the acknowledgment. (A hard block would break the
        product for legit ATS-routed recruiters — see the honesty rule in "Why it wins".)
      · update applications.stage + lastEventAt, link the event
  → live useQuery pushes → board card moves, no refresh   ← THE HERO SHOT
```

**Firecrawl enrichment** runs as a separate, non-blocking action when an application is created or a jobUrl is added: scrape posting + company site → write `enrichment`. Never blocks the pipeline.

**Approve-before-send:** on a verified recruiter_reply, an action drafts a reply (OpenAI + Firecrawl'd company facts) → `drafts` row `pending_approval`. User edits/approves in the UI → mutation → action sends via AgentMail → status `sent`. Unverified senders never get an auto-draft.

## Error handling

Every external call (OpenAI, Firecrawl, AgentMail) is its own action with try/catch. A failure writes an error marker and never corrupts the pipeline or blocks the webhook. Extraction failure = event stays raw (still visible on the card), re-runnable. Webhook is idempotent via agentmailMsgId.

## UI screens (minimal, demo-focused)

1. **Onboarding** — Convex Auth sign-in; provision AgentMail address. **How mail actually reaches it (concrete):** primary path is "use this as your contact email on applications going forward" — applications reply to the address of record, so recruiter replies/confirmations/rejections land natively, no forwarding discipline. Secondary path: forward/BCC an existing thread. Onboarding states this plainly so the user knows the address fills as they apply. For the demo hero shot we send a realistic recruiter email TO the address live (exactly how a real reply arrives).
2. **The Board** — live pipeline columns (Applied→Screen→Technical→Onsite→Offer, plus Rejected/Ghosted). Cards move on their own. Each shows company, stage, and a **trust badge** (✓ verified / ⚠ unverified). *Hero shot.*
3. **Application detail** — email thread, Firecrawl'd company prep, the AI-drafted reply with approve/send.
4. **"How's my search?"** — OpenAI funnel summary + insight.

## 3-minute video arc

- 0:00 "Job hunting is chaos — and job seekers are a top phishing target."
- 0:20 Apply with your copilot's inbox address.
- 0:40 HERO: send a real recruiter email live → board moves Applied→Interview, no refresh.
- 1:20 TWIST: send an unaligned/spoofed "recruiter" email → card shows a transparent "couldn't verify this sender (DMARC didn't align) — treat as lower confidence" note, and any risky action asks for explicit acknowledgment first. *The winning moment: the copilot is honest about what it can and can't prove, instead of blindly trusting email like every other tracker.*
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

## Timeline & MVP cut line

Kickoff Aug 25, submission **Sep 22 12pm PT** (~4 weeks). **Conflict to plan around:** the AI Infra Summit hackathon runs **Sep 15-17**, inside this window, so ~3 usable days are consumed mid-stream. Real build time is closer to 2.5 weeks. Therefore the cut line is explicit, not aspirational:

- **MUST-HAVE (the demo cannot exist without these) — finish by ~Sep 12, before the Summit:**
  Convex schema + auth · AgentMail inbox + inbound webhook httpAction · OpenAI extraction + Authentication-Results parsing (the trust signal) · forward-only stage mutation · **the live board hero shot** · the verified/couldn't-verify badge. This alone is a complete, winning demo.
- **STRONG-BUT-CUTTABLE (week 3, after the Summit, cut first if tight):**
  Firecrawl company enrichment · AI reply drafting + approve/send · "How's my search" summary.
- **Order enforces this:** build steps 1-5 + 8 (the trust badge) are must-have; 6, 7, 9 are the cuttable tail. If the Summit eats more time than planned, we ship the must-have set and record the video on that; it still ticks every rubric line (all 4 sponsors do real work: Convex live + AgentMail in + OpenAI extract; Firecrawl becomes the one at-risk sponsor, so if week 3 is doomed, do the SMALLEST Firecrawl integration, one company scrape shown on a card, to keep all four represented).

## Out of scope (YAGNI for the 3 weeks)

- Multi-inbox / team features. Mobile app. Payment. Real-recruiter integrations (ATS). A browser extension for auto-apply (tempting, but a separate build). Anything not visible in the 3-minute demo.
