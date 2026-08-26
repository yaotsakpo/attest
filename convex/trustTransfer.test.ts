// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestHarness = TestConvex<typeof schema>;

// getAuthUserId(ctx) returns identity.subject. Querying as the seeded user makes
// the per-user registry scoping (visibleDomainsForUser) resolve to that user's
// own correspondents instead of an empty signed-out set.
function asUser(t: TestHarness, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, tokenIdentifier: `test|${userId}` });
}

// Seed a user + profile (an inbox owner) and return the user id.
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

// From `jobs@globex.com` but DMARC-authenticated as `greenhouse.io` (header.from).
// header.from= is the hub; the From-address domain is the company reached through it.
const HUB_HEADER = "mx; spf=pass; dkim=pass; dmarc=pass header.from=greenhouse.io";

test("hub mismatch: hub earns VERIFIED, company earns unverified, an edge is created", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  const eventId = await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "hub_msg_1",
    fromAddress: "jobs@globex.com",
    subject: "Your application to Globex",
    rawText: "We received your application.",
    authResultsHeader: HUB_HEADER,
  });
  expect(eventId).not.toBeNull();

  const { hub, company, edges } = await t.run(async (ctx) => {
    const hub = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "greenhouse.io"))
      .unique();
    const company = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "globex.com"))
      .unique();
    const edges = await ctx.db
      .query("domainEdges")
      .withIndex("by_hub", (q) => q.eq("hub", "greenhouse.io"))
      .collect();
    return { hub, company, edges };
  });

  // Hub (greenhouse.io): a VERIFIED sighting — it authenticated (DMARC passed).
  expect(hub).not.toBeNull();
  expect(hub!.verifiedCount).toBe(1);
  expect(hub!.unverifiedCount).toBe(0);
  expect(hub!.isHub).toBe(true);
  expect(hub!.hubCompanyCount).toBe(1);

  // Company (globex.com): observed as UNVERIFIED on itself (only the hub authed).
  expect(company).not.toBeNull();
  expect(company!.verifiedCount).toBe(0);
  expect(company!.unverifiedCount).toBe(1);
  // The company is not itself a hub.
  expect(company!.isHub ?? false).toBe(false);

  // Exactly one hub -> company edge, verifiedVia the hub's DMARC pass.
  expect(edges).toHaveLength(1);
  expect(edges[0].hub).toBe("greenhouse.io");
  expect(edges[0].company).toBe("globex.com");
  expect(edges[0].verifiedVia).toBe(true);
  expect(edges[0].count).toBe(1);
});

test("a second company via the same hub bumps hubCompanyCount to 2 and adds a second edge", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "hub_msg_1",
    fromAddress: "jobs@globex.com",
    subject: "Globex",
    rawText: "Application received.",
    authResultsHeader: HUB_HEADER,
  });
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "hub_msg_2",
    fromAddress: "recruiting@initech.com",
    subject: "Initech",
    rawText: "Application received.",
    authResultsHeader: HUB_HEADER,
  });

  const { hub, edges } = await t.run(async (ctx) => {
    const hub = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "greenhouse.io"))
      .unique();
    const edges = await ctx.db
      .query("domainEdges")
      .withIndex("by_hub", (q) => q.eq("hub", "greenhouse.io"))
      .collect();
    return { hub, edges };
  });

  // Two DISTINCT companies reached through the hub.
  expect(hub!.hubCompanyCount).toBe(2);
  // The hub earned two verified sightings (one per email).
  expect(hub!.verifiedCount).toBe(2);
  expect(edges).toHaveLength(2);
  const companies = edges.map((e) => e.company).sort();
  expect(companies).toEqual(["globex.com", "initech.com"]);
});

test("the same company through the same hub is idempotent: one edge, hubCompanyCount stays 1, count bumps", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "hub_msg_1",
    fromAddress: "jobs@globex.com",
    subject: "Globex 1",
    rawText: "Application received.",
    authResultsHeader: HUB_HEADER,
  });
  // Same (hub, company) pair again — different message id so it isn't deduped.
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "hub_msg_1b",
    fromAddress: "jobs@globex.com",
    subject: "Globex 2",
    rawText: "Second update.",
    authResultsHeader: HUB_HEADER,
  });

  const { hub, edges } = await t.run(async (ctx) => {
    const hub = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "greenhouse.io"))
      .unique();
    const edges = await ctx.db
      .query("domainEdges")
      .withIndex("by_hub", (q) => q.eq("hub", "greenhouse.io"))
      .collect();
    return { hub, edges };
  });

  // Only ONE distinct company, so the count of companies stays 1 …
  expect(hub!.hubCompanyCount).toBe(1);
  expect(edges).toHaveLength(1);
  // … but the edge's sighting count and the hub's verified count both grew.
  expect(edges[0].count).toBe(2);
  expect(hub!.verifiedCount).toBe(2);
});

test("aligned email (From domain == auth domain) creates NO edge and marks NO hub", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "aligned_1",
    fromAddress: "recruiter@acme.com",
    subject: "Thanks for applying",
    rawText: "We received your application.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });

  const { acme, edges } = await t.run(async (ctx) => {
    const acme = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", "acme.com"))
      .unique();
    const edges = await ctx.db.query("domainEdges").take(10);
    return { acme, edges };
  });

  expect(acme).not.toBeNull();
  expect(acme!.verifiedCount).toBe(1);
  expect(acme!.isHub ?? false).toBe(false);
  expect(acme!.hubCompanyCount ?? 0).toBe(0);
  // No hub relationship recorded for an aligned sender.
  expect(edges).toHaveLength(0);
});

test("trustGraph: hub/company/direct kinds, viaHub propagation, inheritedTrust, and edges", async () => {
  const t = convexTest(schema, modules);
  const userId = await seedUser(t);

  // Two companies through greenhouse.io (a hub) …
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "g1",
    fromAddress: "jobs@globex.com",
    subject: "Globex",
    rawText: "Application received.",
    authResultsHeader: HUB_HEADER,
  });
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "g2",
    fromAddress: "recruiting@initech.com",
    subject: "Initech",
    rawText: "Application received.",
    authResultsHeader: HUB_HEADER,
  });
  // … plus a direct, aligned sender (acme.com), which must be kind "direct".
  await t.mutation(internal.inbound.ingestInbound, {
    userId,
    agentmailMsgId: "a1",
    fromAddress: "recruiter@acme.com",
    subject: "Acme",
    rawText: "Application received.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
  });

  const graph = await asUser(t, userId).query(api.registry.trustGraph, {});
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  // Hub node.
  const gh = byId.get("greenhouse.io")!;
  expect(gh.kind).toBe("hub");
  expect(gh.isHub).toBe(true);
  expect(gh.hubCompanyCount).toBe(2);
  expect(gh.connectsToAgent).toBe(true);

  // Company nodes: kind "company", hanging off the hub, inheriting its vouch.
  for (const name of ["globex.com", "initech.com"]) {
    const c = byId.get(name)!;
    expect(c.kind).toBe("company");
    expect(c.viaHub).toBe("greenhouse.io");
    expect(c.inheritedTrust).toBe(true);
    expect(c.connectsToAgent).toBe(false);
  }

  // Direct aligned sender.
  const acme = byId.get("acme.com")!;
  expect(acme.kind).toBe("direct");
  expect(acme.isHub).toBe(false);
  expect(acme.viaHub).toBeNull();
  expect(acme.inheritedTrust).toBe(false);
  expect(acme.connectsToAgent).toBe(true);

  // Edges: two hub -> company edges, all sourced at the hub.
  expect(graph.edges).toHaveLength(2);
  for (const e of graph.edges) {
    expect(e.source).toBe("greenhouse.io");
    expect(["globex.com", "initech.com"]).toContain(e.target);
    expect(e.verifiedVia).toBe(true);
  }
  expect(graph.edges.map((e) => e.target).sort()).toEqual([
    "globex.com",
    "initech.com",
  ]);
});

// The trust scores are global (collective reputation), but a user only ever SEES
// the domains their OWN agent corresponded with. User B must never see a domain
// that only ever emailed User A — no cross-tenant peeking.
test("registry is per-user visible: user B never sees user A's correspondents", async () => {
  const t = convexTest(schema, modules);

  const alice = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: uid,
      agentmailInbox: "alice@agentmail.to",
      agentmailInboxId: "inbox_alice",
    });
    return uid;
  });
  const bob = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {});
    await ctx.db.insert("profiles", {
      userId: uid,
      agentmailInbox: "bob@agentmail.to",
      agentmailInboxId: "inbox_bob",
    });
    return uid;
  });

  // Alice corresponds with alicecorp.com; Bob with bobcorp.com.
  await t.mutation(internal.inbound.ingestInbound, {
    userId: alice,
    agentmailMsgId: "a_msg",
    fromAddress: "team@alicecorp.com",
    subject: "Hi Alice",
    rawText: "Hello.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=alicecorp.com",
  });
  await t.mutation(internal.inbound.ingestInbound, {
    userId: bob,
    agentmailMsgId: "b_msg",
    fromAddress: "team@bobcorp.com",
    subject: "Hi Bob",
    rawText: "Hello.",
    authResultsHeader: "mx; spf=pass; dkim=pass; dmarc=pass header.from=bobcorp.com",
  });

  // Both domains exist GLOBALLY in the registry table…
  const globalCount = await t.run(async (ctx) => {
    const rows = await ctx.db.query("domains").take(100);
    return rows.map((r) => r.domain).sort();
  });
  expect(globalCount).toEqual(["alicecorp.com", "bobcorp.com"]);

  // …but Alice's listDomains shows ONLY alicecorp.com, and Bob's ONLY bobcorp.com.
  const aliceList = await asUser(t, alice).query(api.registry.listDomains, {});
  const bobList = await asUser(t, bob).query(api.registry.listDomains, {});
  expect(aliceList.map((d) => d.domain)).toEqual(["alicecorp.com"]);
  expect(bobList.map((d) => d.domain)).toEqual(["bobcorp.com"]);

  // Same isolation on the trust graph.
  const aliceGraph = await asUser(t, alice).query(api.registry.trustGraph, {});
  const bobGraph = await asUser(t, bob).query(api.registry.trustGraph, {});
  expect(aliceGraph.nodes.map((n) => n.id)).toEqual(["alicecorp.com"]);
  expect(bobGraph.nodes.map((n) => n.id)).toEqual(["bobcorp.com"]);
});
