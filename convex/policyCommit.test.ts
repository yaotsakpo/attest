// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { verifyCommitment, verifyChain } from "./lib/policyCommitment";

const modules = import.meta.glob("./**/*.ts");
type TestHarness = TestConvex<typeof schema>;

function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}
async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", {}));
}

const RULES_A = [
  { id: "pay500", action: "payment" as const, maxAmount: 500, decision: "allow" as const },
];
const RULES_B = [
  { id: "pay500", action: "payment" as const, maxAmount: 500, decision: "allow" as const },
  { id: "share", action: "share_info" as const, decision: "hold" as const },
];

test("committing a saved policy writes a rooted commitment that the rules verify against", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_A });

  await asUser(t, userId).action(api.policyCommit.commitCurrent, {});

  const chain = await asUser(t, userId).query(api.policyCommit.chain, {});
  expect(chain).toHaveLength(1);
  expect(chain[0].version).toBe(1);
  expect(chain[0].prev).toBeNull();
  // the ACTUAL rules verify against the stored commitment
  expect(await verifyCommitment(RULES_A, chain[0])).toBe(true);
});

test("a policy CHANGE appends a new version chained to the last (governance change is legible)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_A });
  await t.finishAllScheduledFunctions(() => {});
  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_B });
  await t.finishAllScheduledFunctions(() => {});

  const chain = await asUser(t, userId).query(api.policyCommit.chain, {});
  expect(chain).toHaveLength(2);
  expect(chain[1].version).toBe(2);
  expect(chain[1].prev).toBe(chain[0].commit);
  expect(await verifyChain(chain)).toBe(true);
  // v2 binds the NEW rules, v1 the old — a silent swap would fail verification
  expect(await verifyCommitment(RULES_B, chain[1])).toBe(true);
  expect(await verifyCommitment(RULES_A, chain[1])).toBe(false);
});

test("committing an UNCHANGED policy is a no-op (no spurious version bump)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_A });
  await t.finishAllScheduledFunctions(() => {});
  // an explicit re-commit with unchanged rules must NOT bump the version
  await asUser(t, userId).action(api.policyCommit.commitCurrent, {});

  const chain = await asUser(t, userId).query(api.policyCommit.chain, {});
  expect(chain).toHaveLength(1); // no new version for identical governance
});

test("save AUTO-commits via the scheduler (no manual commit call needed)", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_A });
  await t.finishAllScheduledFunctions(() => {});

  const chain = await asUser(t, userId).query(api.policyCommit.chain, {});
  expect(chain).toHaveLength(1);
  expect(await verifyCommitment(RULES_A, chain[0])).toBe(true);

  // a real change through save appends v2 automatically
  await asUser(t, userId).mutation(api.policy.save, { rules: RULES_B });
  await t.finishAllScheduledFunctions(() => {});
  const chain2 = await asUser(t, userId).query(api.policyCommit.chain, {});
  expect(chain2).toHaveLength(2);
  expect(await verifyChain(chain2)).toBe(true);
});

test("chain is per-user isolated", async () => {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t);
  const bob = await seedUser(t);
  await asUser(t, alice).mutation(api.policy.save, { rules: RULES_A });
  await asUser(t, alice).action(api.policyCommit.commitCurrent, {});

  expect(await asUser(t, bob).query(api.policyCommit.chain, {})).toEqual([]);
});
