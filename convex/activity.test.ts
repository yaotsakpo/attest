// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestHarness = TestConvex<typeof schema>;

async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", {}));
}

function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

// Seed an event row for a user with a given gate outcome.
async function seedEvent(
  t: TestHarness,
  userId: Id<"users">,
  opts: {
    msgId: string;
    subject: string;
    gateAction: "hold_for_approval" | "auto_answer";
    sensitiveRequest?: boolean;
    gateResolved?: "approved" | "dismissed";
  },
): Promise<Id<"events">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      userId,
      agentmailMsgId: opts.msgId,
      fromAddress: "recruiter@acme.com",
      subject: opts.subject,
      rawText: "body",
      senderVerified: opts.gateAction === "auto_answer",
      sensitiveRequest: opts.sensitiveRequest ?? false,
      gateAction: opts.gateAction,
      gateReason: "seeded",
      ...(opts.gateResolved ? { gateResolved: opts.gateResolved } : {}),
    }),
  );
}

test("held returns only unresolved held items for the owner", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await seedEvent(t, userId, {
    msgId: "h1",
    subject: "Held one",
    gateAction: "hold_for_approval",
    sensitiveRequest: true,
  });
  await seedEvent(t, userId, {
    msgId: "h2",
    subject: "Held but resolved",
    gateAction: "hold_for_approval",
    gateResolved: "approved",
  });
  await seedEvent(t, userId, {
    msgId: "a1",
    subject: "Auto answered",
    gateAction: "auto_answer",
  });

  const held = await asUser(t, userId).query(api.activity.held, {});
  expect(held).toHaveLength(1);
  expect(held[0].subject).toBe("Held one");
  expect(held[0].gateAction).toBe("hold_for_approval");
  expect(held[0].gateResolved).toBeNull();
  expect(held[0].sensitiveRequest).toBe(true);
});

test("held is scoped to the caller — another user's held items are not returned", async () => {
  const t = convexTest(schema, modules);
  const a = await seedUser(t);
  const b = await seedUser(t);

  await seedEvent(t, a, {
    msgId: "a_held",
    subject: "A's held",
    gateAction: "hold_for_approval",
  });

  const bHeld = await asUser(t, b).query(api.activity.held, {});
  expect(bHeld).toHaveLength(0);
});

test("log paginates: page shape, page size, and continueCursor", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  for (let i = 0; i < 5; i++) {
    await seedEvent(t, userId, {
      msgId: `log_${i}`,
      subject: `Event ${i}`,
      gateAction: i % 2 === 0 ? "hold_for_approval" : "auto_answer",
    });
  }

  const page1 = await asUser(t, userId).query(api.activity.log, {
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(page1.page).toHaveLength(2);
  expect(page1.isDone).toBe(false);
  expect(typeof page1.continueCursor).toBe("string");
  // Each item is the projected ActivityItem shape, not a raw event.
  expect(page1.page[0]).toHaveProperty("gateAction");
  expect(page1.page[0]).toHaveProperty("createdAt");
  // The raw email body NEVER leaves the server — the trace uses server-derived
  // classification instead.
  expect(page1.page[0]).not.toHaveProperty("rawText");
  expect(page1.page[0]).toHaveProperty("requestedAction");
  expect(page1.page[0]).toHaveProperty("requestedAmount");

  // Follow the cursor to the next page.
  const page2 = await asUser(t, userId).query(api.activity.log, {
    paginationOpts: { numItems: 2, cursor: page1.continueCursor },
  });
  expect(page2.page).toHaveLength(2);
  const seen = new Set([
    ...page1.page.map((e) => e._id),
    ...page2.page.map((e) => e._id),
  ]);
  expect(seen.size).toBe(4); // no overlap across the two pages
});

test("resolve marks an item and it drops out of held", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  const id = await seedEvent(t, userId, {
    msgId: "r1",
    subject: "Please approve",
    gateAction: "hold_for_approval",
  });

  // Present in held before resolution.
  let held = await asUser(t, userId).query(api.activity.held, {});
  expect(held).toHaveLength(1);

  await asUser(t, userId).mutation(api.activity.resolve, {
    id,
    decision: "approved",
  });

  // Gone from held after resolution.
  held = await asUser(t, userId).query(api.activity.held, {});
  expect(held).toHaveLength(0);

  const ev = await t.run(async (ctx) => ctx.db.get("events", id));
  expect(ev!.gateResolved).toBe("approved");
});

test("ownership: a different user cannot resolve another user's held item", async () => {
  const t = convexTest(schema, modules);
  const owner = await seedUser(t);
  const attacker = await seedUser(t);

  const id = await seedEvent(t, owner, {
    msgId: "own1",
    subject: "Owner's held",
    gateAction: "hold_for_approval",
  });

  // Attacker tries to resolve -> no-op.
  await asUser(t, attacker).mutation(api.activity.resolve, {
    id,
    decision: "dismissed",
  });

  const ev = await t.run(async (ctx) => ctx.db.get("events", id));
  expect(ev!.gateResolved ?? null).toBeNull();

  // Still held for the actual owner.
  const held = await asUser(t, owner).query(api.activity.held, {});
  expect(held).toHaveLength(1);
});
