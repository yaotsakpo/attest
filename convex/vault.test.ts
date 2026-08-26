// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestHarness = TestConvex<typeof schema>;

// getAuthUserId(ctx) returns identity.subject.split("|")[0]. Seeding a real
// `users` row and using its id as the identity subject makes getAuthUserId
// resolve to that exact users id, so ownership checks (row.userId === userId)
// line up with a genuine document id.
async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", {}));
}

function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

test("add + list: a row is created and returned to its owner", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const u = asUser(t, userId);

  const id = await u.mutation(api.vault.add, {
    label: "Phone",
    value: "555-0100",
    sensitive: false,
  });
  expect(id).not.toBeNull();

  const rows = await u.query(api.vault.list, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].label).toBe("Phone");
  expect(rows[0].value).toBe("555-0100");
  expect(rows[0].sensitive).toBe(false);
  expect(rows[0].userId).toBe(userId);
});

test("add trims label/value and rejects an empty label", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const u = asUser(t, userId);

  const trimmed = await u.mutation(api.vault.add, {
    label: "  Email  ",
    value: "  me@x.com  ",
    sensitive: true,
  });
  expect(trimmed).not.toBeNull();

  const empty = await u.mutation(api.vault.add, {
    label: "   ",
    value: "ignored",
    sensitive: false,
  });
  expect(empty).toBeNull();

  const rows = await u.query(api.vault.list, {});
  expect(rows).toHaveLength(1);
  expect(rows[0].label).toBe("Email");
  expect(rows[0].value).toBe("me@x.com");
});

test("update changes label and value", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const u = asUser(t, userId);

  const id = (await u.mutation(api.vault.add, {
    label: "Old",
    value: "v1",
    sensitive: false,
  })) as Id<"vault">;

  await u.mutation(api.vault.update, {
    id,
    label: "New",
    value: "v2",
  });

  const rows = await u.query(api.vault.list, {});
  expect(rows[0].label).toBe("New");
  expect(rows[0].value).toBe("v2");
  // Sensitivity untouched when omitted.
  expect(rows[0].sensitive).toBe(false);
});

test("setSensitive toggles the flag", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const u = asUser(t, userId);

  const id = (await u.mutation(api.vault.add, {
    label: "SSN",
    value: "xxx",
    sensitive: false,
  })) as Id<"vault">;

  await u.mutation(api.vault.setSensitive, { id, sensitive: true });
  let rows = await u.query(api.vault.list, {});
  expect(rows[0].sensitive).toBe(true);

  await u.mutation(api.vault.setSensitive, { id, sensitive: false });
  rows = await u.query(api.vault.list, {});
  expect(rows[0].sensitive).toBe(false);
});

test("remove deletes the row", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);
  const u = asUser(t, userId);

  const id = (await u.mutation(api.vault.add, {
    label: "Temp",
    value: "v",
    sensitive: false,
  })) as Id<"vault">;

  await u.mutation(api.vault.remove, { id });
  const rows = await u.query(api.vault.list, {});
  expect(rows).toHaveLength(0);
});

test("ownership: a different user cannot update or remove another user's row", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedUser(t);
  const attacker = await seedUser(t);

  const id = (await asUser(t, owner).mutation(api.vault.add, {
    label: "Secret",
    value: "original",
    sensitive: true,
  })) as Id<"vault">;

  // Attacker tries to update -> no-op (mutation returns null, row unchanged).
  await asUser(t, attacker).mutation(api.vault.update, {
    id,
    label: "Hacked",
    value: "tampered",
  });
  // Attacker tries to flip sensitivity -> no-op.
  await asUser(t, attacker).mutation(api.vault.setSensitive, {
    id,
    sensitive: false,
  });
  // Attacker tries to delete -> no-op.
  await asUser(t, attacker).mutation(api.vault.remove, { id });

  // The attacker's own vault is empty (they never saw the owner's row).
  const attackerRows = await asUser(t, attacker).query(api.vault.list, {});
  expect(attackerRows).toHaveLength(0);

  // The owner's row survived, unchanged.
  const ownerRows = await asUser(t, owner).query(api.vault.list, {});
  expect(ownerRows).toHaveLength(1);
  expect(ownerRows[0].label).toBe("Secret");
  expect(ownerRows[0].value).toBe("original");
  expect(ownerRows[0].sensitive).toBe(true);
});

test("unauthenticated calls are inert: list is empty, add returns null", async () => {
  const t = convexTest(schema, modules);
  // No identity attached.
  const rows = await t.query(api.vault.list, {});
  expect(rows).toEqual([]);
  const id = await t.mutation(api.vault.add, {
    label: "x",
    value: "y",
    sensitive: false,
  });
  expect(id).toBeNull();
});
