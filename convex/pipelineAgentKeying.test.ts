// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestHarness = TestConvex<typeof schema>;

// Prove the pipeline keys continuity by agentId when the counterpart has a known
// identity (spec §7), and falls back to the domain key when it does not — WITHOUT
// ever creating a duplicate seed for the same counterpart.
describe("pipeline per-agent continuity keying (spec §7)", () => {
  it("a message from a KNOWN agent resolves/updates the agent-keyed continuity row", async () => {
    const t = convexTest(schema, modules);
    const domain = "acme.com";
    const fromAddress = `bot@${domain}`;

    const userId: Id<"users"> = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {});
      // membership: the profile inbox must equal the event fromAddress
      await ctx.db.insert("profiles", {
        userId: uid,
        agentmailInbox: fromAddress,
        agentmailInboxId: "inbox_1",
      });
      // an agent identity keyed to the domain (agentId happens to be the domain)
      await ctx.db.insert("agentIdentities", {
        agentId: domain,
        ownerId: "owner_acme",
        scope: "correspond",
        issuer: "self",
        issuedAt: 0,
        issuerSignature: "sig",
        revocationRef: "https://revoke/acme",
        status: "active",
        statusCheckedAt: 0,
      });
      // a PRE-EXISTING agent-keyed continuity seed for this agent
      await ctx.db.insert("continuity", {
        userId: uid,
        counterpart: domain,
        agentId: domain,
        seed: "AGENT_SEED",
        seeded: true,
        counter: 0,
        seenSteps: [],
        status: "confirmed",
        updatedAt: 0,
      });
      return uid;
    });

    // Ingest a message from the known agent (no continuity token in the body).
    const eventId = await t.mutation(internal.inbound.ingestInbound, {
      userId,
      agentmailMsgId: "m1",
      fromAddress,
      subject: "hello",
      rawText: "routine message, no token",
      authResultsHeader: "mx; dmarc=pass header.from=acme.com",
    });
    expect(eventId).not.toBeNull();

    // Run the gate.
    await t.mutation(internal.pipeline.applyExtraction, {
      eventId: eventId!,
      extracted: null,
    });

    // There must be exactly ONE continuity row for this user+domain (the pre-
    // existing agent-keyed one), NOT a new domain-keyed duplicate. The seed is
    // intact (never overwritten).
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", userId).eq("counterpart", domain),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.agentId).toBe(domain);
    expect(rows[0]!.seed).toBe("AGENT_SEED"); // sacred, untouched
  });

  it("a message from an UNKNOWN domain (no identity) keys continuity by domain", async () => {
    const t = convexTest(schema, modules);
    const domain = "nobody.co";
    const fromAddress = `x@${domain}`;

    const userId: Id<"users"> = await t.run(async (ctx) => {
      const uid = await ctx.db.insert("users", {});
      await ctx.db.insert("profiles", {
        userId: uid,
        agentmailInbox: fromAddress,
        agentmailInboxId: "inbox_2",
      });
      return uid; // no agentIdentity, no pre-seeded continuity
    });

    const eventId = await t.mutation(internal.inbound.ingestInbound, {
      userId,
      agentmailMsgId: "m2",
      fromAddress,
      subject: "hi",
      rawText: "routine",
      authResultsHeader: "mx; dmarc=pass header.from=nobody.co",
    });
    await t.mutation(internal.pipeline.applyExtraction, {
      eventId: eventId!,
      extracted: null,
    });

    // Any continuity row created here is DOMAIN-keyed (agentId undefined),
    // because there is no known identity to key by.
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", userId).eq("counterpart", domain),
        )
        .collect(),
    );
    for (const r of rows) expect(r.agentId).toBeUndefined();
  });
});
