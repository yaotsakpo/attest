# Job Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An everyday job-search copilot: apply with an AgentMail inbox, recruiter replies land and move a live Convex pipeline board, sender authenticity is shown honestly (verified / couldn't-verify), companies are enriched via Firecrawl, and AI-drafted replies are approved before AgentMail sends them.

**Architecture:** Convex is the backend and the live layer (reactive `useQuery` board, mutations on every email event, Convex Auth for per-user data, an httpAction receiving the AgentMail webhook, scheduled actions for OpenAI extraction + Firecrawl enrichment). AgentMail is the inbox (inbound webhook + outbound send). Firecrawl scrapes company/job pages. OpenAI extracts typed fields from emails and drafts replies. Deploy to `convex.site` via `@convex-dev/static-hosting`.

**Tech Stack:** Convex (schema/query/mutation/action/httpAction, `@convex-dev/auth` beta, `@convex-dev/static-hosting`), React + Vite (TS), `@firecrawl/firecrawl-convex` component, `agentmail` REST (via Convex actions), OpenAI API.

**Reference (fast-track, DO NOT submit):** SentSignal at `~/Marketing/flightdeck/api` — proven patterns to port: `routers/webhooks.py` (HMAC verify + strict-JSON LLM extraction + regex fallback), `agents/classify.py`/`enrich.py`/`personalize.py`, `services/inbound.py` (reply → classify → update → approve-or-autopilot). Port the STRUCTURE; rewrite in TS on the mandated stack.

**Cut line (spec):** Tasks 1-6 + 11 = MUST-HAVE (complete winning demo). Tasks 7-10 = cuttable tail if the Sep 15-17 Summit eats week 3; keep at least a minimal Firecrawl scrape so all four sponsors are represented.

**Cost note (from the hackathon page):** NO OpenAI or Convex credits are provided during the build — OpenAI API calls are paid out of pocket (Codex credits are a *prize*, not a build allowance). Extraction/drafting use `gpt-4o-mini` at a few hundred tokens per email, so real spend is cents; just don't loop it. Firecrawl has $20k credits after Luma registration; AgentMail is on its free/sponsor tier.

**Verified API notes (used throughout, confirmed 2026-08-25):**
- Enums: `v.union(v.literal("a"), v.literal("b"))` — no `v.enum`. Refs: `v.id("table")`. `_id`/`_creationTime` auto.
- `ctx.db` in query/mutation only; actions/httpActions use `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` + `ctx.scheduler.runAfter(ms, internal.file.fn, args)`.
- HTTP routes live in `convex/http.ts`; served at `<deploy>.convex.site`. Static hosting owns `/`, so webhook routes MUST be under a prefix (`/webhooks/...`).
- Convex Auth: `getAuthUserId(ctx)` returns `Id<"users"> | null`; spread `...authTables` into schema; `ConvexAuthProvider` on the client.
- AgentMail REST base `https://api.agentmail.to/v0`, Bearer auth. Webhook register `POST /v0/webhooks {url,event_types:["message.received"],client_id}`. Send `POST /v0/inboxes/{id}/messages/send {to,subject,text,html}`. Reply `POST /v0/inboxes/{id}/messages/{msgId}/reply {text}`.
- Firecrawl official Convex component `@firecrawl/firecrawl-convex`; `new FirecrawlClient(components.firecrawl).scrape(ctx, url, {formats:["markdown"]})` — pin version, check `.d.ts` for exact arg shape.

---

## Task 0: Project scaffold (done by you, prerequisite)

**Not a coding task — the human runs the hackathon setup prompt + tooling before Task 1.**

- [ ] Register on Luma (unlocks $20k Firecrawl credits).
- [ ] In `~/Documents/jobcopilot`, run the hackathon setup prompt from the hackathon page (installs Convex integration + hackathon skill, starts `hackathon.md`).
- [ ] `npm create vite@latest . -- --template react-ts` (if the setup prompt didn't scaffold a frontend), then `npm i convex`.
- [ ] `npx convex dev` once to create the deployment + `convex/` dir + `.env.local` with `CONVEX_URL`/`VITE_CONVEX_URL`.
- [ ] Set secrets: `npx convex env set OPENAI_API_KEY sk-...`, `npx convex env set AGENTMAIL_API_KEY am_...`, `npx convex env set FIRECRAWL_API_KEY fc-...`.
- [ ] Confirm `npx convex dev` runs clean and the sample query works before Task 1.

---

## Task 1: Convex schema

**Files:**
- Create: `convex/schema.ts`

- [ ] **Step 1: Write the schema** (spread auth tables, define the 4 app tables from the spec)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    agentmailInbox: v.string(),
    agentmailInboxId: v.string(),
    searchProfile: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  applications: defineTable({
    userId: v.id("users"),
    company: v.string(),
    role: v.string(),
    jobUrl: v.optional(v.string()),
    stage: v.union(
      v.literal("applied"), v.literal("screen"), v.literal("technical"),
      v.literal("onsite"), v.literal("offer"), v.literal("rejected"), v.literal("ghosted"),
    ),
    enrichment: v.optional(v.any()),
    trustState: v.union(v.literal("verified"), v.literal("unverified"), v.literal("mixed")),
    lastEventAt: v.number(),
  }).index("by_user", ["userId"]),

  events: defineTable({
    userId: v.id("users"),
    applicationId: v.optional(v.id("applications")),
    agentmailMsgId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    rawText: v.string(),
    senderVerified: v.boolean(),
    verifyReason: v.optional(v.string()),
    extracted: v.optional(v.any()),
    eventType: v.optional(v.union(
      v.literal("confirmation"), v.literal("recruiter_reply"),
      v.literal("interview_invite"), v.literal("rejection"), v.literal("offer"),
    )),
  })
    .index("by_user", ["userId"])
    .index("by_msg", ["agentmailMsgId"]),

  drafts: defineTable({
    userId: v.id("users"),
    applicationId: v.id("applications"),
    eventId: v.id("events"),
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("pending_approval"), v.literal("approved"),
      v.literal("sent"), v.literal("discarded"),
    ),
  }).index("by_user", ["userId"]),
});
```

- [ ] **Step 2: Verify Convex accepts the schema**

Run: `npx convex dev` (leave running; it pushes schema on save)
Expected: "Convex functions ready" with no schema error.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts && git commit -m "feat: convex schema (profiles, applications, events, drafts)"
```

---

## Task 2: Convex Auth (email/password) + per-user scoping

> **VERSION WARNING (from the hackathon page):** the listed resource is **"Convex Auth v2 super alpha"**, NOT the beta this task was first drafted against. BEFORE running the commands below, open the hackathon page's "Convex Auth v2 super alpha" resource and reconcile: the package name, the `@auth/core` pin, the provider import path, and the client provider component may all differ in v2. Treat the code in this task as the v1/beta shape to adapt from — the *structure* (Password provider, `addHttpRoutes`, a client provider wrapping the app, `getAuthUserId` in queries) is stable; the exact imports/version pins are what to verify. If v2's `getAuthUserId` signature changed, Tasks 6/7/9 that call it must match.

**Files:**
- Create: `convex/auth.ts`, `convex/http.ts`
- Modify: `src/main.tsx` (client provider)

- [ ] **Step 1: Install + run the auth wizard** (pin versions PER the v2 super-alpha doc — the pin below is the beta's and may be wrong for v2)

```bash
npm install @convex-dev/auth @auth/core@0.41.1   # <-- verify both against the v2 super-alpha resource first
npx @convex-dev/auth   # generates auth.ts + adds http routes; sets env vars
```

- [ ] **Step 2: Write `convex/auth.ts` (Password provider — least moving parts)**

```typescript
// convex/auth.ts
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
```

- [ ] **Step 3: Ensure `convex/http.ts` wires auth routes** (the wizard adds this; verify)

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);
export default http;
```

- [ ] **Step 4: Client provider** — in `src/main.tsx`, wrap App in `ConvexAuthProvider`

```typescript
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
// render: <ConvexAuthProvider client={convex}><App /></ConvexAuthProvider>
```

- [ ] **Step 5: Verify** — `npx convex dev` clean; a throwaway sign-up via `useAuthActions().signIn("password", {email,password,flow:"signUp"})` creates a `users` row (check the Convex dashboard data tab).

- [ ] **Step 6: Commit**

```bash
git add convex/auth.ts convex/http.ts src/main.tsx package.json
git commit -m "feat: convex auth (password) + client provider"
```

---

## Task 3: Sender-auth parser (pure TS, TDD — the differentiator's core)

**Files:**
- Create: `convex/lib/senderAuth.ts`, `convex/lib/senderAuth.test.ts`

This is a pure function so it's unit-testable without Convex. Ported from SentSignal's auth parsing + the Inbin `parseAuthResults` discipline. HONEST two-state: verified only if dmarc=pass AND aligned to the From domain.

- [ ] **Step 1: Write the failing test**

```typescript
// convex/lib/senderAuth.test.ts
import { describe, it, expect } from "vitest";
import { evaluateSender } from "./senderAuth";

describe("evaluateSender", () => {
  it("verified when dmarc=pass and aligned to the From domain", () => {
    const r = evaluateSender(
      "recruiter@acme.com",
      "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
    );
    expect(r.verified).toBe(true);
  });
  it("NOT verified (couldn't verify) when dmarc fails — never 'fake'", () => {
    const r = evaluateSender(
      "recruiter@acme.com",
      "mx; spf=pass; dkim=fail; dmarc=fail header.from=acme.com",
    );
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/DMARC/i);
  });
  it("NOT verified when dmarc passes but aligns to a DIFFERENT domain (ATS case)", () => {
    // legit ATS mail: passes DMARC for greenhouse.io, not acme.com -> lower confidence, not fake
    const r = evaluateSender(
      "no-reply@greenhouse.io",
      "mx; spf=pass; dkim=pass; dmarc=pass header.from=greenhouse.io",
    );
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/align/i);
  });
  it("NOT verified when the header is missing entirely", () => {
    const r = evaluateSender("x@y.com", null);
    expect(r.verified).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run convex/lib/senderAuth.test.ts`
Expected: FAIL — "evaluateSender is not a function".

- [ ] **Step 3: Implement**

```typescript
// convex/lib/senderAuth.ts
export interface SenderVerdict { verified: boolean; reason?: string }

function fromDomain(addr: string): string {
  const m = addr.trim().toLowerCase().match(/@([^>\s]+)/);
  return m ? m[1]! : "";
}

/** Two honest states only: verified (dmarc=pass AND aligned to the From
 *  domain) or couldn't-verify (with a reason). NEVER "fake" — ATS mail
 *  legitimately fails alignment. */
export function evaluateSender(
  fromAddress: string,
  authResultsHeader: string | null,
): SenderVerdict {
  if (!authResultsHeader) {
    return { verified: false, reason: "No Authentication-Results header on this message." };
  }
  const h = authResultsHeader.toLowerCase();
  const dmarc = (h.match(/dmarc=(\w+)/) || [])[1] ?? null;
  const alignDomain = (h.match(/header\.from=([^\s;]+)/) || [])[1] ?? null;
  const senderDomain = fromDomain(fromAddress);

  if (dmarc !== "pass") {
    return { verified: false, reason: `DMARC did not pass (dmarc=${dmarc ?? "absent"}). Real recruiters sometimes send via tools that trip this — treat as lower confidence, not fake.` };
  }
  if (alignDomain && senderDomain && alignDomain !== senderDomain) {
    return { verified: false, reason: `DMARC passed but aligned to ${alignDomain}, not ${senderDomain} (common for ATS platforms). Lower confidence, not fake.` };
  }
  return { verified: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run convex/lib/senderAuth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/senderAuth.ts convex/lib/senderAuth.test.ts
git commit -m "feat: honest sender-auth evaluation (verified / couldn't-verify, never fake)"
```

---

## Task 4: AgentMail inbound webhook (httpAction, fast-ack + dedup)

**Files:**
- Modify: `convex/http.ts` (add the webhook route)
- Create: `convex/inbound.ts` (the ingest mutation)

Ported from SentSignal `routers/webhooks.py` (fast-ack, dedup, schedule extraction). AgentMail's `message.received` payload includes the message with `from`, `subject`, `text`, `message_id`, and `headers` (which carry `Authentication-Results`).

- [ ] **Step 1: Write the ingest internalMutation**

```typescript
// convex/inbound.ts
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { evaluateSender } from "./lib/senderAuth";

export const ingestInbound = internalMutation({
  args: {
    userId: v.id("users"),
    agentmailMsgId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    rawText: v.string(),
    authResultsHeader: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotent: drop duplicate deliveries.
    const existing = await ctx.db
      .query("events").withIndex("by_msg", (q) => q.eq("agentmailMsgId", args.agentmailMsgId))
      .unique().catch(() => null);
    if (existing) return null;

    const verdict = evaluateSender(args.fromAddress, args.authResultsHeader ?? null);
    const eventId = await ctx.db.insert("events", {
      userId: args.userId,
      agentmailMsgId: args.agentmailMsgId,
      fromAddress: args.fromAddress,
      subject: args.subject,
      rawText: args.rawText,
      senderVerified: verdict.verified,
      verifyReason: verdict.reason,
    });
    // Schedule OpenAI extraction (Task 5) — never block the webhook.
    await ctx.scheduler.runAfter(0, internal.extract.run, { eventId });
    return null;
  },
});
```

- [ ] **Step 2: Add the webhook route to `convex/http.ts`** (under `/webhooks/`, NOT `/`, so static hosting won't shadow it)

```typescript
// add to convex/http.ts, before `export default http;`
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

http.route({
  path: "/webhooks/agentmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.json();
    // AgentMail message.received shape (from teardown): from, subject, text, message_id, headers.
    const msg = payload.message ?? payload;
    const inboxAddr = (msg.to && msg.to[0]) || payload.inbox_id || "";
    // Resolve which user owns this inbox.
    const userId = await ctx.runQuery(internal.profiles.userByInbox, { inbox: inboxAddr });
    if (!userId) return new Response(null, { status: 202 }); // unknown inbox: ack, ignore
    const headers = msg.headers ?? {};
    const authResults = headers["Authentication-Results"] || headers["authentication-results"];
    await ctx.runMutation(internal.inbound.ingestInbound, {
      userId,
      agentmailMsgId: msg.message_id,
      fromAddress: typeof msg.from === "string" ? msg.from : (msg.from?.address ?? ""),
      subject: msg.subject ?? "",
      rawText: msg.text ?? msg.preview ?? "",
      authResultsHeader: authResults,
    });
    return new Response(null, { status: 200 });
  }),
});
```

- [ ] **Step 3: Add `internal.profiles.userByInbox`**

```typescript
// convex/profiles.ts
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const userByInbox = internalQuery({
  args: { inbox: v.string() },
  handler: async (ctx, args) => {
    const p = await ctx.db.query("profiles")
      .filter((q) => q.eq(q.field("agentmailInbox"), args.inbox)).first();
    return p?.userId ?? null;
  },
});
```

- [ ] **Step 4: Verify** — `npx convex dev` clean. Then simulate a webhook with curl against the dev `.convex.site` URL (get it from the dashboard):

```bash
curl -X POST "https://<dev>.convex.site/webhooks/agentmail" -H "content-type: application/json" \
  -d '{"message":{"message_id":"t1","from":"recruiter@acme.com","subject":"Interview","text":"Can you do Thursday 2pm?","to":["<your-inbox>@agentmail.to"],"headers":{"Authentication-Results":"mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com"}}}'
```
Expected: 200; a new `events` row appears in the dashboard with `senderVerified: true`. (Needs a profile row with that inbox — insert one manually in the dashboard for the test.)

- [ ] **Step 5: Commit**

```bash
git add convex/inbound.ts convex/http.ts convex/profiles.ts
git commit -m "feat: agentmail inbound webhook (dedup, fast-ack, sender-auth, schedule extract)"
```

---

## Task 5: OpenAI extraction (action) + stage transition (mutation)

**Files:**
- Create: `convex/extract.ts` (action), `convex/pipeline.ts` (stage mutation + matching)

Ported from SentSignal `agents/classify.py` + strict-JSON discipline. HONESTY: OpenAI returns null for absent fields — never fabricate (a fake interview date is the worst failure).

- [ ] **Step 1: Write the extraction action**

```typescript
// convex/extract.ts
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";

const SYS = `You extract structured facts from a single job-search email. Return ONLY valid JSON:
{"company": string|null, "role": string|null,
 "eventType": "confirmation"|"recruiter_reply"|"interview_invite"|"rejection"|"offer",
 "interview_date": string|null, "next_action": string|null, "sentiment": "positive"|"neutral"|"negative"}
Rules: return null for anything NOT present in the email. NEVER guess or fabricate. If unsure of eventType, use "recruiter_reply".`;

export const run = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const ev = await ctx.runQuery(internal.events.getRaw, { eventId: args.eventId });
    if (!ev) return null;
    let extracted: any = null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYS },
            { role: "user", content: `Subject: ${ev.subject}\nFrom: ${ev.fromAddress}\n\n${ev.rawText}` },
          ],
        }),
      });
      const j = await res.json();
      extracted = JSON.parse(j.choices[0].message.content);
    } catch (e) {
      // extraction failure: leave event raw (still visible), do not corrupt pipeline
      return null;
    }
    await ctx.runMutation(internal.pipeline.applyExtraction, { eventId: args.eventId, extracted });
    return null;
  },
});
```

- [ ] **Step 2: `internal.events.getRaw`**

```typescript
// convex/events.ts
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
export const getRaw = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => ctx.db.get(args.eventId),
});
```

- [ ] **Step 3: stage transition mutation (forward-only + match-or-create)**

```typescript
// convex/pipeline.ts
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const ORDER = ["applied","screen","technical","onsite","offer"] as const;
const EVENT_TO_STAGE: Record<string,string> = {
  confirmation:"applied", recruiter_reply:"screen", interview_invite:"technical",
  offer:"offer", rejection:"rejected",
};
function forwardOnly(current: string, next: string): string {
  if (next === "rejected" || next === "ghosted") return next; // terminal always allowed
  const ci = ORDER.indexOf(current as any), ni = ORDER.indexOf(next as any);
  return ni > ci ? next : current; // never move backward
}

export const applyExtraction = internalMutation({
  args: { eventId: v.id("events"), extracted: v.any() },
  handler: async (ctx, args) => {
    const ev = await ctx.db.get(args.eventId);
    if (!ev) return null;
    const ex = args.extracted ?? {};
    // Match to an application: (1) same company (extracted), (2) from-domain company.
    const apps = await ctx.db.query("applications").withIndex("by_user", (q)=>q.eq("userId", ev.userId)).collect();
    const company = (ex.company ?? "").toString();
    let app = apps.find(a => company && a.company.toLowerCase() === company.toLowerCase())
           ?? apps.sort((a,b)=>b.lastEventAt-a.lastEventAt).find(a => ev.fromAddress.includes(a.company.toLowerCase().replace(/\s+/g,"")));
    if (!app) {
      const stage = (EVENT_TO_STAGE[ex.eventType] ?? "applied") as any;
      const id = await ctx.db.insert("applications", {
        userId: ev.userId, company: company || ev.fromAddress.split("@")[1] || "Unknown",
        role: ex.role ?? "", stage, trustState: ev.senderVerified ? "verified":"unverified",
        lastEventAt: Date.now(),
      });
      app = await ctx.db.get(id);
    } else {
      const target = EVENT_TO_STAGE[ex.eventType] ?? app.stage;
      // Gate: an unverified sender may set a lower-stakes stage but NOT "offer".
      const gated = (!ev.senderVerified && target === "offer") ? app.stage : target;
      const nextStage = forwardOnly(app.stage, gated) as any;
      const nextTrust = app.trustState === "verified" && !ev.senderVerified ? "mixed"
                      : app.trustState === "unverified" && ev.senderVerified ? "mixed"
                      : ev.senderVerified ? "verified" : "unverified";
      await ctx.db.patch(app._id, { stage: nextStage, trustState: nextTrust, lastEventAt: Date.now() });
    }
    await ctx.db.patch(args.eventId, {
      applicationId: app!._id, extracted: ex, eventType: ex.eventType ?? "recruiter_reply",
    });
    return null;
  },
});
```

- [ ] **Step 4: Verify end-to-end** — re-run the Task 4 curl; confirm within seconds the `events` row gets `extracted` + `eventType`, and an `applications` row appears/updates in the dashboard.

- [ ] **Step 5: Commit**

```bash
git add convex/extract.ts convex/events.ts convex/pipeline.ts
git commit -m "feat: openai extraction + forward-only stage transition (honest, verification-gated)"
```

---

## Task 6: The live board (the hero shot)

**Files:**
- Create: `convex/board.ts` (per-user query), `src/Board.tsx`

- [ ] **Step 1: Per-user board query (auth-scoped)**

```typescript
// convex/board.ts
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const myApplications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db.query("applications").withIndex("by_user", (q)=>q.eq("userId", userId)).collect();
  },
});
```

- [ ] **Step 2: The board component (live `useQuery`, columns by stage, trust badge)**

```tsx
// src/Board.tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const STAGES = ["applied","screen","technical","onsite","offer","rejected"] as const;

export function Board() {
  const apps = useQuery(api.board.myApplications);
  if (apps === undefined) return <p>Loading…</p>;
  return (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${STAGES.length},1fr)`, gap:12 }}>
      {STAGES.map((stage) => (
        <div key={stage}>
          <h3>{stage}</h3>
          {apps.filter(a=>a.stage===stage).map(a=>(
            <div key={a._id} className="card">
              <b>{a.company}</b><div>{a.role}</div>
              <span title={a.trustState}>{a.trustState==="verified"?"✓ verified":"⚠ couldn’t verify"}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify the hero shot** — with the app open in the browser (signed in), re-run the Task 4 curl. The card must move columns / appear **with no refresh** within ~1-2s. This is the demo.

- [ ] **Step 4: Commit**

```bash
git add convex/board.ts src/Board.tsx
git commit -m "feat: live pipeline board (reactive, trust badge) — the hero shot"
```

---

## Task 7: AgentMail provisioning + outbound send (per-user inbox)  [CUTTABLE TAIL]

**Files:**
- Create: `convex/agentmail.ts` (create inbox action, register webhook, send action)
- Modify: onboarding UI to call create-inbox on first sign-in

- [ ] **Step 1: create-inbox + register-webhook action**

```typescript
// convex/agentmail.ts
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";

const BASE = "https://api.agentmail.to/v0";
const H = () => ({ "Authorization": `Bearer ${process.env.AGENTMAIL_API_KEY}`, "Content-Type": "application/json" });

export const provisionInbox = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("unauth");
    const existing = await ctx.runQuery(internal.profiles.byUser, { userId });
    if (existing) return existing.agentmailInbox;
    const res = await fetch(`${BASE}/inboxes`, { method:"POST", headers:H(),
      body: JSON.stringify({ client_id: `jobcopilot-${userId}` }) });
    const inbox = await res.json(); // { inbox_id, email }
    await ctx.runMutation(internal.profiles.create, {
      userId, agentmailInbox: inbox.email, agentmailInboxId: inbox.inbox_id });
    return inbox.email;
  },
});
```

(Webhook is registered ONCE org-wide, not per inbox — do it manually in Task 0 or a one-shot script pointing at `<deploy>.convex.site/webhooks/agentmail`.)

- [ ] **Step 2: send action** (used by approve-reply in Task 8)

```typescript
export const sendReply = action({
  args: { inboxId: v.string(), toMsgId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const res = await fetch(`${BASE}/inboxes/${args.inboxId}/messages/${args.toMsgId}/reply`,
      { method:"POST", headers:H(), body: JSON.stringify({ text: args.text }) });
    if (!res.ok) throw new Error(`agentmail send ${res.status}`);
    return null;
  },
});
```
(needs `import { v } from "convex/values"` + the profiles helpers `byUser`/`create`.)

- [ ] **Step 3: Verify** — sign up in the app → `provisionInbox` returns a real `@agentmail.to` address; send a test email TO it; confirm it flows through Tasks 4-6 to the board.

- [ ] **Step 4: Commit**

```bash
git add convex/agentmail.ts convex/profiles.ts
git commit -m "feat: agentmail inbox provisioning + outbound reply"
```

---

## Task 8: Firecrawl enrichment (action)  [CUTTABLE TAIL — keep minimal to represent the sponsor]

**Files:**
- Modify: `convex/convex.config.ts` (add firecrawl component), `convex/enrich.ts`

- [ ] **Step 1: Install + wire the official component**

```bash
npm install @firecrawl/firecrawl-convex
npx convex env set FIRECRAWL_API_KEY fc-...
```
```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
const app = defineApp();
app.use(firecrawl, { httpPrefix: "/firecrawl/" });
export default app;
```

- [ ] **Step 2: enrichment action** (scrape the job/company page → store on the application)

```typescript
// convex/enrich.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { components, internal } from "./_generated/api";
const firecrawl = new FirecrawlClient(components.firecrawl);

export const enrichApplication = internalAction({
  args: { applicationId: v.id("applications"), url: v.string() },
  handler: async (ctx, args) => {
    let md = "";
    try {
      const r = await firecrawl.scrape(ctx, args.url, { formats:["markdown"], onlyMainContent:true });
      md = (r as any).markdown ?? "";
    } catch { return null; } // non-blocking: enrichment failure never breaks the pipeline
    await ctx.runMutation(internal.pipeline.setEnrichment, { applicationId: args.applicationId, enrichment: { md: md.slice(0, 4000) } });
    return null;
  },
});
```
(add `internal.pipeline.setEnrichment` = a `patch` on `applications.enrichment`. Pin the component version and check `.d.ts` for the exact `scrape` arg shape.)

- [ ] **Step 3: Verify** — set a `jobUrl` on an application, run the action, confirm `enrichment.md` populates.

- [ ] **Step 4: Commit**

```bash
git add convex/convex.config.ts convex/enrich.ts convex/pipeline.ts package.json
git commit -m "feat: firecrawl company/job enrichment (non-blocking)"
```

---

## Task 9: AI reply drafting + approve-before-send  [CUTTABLE TAIL]

**Files:**
- Create: `convex/reply.ts` (draft action + approve mutation), `src/Draft.tsx`

Ported from SentSignal `personalize.py` (draft → pending_approval → approved → send). Only drafts for VERIFIED senders automatically; unverified requires the acknowledgment (Task 3/5 gate).

- [ ] **Step 1: draft action** (OpenAI, grounded in Firecrawl `enrichment` if present) → insert `drafts` row `pending_approval`.
- [ ] **Step 2: approve mutation** → set `approved`, schedule `agentmail.sendReply`, set `sent`.
- [ ] **Step 3: `src/Draft.tsx`** — shows the draft, Edit + Approve&Send button (calls the mutation), and for unverified senders shows the "couldn't verify — acknowledge to proceed" checkbox gating the button.
- [ ] **Step 4: Verify** — verified recruiter reply → a draft appears → approve → AgentMail send succeeds → status `sent`.
- [ ] **Step 5: Commit** `feat: AI reply drafting + human approve-before-send`

(Full code mirrors Task 5's OpenAI call shape + Task 7's send action; write it out at implementation time from those two proven patterns.)

---

## Task 10: "How's my search?" summary  [CUTTABLE TAIL]

**Files:** `convex/summary.ts` (action), `src/Summary.tsx`

- [ ] Query the user's applications+events → compute funnel counts in a Convex query → OpenAI turns counts into one honest paragraph ("you convert screens well; N of M rejections came after take-homes"). Insight only from real counts, never invented. Commit `feat: how's-my-search summary`.

---

## Task 11: Deploy to convex.site + submission assets  [MUST-HAVE]

**Files:** `convex/convex.config.ts` (static hosting), `package.json` (deploy script), `hackathon.md`

- [ ] **Step 1:** `npm install @convex-dev/static-hosting` and `npx @convex-dev/static-hosting setup`. In `convex.config.ts`, keep your HTTP routes under `/webhooks/` and static hosting on `/` (verify no collision — the webhook route must still resolve).
- [ ] **Step 2:** `npx convex login` then `npm run deploy`. Confirm the app loads at `https://<deploy>.convex.site` and the webhook still works against that prod `.convex.site` URL (re-register the AgentMail webhook to the prod URL).
- [ ] **Step 3:** Write `hackathon.md` at repo root: what it is, the stack (Convex/AgentMail/Firecrawl/OpenAI + how each does real work), the live URL, the video link. Run `/hackathon` after each session to keep it current.
- [ ] **Step 4:** Record the <3-min video (arc from the spec: hero board move, then the honest trust twist). Post to X/LinkedIn tagging @convex @OpenAI @firecrawl @agentmail. Submit repo + URL + video on vibeapps.dev before **Sep 22 12pm PT**.
- [ ] **Step 5:** Commit `chore: deploy + hackathon.md + submission`.

---

## Self-review notes
- Every spec section maps to a task: schema(1), auth(2), sender-auth honesty(3), inbound webhook(4), extraction+forward-only+gate(5), live board(6), agentmail provision/send(7), firecrawl(8), reply approve-send(9), summary(10), deploy+submit(11).
- Honesty rule enforced in code: Task 3 two-state verdict; Task 5 "null for absent, never fabricate" + offer-gate on unverified.
- Cut line explicit: 1-6+11 must-have; 7-10 tail (but 7's provisioning is needed for a real end-to-end demo, so treat 7 as "must-have-lite" — at minimum one manually-provisioned inbox for the demo).
- Confidence flags to check at build time (from API research): exact `firecrawl.scrape` arg shape (`.d.ts`); AgentMail SDK method casing vs raw REST (plan uses raw REST to avoid the risk); `@convex-dev/auth` is beta (pin version + `@auth/core@0.41.1`).
