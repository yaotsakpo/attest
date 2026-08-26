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
