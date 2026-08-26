// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestHarness = TestConvex<typeof schema>;

function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", {}));
}

const SAMPLE_RULES = [
  {
    id: "r1",
    action: "payment" as const,
    maxAmount: 500,
    requireVerified: true,
    decision: "allow" as const,
  },
  {
    id: "r2",
    action: "share_info" as const,
    decision: "hold" as const,
  },
];

test("get returns [] before any policy is saved", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const rules = await asUser(t, userId).query(api.policy.get, {});
  expect(rules).toEqual([]);
});

test("save then get round-trips the ruleset for the owner", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await asUser(t, userId).mutation(api.policy.save, { rules: SAMPLE_RULES });
  const rules = await asUser(t, userId).query(api.policy.get, {});
  expect(rules).toHaveLength(2);
  expect(rules[0].action).toBe("payment");
  expect(rules[0].maxAmount).toBe(500);
  expect(rules[1].decision).toBe("hold");
});

test("save replaces the whole ruleset (not append)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await asUser(t, userId).mutation(api.policy.save, { rules: SAMPLE_RULES });
  await asUser(t, userId).mutation(api.policy.save, {
    rules: [{ id: "only", action: "reply", decision: "allow" }],
  });
  const rules = await asUser(t, userId).query(api.policy.get, {});
  expect(rules).toHaveLength(1);
  expect(rules[0].id).toBe("only");
});

test("policies are isolated: user B can't read or overwrite user A's policy", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t);
  const bob = await seedUser(t);

  await asUser(t, alice).mutation(api.policy.save, { rules: SAMPLE_RULES });

  // Bob sees his own (empty) policy, not Alice's.
  expect(await asUser(t, bob).query(api.policy.get, {})).toEqual([]);

  // Bob saving his own policy doesn't touch Alice's.
  await asUser(t, bob).mutation(api.policy.save, {
    rules: [{ id: "b", action: "reply", decision: "hold" }],
  });
  const aliceRules = await asUser(t, alice).query(api.policy.get, {});
  expect(aliceRules).toHaveLength(2);
  expect(aliceRules[0].action).toBe("payment");
});

test("rememberDecision appends a domain-scoped allow rule matching the held item's action", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // A held payment event from acme.com.
  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("events", {
      userId,
      agentmailMsgId: "pay_held",
      fromAddress: "billing@acme.com",
      subject: "Invoice #9",
      rawText: "Please remit $250 for invoice #9.",
      senderVerified: true,
      registryDomain: "acme.com",
      sensitiveRequest: false,
      gateAction: "hold_for_approval",
      gateResolved: "approved",
    }),
  );

  await asUser(t, userId).mutation(api.policy.rememberDecision, { eventId });

  const rules = await asUser(t, userId).query(api.policy.get, {});
  expect(rules).toHaveLength(1);
  expect(rules[0].action).toBe("payment");
  expect(rules[0].appliesTo).toBe("acme.com");
  expect(rules[0].decision).toBe("allow");
  // SAFETY: remembering a payment must NOT create an unbounded auto-pay rule.
  // The remembered rule caps at the amount actually approved ($250 here), so a
  // future $10,000 invoice from the same domain still holds.
  expect(rules[0].maxAmount).toBe(250);
});

test("remembered payment is BOUNDED: a later over-cap payment from the same domain still holds", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // Approve a $250 payment and remember it.
  const firstId = await t.run(async (ctx) =>
    ctx.db.insert("events", {
      userId,
      agentmailMsgId: "pay_first",
      fromAddress: "billing@acme.com",
      subject: "Invoice #9",
      rawText: "Please remit $250 for invoice #9.",
      senderVerified: true,
      registryDomain: "acme.com",
      sensitiveRequest: false,
      gateAction: "hold_for_approval",
      gateResolved: "approved",
    }),
  );
  await asUser(t, userId).mutation(api.policy.rememberDecision, {
    eventId: firstId,
  });

  const rules = await asUser(t, userId).query(api.policy.get, {});
  // The remembered rule allows payments up to $250 from acme.com…
  const { evaluatePolicy } = await import("./lib/policyEngine");
  const underCap = evaluatePolicy(rules as never, {
    action: "payment",
    amount: 200,
    senderVerified: true,
    grade: "A",
    domain: "acme.com",
  });
  expect(underCap?.decision).toBe("allow");
  // …but a $10,000 invoice from the SAME domain is NOT auto-allowed.
  const overCap = evaluatePolicy(rules as never, {
    action: "payment",
    amount: 10000,
    senderVerified: true,
    grade: "A",
    domain: "acme.com",
  });
  expect(overCap).toBeNull();
});

test("rememberDecision is idempotent-ish: no duplicate rule for the same action+domain", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const mk = async (msg: string) =>
    t.run(async (ctx) =>
      ctx.db.insert("events", {
        userId,
        agentmailMsgId: msg,
        fromAddress: "billing@acme.com",
        subject: "Invoice",
        rawText: "Please remit $10.",
        senderVerified: true,
        registryDomain: "acme.com",
        sensitiveRequest: false,
        gateAction: "hold_for_approval",
        gateResolved: "approved",
      }),
    );

  await asUser(t, userId).mutation(api.policy.rememberDecision, {
    eventId: await mk("m1"),
  });
  await asUser(t, userId).mutation(api.policy.rememberDecision, {
    eventId: await mk("m2"),
  });
  const rules = await asUser(t, userId).query(api.policy.get, {});
  expect(rules).toHaveLength(1); // same action+domain → not duplicated
});

test("rememberDecision enforces ownership: can't remember another user's event", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedUser(t);
  const attacker = await seedUser(t);
  const eventId = await t.run(async (ctx) =>
    ctx.db.insert("events", {
      userId: owner,
      agentmailMsgId: "owned",
      fromAddress: "billing@acme.com",
      subject: "Invoice",
      rawText: "Please remit $10.",
      senderVerified: true,
      registryDomain: "acme.com",
      sensitiveRequest: false,
      gateAction: "hold_for_approval",
      gateResolved: "approved",
    }),
  );
  await asUser(t, attacker).mutation(api.policy.rememberDecision, { eventId });
  // attacker's policy stays empty; owner's untouched
  expect(await asUser(t, attacker).query(api.policy.get, {})).toEqual([]);
  expect(await asUser(t, owner).query(api.policy.get, {})).toEqual([]);
});

test("signed-out get returns [] and save is a no-op", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.policy.get, {})).toEqual([]);
  // no identity → save shouldn't throw, and shouldn't persist anything
  await t.mutation(api.policy.save, { rules: SAMPLE_RULES });
  const count = await t.run(async (ctx) =>
    (await ctx.db.query("policies").take(10)).length,
  );
  expect(count).toBe(0);
});
