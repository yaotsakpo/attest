# Attest — Demo Video Script (~2.5 min)

**Framing rule (important):** OPEN CONSUMER-FIRST. This is an everyday app that
stops you getting scammed by email. Do NOT open with "trust layer for your AI
agent" — that reads as a developer tool and scores low. Lead with the scam, show
it get held, THEN reveal the depth.

**Setup before recording:** sign in on the live URL, click **Load demo data** so
the inbox is full, then scroll to the top. Record at 1080p, mic ON
(Cmd+Shift+5 → Options → Microphone). Under 3 minutes. Talk less, click more.

---

## 0:00 — The hook: the scam (open here, NOT on the tagline)
Start on the landing page, then get to the dashboard quickly. Or open directly on
the dashboard with demo data loaded.

> *"More and more of us are letting an AI agent run our inbox — especially
> job-hunting: it applies, it replies to recruiters, it shares your details. The
> problem is your agent can't tell a real recruiter from a scam any better than
> you can. Here's the assistant that does — it says yes to the verified ones and
> no to the fakes."*

(Everyday, agent-native, and it's who actually uses agents today. Vulnerable
users — elderly parents, anyone who can't easily spot a fake — are the same
story: the assistant does the checking they can't.)

---

## 0:20 — The money moment: it holds the scam
Go straight to **Held for you**. Point at **offer-onboarding.co → "send your
SSN"**.

> *"A 'new job onboarding' email just asked for my Social Security Number. It
> looks official. But this assistant held it — because the sender never actually
> authenticated, and asking for an SSN is sensitive. It's waiting for me instead
> of handing it over."*

Then **vendor-invoices.net → $5,000 wire**:

> *"Same with a $5,000 wire from an address that can't be verified. Held. It even
> caps a remembered payment at the amount I approved."*

---

## 0:50 — The contrast: it says YES to the real ones (the payoff)
This is the other half of the story — it doesn't just block, it *acts* when it's
safe. Point at the verified ones.

**Stripe** (verified recruiter asking for availability + salary range):
> *"Here's the payoff. Stripe actually authenticated — DMARC passed, aligned. It
> asked for my availability and salary range. Normally you'd never let an agent
> answer that automatically — but I approved 'share these with verified
> recruiters' once, so the assistant just replied for me. Info I'd otherwise
> retype on every single application, handled."*

**Vercel** ($20 verified invoice):
> *"Same with a real $20 invoice from a verified sender — under the limit I set,
> so it just paid it. But the $5,000 wire from an address it couldn't verify? It
> held that. Verified and small: yes. Unverified or over the limit: no."*

> *"That's the whole point — you can finally let an agent hold your details and
> act for you, because it only says yes to senders it can prove are real."*

---

## 1:15 — How it knows: the trust registry
Point at the **Registry** (A–F grades).

> *"It's not guessing. Every sender earns a grade from real email
> authentication — not from how famous the company is. This registry is the
> engine, and it's even exposed as an API other apps can query."*

---

## 1:35 — The depth reveal (now you can go deeper)
> *"Under the hood, it never trusts what a message *says* about itself — only
> what authenticated. Every email runs a deterministic gate: is a trusted sender
> being impersonated, are they flagged anywhere, is this a sensitive request,
> what are my rules. First match wins. And there's no AI in that decision — so it
> can't be talked into a mistake by clever wording."*

Expand the **trust graph** (⤢), orbit it once.

> *"This is the live map of who vouches for whom — verified hubs like Greenhouse
> and Lever vouch for the companies that reach me through them."*

---

## 2:05 — Why it's credible + the close
> *"It's built on Convex end to end — the backend, the live updates, auth, the
> public API. AgentMail runs the real inbox, Firecrawl checks who each sender is,
> OpenAI reads the emails. And it's the working implementation of three published
> research papers, with 156 tests behind it."*

> *"It's live — sign in with any email and it'll load a demo inbox and walk you
> through it. That's Attest: it lets your agent act for you, and says yes only to
> the senders it can prove are real."*

End on the dashboard or the trust graph.

---

## Beat checklist (keep it tight, <3 min)
1. The scam framing (consumer)
2. SSN held — SLOW DOWN, this is the hook
3. $5k wire held
4. Verified Stripe answered (the contrast)
5. Registry (how it knows)
6. Depth reveal: gate + no-LLM
7. Trust graph (orbit)
8. Sponsors + papers + "it's live"

## Tips
- **Seed before recording** so nothing loads on camera.
- **Slow down on the SSN moment** — it's the emotional hook.
- Confident single take > perfect stitched one. Fumble a line, keep going.
