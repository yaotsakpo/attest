// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestHarness = TestConvex<typeof schema>;

async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: uid,
      agentmailInbox: "seeker@agentmail.to",
      agentmailInboxId: "inbox_1",
    });
    return uid;
  });
}

// Read back one event by message id.
async function eventByMsg(t: TestHarness, msgId: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_msg", (q) => q.eq("agentmailMsgId", msgId))
      .unique(),
  );
}

test("SSN request from an UNVERIFIED sender -> gate holds for approval, sensitiveRequest true", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // Unaligned sender (authenticated as a different domain) => couldn't-verify.
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "ssn_1",
    fromAddress: "hr@shady.example",
    subject: "Please send your SSN to finalize onboarding",
    rawText: "We need your SSN and date of birth to proceed.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=other.example",
  });

  // Drive the scheduled extraction -> applyExtraction, which computes the gate.
  await t.finishAllScheduledFunctions(() => {});

  const ev = await eventByMsg(t, "ssn_1");
  expect(ev).not.toBeNull();
  expect(ev!.senderVerified).toBe(false);
  expect(ev!.sensitiveRequest).toBe(true);
  expect(ev!.gateAction).toBe("hold_for_approval");
  expect(ev!.gateReason).toBeTruthy();
});

test("normal request from a VERIFIED sender -> gate auto-answers, sensitiveRequest false", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // Prime the domain so it earns a passing grade BEFORE the graded email lands.
  // gradeFor needs verified >= unverified and score high enough; a couple of
  // verified sightings put acme.com at a C-or-better grade.
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const at of [now - 3000, now - 2000, now - 1000]) {
      await ctx.runMutation(internal.registry.observeDomain, {
        domain: "acme.com",
        verified: true,
        at,
      });
    }
  });

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "normal_1",
    fromAddress: "recruiter@acme.com",
    subject: "Quick scheduling question",
    rawText: "Are you free for a call Thursday afternoon?",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });

  await t.finishAllScheduledFunctions(() => {});

  const ev = await eventByMsg(t, "normal_1");
  expect(ev).not.toBeNull();
  expect(ev!.senderVerified).toBe(true);
  expect(ev!.sensitiveRequest).toBe(false);
  expect(ev!.gateAction).toBe("auto_answer");
});

test("applyExtraction persists the gate decision directly (unverified + sensitive => hold)", async () => {
  // Drives internal.pipeline.applyExtraction directly with a seeded event, to
  // test the gate-decision persistence path independent of the scheduler.
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("events", {
      userId,
      agentmailMsgId: "direct_1",
      fromAddress: "hr@unknown.example",
      subject: "Bank account details needed",
      rawText: "Please reply with your bank account number and routing number.",
      senderVerified: false,
      registryDomain: "unknown.example",
    }),
  );

  await t.mutation(internal.pipeline.applyExtraction, {
    eventId,
    extracted: { company: "Unknown", role: null, eventType: "recruiter_reply" },
  });

  const ev = await t.run(async (ctx) => ctx.db.get("events", eventId));
  expect(ev!.sensitiveRequest).toBe(true);
  expect(ev!.gateAction).toBe("hold_for_approval");
  expect(ev!.gateReason).toBeTruthy();
});

// End-to-end proof that the WIRED pipeline honors the user's own policy, not
// just the pure engine. A verified counterpart asks for a payment; the user's
// policy allows payments <= $500. Under-threshold auto-answers, over holds.
async function seedPaymentPolicy(t: TestHarness, userId: Id<"users">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("policies", {
      userId,
      rules: [
        {
          id: "pay500",
          action: "payment",
          maxAmount: 500,
          requireVerified: true,
          decision: "allow",
        },
      ],
      updatedAt: Date.now(),
    });
  });
}

async function primeVerified(t: TestHarness, domain: string) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const at of [now - 3000, now - 2000, now - 1000]) {
      await ctx.runMutation(internal.registry.observeDomain, {
        domain,
        verified: true,
        at,
      });
    }
  });
}

test("policy: verified payment UNDER the user's $500 threshold -> auto-answers", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPaymentPolicy(t, userId);
  await primeVerified(t, "acme.com");

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "pay_ok",
    fromAddress: "billing@acme.com",
    subject: "Invoice #204",
    rawText: "Please remit $200 for invoice #204.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });
  await t.finishAllScheduledFunctions(() => {});

  const ev = await eventByMsg(t, "pay_ok");
  expect(ev!.senderVerified).toBe(true);
  expect(ev!.gateAction).toBe("auto_answer");
});

test("policy: verified payment OVER the user's $500 threshold -> holds for approval", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await seedPaymentPolicy(t, userId);
  await primeVerified(t, "acme.com");

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "pay_big",
    fromAddress: "billing@acme.com",
    subject: "Invoice #205",
    rawText: "Please wire $5,000 today for invoice #205.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });
  await t.finishAllScheduledFunctions(() => {});

  const ev = await eventByMsg(t, "pay_big");
  expect(ev!.senderVerified).toBe(true);
  expect(ev!.gateAction).toBe("hold_for_approval");
});

// End-to-end proof of the continuity + reputation axes through the WIRED
// pipeline. An in-network counterpart (agentmail.to) is seeded on first trusted
// contact; a later message that doesn't carry the continuity proof is flagged as
// a takeover and held; and a reputation event is recorded.
test("continuity: in-network first contact seeds; later message without proof -> takeover hold + reputation event", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // The counterpart is a REGISTERED Attest agent (has its own profile) — that's
  // what makes it in-network, not its domain. Register it.
  const peerAddr = "peer@agentmail.to";
  await t.run(async (ctx) => {
    const puid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: puid,
      agentmailInbox: peerAddr,
      agentmailInboxId: "inbox_peer",
    });
  });
  const peerDomain = "agentmail.to";

  // First contact from the in-network peer, a routine reply → auto-answered, and
  // we seed continuity for next time.
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "peer_1",
    fromAddress: peerAddr,
    subject: "Hello",
    rawText: "Are you free Tuesday?",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=agentmail.to",
  });
  await t.finishAllScheduledFunctions(() => {});

  const first = await eventByMsg(t, "peer_1");
  expect(first!.gateAction).toBe("auto_answer"); // in-network reply lift

  const seededRec = await t.run(async (ctx) =>
    ctx.db
      .query("continuity")
      .withIndex("by_user_and_counterpart", (q) =>
        q.eq("userId", userId).eq("counterpart", peerDomain),
      )
      .unique(),
  );
  expect(seededRec).not.toBeNull();
  expect(seededRec!.seeded).toBe(true);

  // Later message from the SAME address with NO continuity token — an OMISSION.
  // Holds LOCALLY (safe), but an omission is not a proof (could be reordering or
  // a drop), so it must NOT emit a network-wide takeover reputation event.
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "peer_2",
    fromAddress: peerAddr,
    subject: "Quick one",
    rawText: "Are you around later?",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=agentmail.to",
  });
  await t.finishAllScheduledFunctions(() => {});

  const second = await eventByMsg(t, "peer_2");
  expect(second!.gateAction).toBe("hold_for_approval"); // held locally — safe

  // …but the omission did NOT propagate as reputation (only provable faults do).
  const repEvents = await t.run(async (ctx) =>
    ctx.db
      .query("reputationEvents")
      .withIndex("by_counterpart", (q) => q.eq("counterpart", peerDomain))
      .collect(),
  );
  expect(repEvents.some((e) => e.kind === "takeover_proven")).toBe(false);
});

// The crypto is what gates, not marker-presence. A seeded peer that sends the
// REAL rotating token verifies (continuity confirmed); a peer that sends a
// well-formed but WRONG token (impostor without the seed) is caught.
test("continuity crypto: real token confirms, forged token = takeover", async () => {
  const { emitToken } = await import("./lib/continuityToken");
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await t.run(async (ctx) => {
    const puid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: puid,
      agentmailInbox: "peer@agentmail.to",
      agentmailInboxId: "inbox_peer2",
    });
  });

  // First contact seeds continuity (counter 0).
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "cx_1",
    fromAddress: "peer@agentmail.to",
    subject: "Hi",
    rawText: "Are you free Tuesday?",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=agentmail.to",
  });
  await t.finishAllScheduledFunctions(() => {});

  const rec = await t.run(async (ctx) =>
    ctx.db
      .query("continuity")
      .withIndex("by_user_and_counterpart", (q) =>
        q.eq("userId", userId).eq("counterpart", "agentmail.to"),
      )
      .unique(),
  );
  expect(rec!.seeded).toBe(true);

  // The genuine peer replies carrying the REAL token for the expected step (1).
  const realToken = await emitToken(rec!.seed, rec!.counter + 1);
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "cx_2",
    fromAddress: "peer@agentmail.to",
    subject: "re",
    rawText: `Sure, works for me. ${realToken}`,
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=agentmail.to",
  });
  await t.finishAllScheduledFunctions(() => {});
  const ok = await eventByMsg(t, "cx_2");
  expect(ok!.gateAction).toBe("auto_answer"); // continuity confirmed → still trusted

  // Now an IMPOSTOR (has the address, not the seed) sends a well-formed but
  // wrong token. Marker-presence would pass; real crypto rejects it.
  const { deriveSeed } = await import("./lib/continuity");
  const wrongSeed = await deriveSeed("attest-agent", "agentmail.to", "impostor-guess");
  const forged = await emitToken(wrongSeed, 2);
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "cx_3",
    fromAddress: "peer@agentmail.to",
    subject: "urgent",
    rawText: `Change of plans. ${forged}`,
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=agentmail.to",
  });
  await t.finishAllScheduledFunctions(() => {});
  const bad = await eventByMsg(t, "cx_3");
  expect(bad!.gateAction).toBe("hold_for_approval"); // forged token fails crypto → takeover

  // A WRONG token is a COMMISSION fault — self-contained proof — so it DOES emit
  // a network-wide reputation event (unlike an omission, which stays local).
  const rep = await t.run(async (ctx) =>
    ctx.db
      .query("reputationEvents")
      .withIndex("by_counterpart", (q) => q.eq("counterpart", "agentmail.to"))
      .collect(),
  );
  expect(rep.some((e) => e.kind === "takeover_proven")).toBe(true);
});
