// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("ingestInbound writes a verified event and is idempotent on message id", async () => {
  const t = convexTest(schema, modules);

  // Seed a user + their profile (inbox owner).
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: uid,
      agentmailInbox: "seeker@agentmail.to",
      agentmailInboxId: "inbox_1",
    });
    return uid;
  });

  // First delivery: a DMARC-aligned recruiter email -> senderVerified true.
  const eventId = await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "msg_1",
    fromAddress: "recruiter@acme.com",
    subject: "Thanks for applying",
    rawText: "We received your application.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });
  expect(eventId).not.toBeNull();

  // Duplicate delivery of the SAME message id -> dropped (returns null).
  const dupe = await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "msg_1",
    fromAddress: "recruiter@acme.com",
    subject: "Thanks for applying",
    rawText: "We received your application.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });
  expect(dupe).toBeNull();

  // Exactly one event row, and it is verified.
  const events = await t.run(async (ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0].senderVerified).toBe(true);

  // The registry earned trust for acme.com from this verified email — and the
  // dedup means the dupe did NOT double-count it.
  const acme = await t.run(async (ctx) =>
    ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "acme.com"))
      .unique(),
  );
  expect(acme).not.toBeNull();
  expect(acme!.verifiedCount).toBe(1);
  expect(acme!.unverifiedCount).toBe(0);
  expect(acme!.trustScore).toBeGreaterThan(0.5); // earned above neutral
});

test("ingestInbound marks an unaligned sender as couldn't-verify with a reason", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: uid,
      agentmailInbox: "seeker@agentmail.to",
      agentmailInboxId: "inbox_1",
    });
    return uid;
  });

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "msg_2",
    fromAddress: "recruiter@acme.com",
    subject: "Interview?",
    rawText: "Are you free Thursday?",
    // authenticated as a different domain than the From address
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=sketchy.example",
  });

  const events = await t.run(async (ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
  expect(events).toHaveLength(1);
  expect(events[0].senderVerified).toBe(false);
  expect(events[0].verifyReason).toMatch(/not fake/i);
});
