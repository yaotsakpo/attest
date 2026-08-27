# Attest — Demo Video Script (~2.5 min)

**Goal:** show the trust layer deciding real messages, live, with no LLM in the
decision path. Record in one take at https://attestagent.dev. Sign in as
yourself first and click **Load demo data** BEFORE recording so the board is
full — then start the tape on the landing page.

Aim for 2–3 minutes. Beats below; the *italics* are what to say.

---

## 0:00 — The hook (landing page)
Open **https://attestagent.dev**. Let the rotating node-sphere breathe for a
beat.

> *"Your AI agent is starting to act for you — reading email, replying, soon
> paying invoices. The moment it talks to other agents and people, one question
> decides everything: who is it allowed to trust, and what can it do on your
> behalf? Attest is the trust layer that answers that."*

Scroll once through **the gate** section (the five-step pipeline + live
terminal) so they see the checks running.

> *"Every message runs a deterministic gate — continuity, reputation, sensitive
> info, your policy — first match wins. No LLM in the decision path."*

---

## 0:35 — Sign in
Click **Sign in** → enter your email → paste the code.

> *"Passwordless email sign-in. Each user gets their own agent inbox."*

(You're already seeded, so the dashboard is full when you land.)

---

## 0:55 — The dashboard, via the guided tour
Click **Take the tour** (or it auto-ran on seed). Walk the spotlight:

- **Conversations** — *"real inbound emails, each authenticated or not on
  arrival."*
- **Registry** — *"a live A–F grade for every sending domain, earned from
  authenticated mail — not SEO, not an allowlist. This is the spine, exposed to
  agents at /registry/domains."*
- **Held for you** — *"here's the one that matters —"* (see next beat)
- **Decision log** — *"every gate decision, with a reason. The agent never acts
  without a recorded why."*
- **Trust graph** — orbit it once.

---

## 1:35 — The money moment (the SSN hold)
Point at **offer-onboarding.co → "send your SSN"** in Held-for-you.

> *"A stranger emailed the agent asking for a Social Security Number. A
> content-based filter might be talked into it. Attest holds it — because the
> sender never authenticated, and an SSN request is sensitive by rule. It waits
> for you."*

Then point at **vendor-invoices.net → $5,000 wire**:

> *"Same story — an unverified $5,000 wire. Held. A remembered payment stays
> capped at the amount you approved."*

Contrast with a green one (**stripe.com / vercel.com**):

> *"Stripe authenticated — DMARC pass, aligned. The agent answers that one on
> your behalf automatically."*

---

## 2:05 — The trust graph (the 3D showpiece)
Expand the trust map (⤢). Orbit it.

> *"This is the agent's live map of who vouches for whom. Verified hubs —
> Greenhouse, Lever — vouch for the companies that reach you through them, so a
> company inherits trust the first time it appears. Held senders sit apart."*

---

## 2:20 — The close (why it's real)
> *"Attest is the working implementation of three published papers — authority,
> continuity, and reputation — each a mechanism wired into this codebase and
> tested, not just argued. 151 tests. Built on Convex, AgentMail, Firecrawl, and
> OpenAI. It's live at attestagent.dev."*

End on the landing page or the trust graph.

---

## Recording tips
- **Seed before you hit record** (Load demo data) so nothing loads mid-take.
- Full-screen the browser, hide bookmarks bar.
- If a beat fumbles, keep going — you can trim; a confident single take reads
  better than a stitched one.
- Screen-record at 1080p+. QuickTime (Cmd-Shift-5) is fine.
