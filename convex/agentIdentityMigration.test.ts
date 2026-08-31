// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { pickGoverningRow, resolveLookupKey } from "./lib/continuityKey";

const modules = import.meta.glob("./**/*.ts");
type TestHarness = TestConvex<typeof schema>;

async function seedUser(t: TestHarness): Promise<Id<"users">> {
  return await t.run(async (ctx) => ctx.db.insert("users", {}));
}

// Prove the §7 migration is NON-DESTRUCTIVE against REAL inserted rows, not by
// assertion. The invariant that matters: an existing domain-keyed continuity
// row (its SEED especially) is never touched when the per-agent key is added.
describe("§7 per-agent keying migration (non-destructive, affirmed on live rows)", () => {
  it("an existing domain-keyed continuity row keeps its seed and still resolves", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    // Insert a LEGACY row exactly as the shipped code writes it today: keyed by
    // domain only, with a real seed. No agentId (the field did not exist yet).
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("continuity", {
        userId,
        counterpart: "acme.com",
        seed: "SEED_do_not_lose_me",
        seeded: true,
        counter: 3,
        seenSteps: [1, 2, 3],
        status: "confirmed",
        updatedAt: 0,
      }),
    );

    // A read with NO known agent id must resolve by domain and find the legacy row.
    const key = resolveLookupKey("acme.com", null);
    expect(key).toEqual({ by: "domain", domain: "acme.com" });

    const domainRow = await t.run(async (ctx) =>
      ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", userId).eq("counterpart", "acme.com"),
        )
        .unique(),
    );
    const governing = pickGoverningRow(null, domainRow);
    // The seed is intact and the legacy row governs.
    expect(governing?.seed).toBe("SEED_do_not_lose_me");
    expect(governing?._id).toBe(legacyId);
  });

  it("adding an agent-keyed row does NOT modify or delete the legacy domain row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("continuity", {
        userId,
        counterpart: "acme.com",
        seed: "LEGACY_SEED",
        seeded: true,
        counter: 5,
        status: "confirmed",
        updatedAt: 0,
      }),
    );

    // Now a message arrives from a KNOWN agent at acme.com. New continuity is
    // established under the finer agent key — a SEPARATE row, legacy untouched.
    await t.run(async (ctx) =>
      ctx.db.insert("continuity", {
        userId,
        counterpart: "acme.com",
        agentId: "agent_alpha",
        seed: "AGENT_SEED",
        seeded: true,
        counter: 1,
        status: "confirmed",
        updatedAt: 1,
      }),
    );

    // Legacy row is byte-for-byte intact: seed and counter unchanged.
    const legacy = await t.run(async (ctx) => ctx.db.get("continuity", legacyId));
    expect(legacy?.seed).toBe("LEGACY_SEED");
    expect(legacy?.counter).toBe(5);
    expect(legacy?.agentId).toBeUndefined();

    // A read for the known agent resolves to the agent row (finer key wins).
    const agentRow = await t.run(async (ctx) =>
      ctx.db
        .query("continuity")
        .withIndex("by_user_and_agent", (q) =>
          q.eq("userId", userId).eq("agentId", "agent_alpha"),
        )
        .unique(),
    );
    // Legacy row: the domain-keyed match that carries no agentId.
    const domainMatches = await t.run(async (ctx) =>
      ctx.db
        .query("continuity")
        .withIndex("by_user_and_counterpart", (q) =>
          q.eq("userId", userId).eq("counterpart", "acme.com"),
        )
        .collect(),
    );
    const domainRow =
      domainMatches.find((r) => r.agentId === undefined) ?? null;
    const governing = pickGoverningRow(agentRow, domainRow);
    expect(governing?.seed).toBe("AGENT_SEED"); // agent-specific record governs
    // And a read with no known agent still falls back to the legacy seed.
    const fallback = pickGoverningRow(null, domainRow);
    expect(fallback?.seed).toBe("LEGACY_SEED");
  });

  it("reputation events keep resolving by domain after the agentId field is added", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    // Legacy domain-keyed reputation event (no agentId).
    await t.run(async (ctx) =>
      ctx.db.insert("reputationEvents", {
        counterpart: "acme.com",
        kind: "continuity_confirmed",
        userId,
        at: 0,
      }),
    );
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("reputationEvents")
        .withIndex("by_counterpart", (q) => q.eq("counterpart", "acme.com"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("continuity_confirmed");
    expect(rows[0]!.agentId).toBeUndefined();
  });
});
