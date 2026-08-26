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
