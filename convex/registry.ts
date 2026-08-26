import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import { computeTrustScore } from "./lib/trustScore";
import { gradeFor, type Grade } from "./lib/grade";

// Record one observation of a sending domain into the trust registry. Called
// from ingestInbound on every email. Upserts the domain row and recomputes its
// earned trust score. Internal: the registry is written only by the pipeline.
export const observeDomain = internalMutation({
  args: {
    domain: v.string(),
    verified: v.boolean(),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!args.domain) return null;

    const existing = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique()
      .catch(() => null);

    if (!existing) {
      const verifiedCount = args.verified ? 1 : 0;
      const unverifiedCount = args.verified ? 0 : 1;
      await ctx.db.insert("domains", {
        domain: args.domain,
        verifiedCount,
        unverifiedCount,
        trustScore: computeTrustScore(verifiedCount, unverifiedCount),
        firstSeen: args.at,
        lastSeen: args.at,
      });
      // First time we've seen this counterpart → enrich it with Firecrawl so we
      // know who it is. Non-blocking; no-ops without a Firecrawl key.
      await ctx.scheduler.runAfter(0, internal.enrich.scrapeDomain, {
        domain: args.domain,
      });
      return null;
    }

    const verifiedCount = existing.verifiedCount + (args.verified ? 1 : 0);
    const unverifiedCount = existing.unverifiedCount + (args.verified ? 0 : 1);
    await ctx.db.patch("domains", existing._id, {
      verifiedCount,
      unverifiedCount,
      trustScore: computeTrustScore(verifiedCount, unverifiedCount),
      lastSeen: args.at,
    });
    return null;
  },
});

// Record one hub -> company relationship, learned from a from/auth mismatch on
// a DMARC-pass email (recruiter@acme.com authenticating as greenhouse.io means
// "Acme recruits through Greenhouse"). Called from ingestInbound in the SAME
// transaction as observeDomain, so the domain reputation and the graph can't
// drift. Idempotent per (hub, company): the edge is upserted (count bumped),
// never appended. Also maintains the hub domain's `isHub` / `hubCompanyCount`
// so the hub is flagged the first time it authenticates for a company.
export const observeEdge = internalMutation({
  args: {
    hub: v.string(), // authenticated (intermediary) domain
    company: v.string(), // From-address domain reached through it
    verified: v.boolean(), // did the hub pass DMARC on this sighting
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // Guard: need both sides, and they must actually differ to be a hub edge.
    if (!args.hub || !args.company || args.hub === args.company) return null;

    const existingEdge = await ctx.db
      .query("domainEdges")
      .withIndex("by_hub_and_company", (q) =>
        q.eq("hub", args.hub).eq("company", args.company),
      )
      .unique()
      .catch(() => null);

    let isNewCompanyForHub = false;
    if (!existingEdge) {
      isNewCompanyForHub = true;
      await ctx.db.insert("domainEdges", {
        hub: args.hub,
        company: args.company,
        count: 1,
        verifiedVia: args.verified,
        firstSeen: args.at,
        lastSeen: args.at,
      });
    } else {
      await ctx.db.patch("domainEdges", existingEdge._id, {
        count: existingEdge.count + 1,
        verifiedVia: existingEdge.verifiedVia || args.verified,
        lastSeen: args.at,
      });
    }

    // Flag the hub domain. hubCompanyCount only grows when a NEW distinct
    // company reaches through this hub for the first time (idempotent per pair).
    const hubDoc = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", args.hub))
      .unique()
      .catch(() => null);
    if (hubDoc) {
      const prevCount = hubDoc.hubCompanyCount ?? 0;
      await ctx.db.patch("domains", hubDoc._id, {
        isHub: true,
        hubCompanyCount: isNewCompanyForHub ? prevCount + 1 : prevCount,
      });
    }
    return null;
  },
});

// The live registry for the UI panel — domains this agent has learned to trust,
// most-trusted first. Public read; the registry is not user-private (it's the
// agent's map of the internet), but we bound the read.
export const listDomains = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("domains"),
      _creationTime: v.number(),
      domain: v.string(),
      verifiedCount: v.number(),
      unverifiedCount: v.number(),
      trustScore: v.number(),
      firstSeen: v.number(),
      lastSeen: v.number(),
      isHub: v.optional(v.boolean()),
      hubCompanyCount: v.optional(v.number()),
      enrichTitle: v.optional(v.string()),
      enrichDescription: v.optional(v.string()),
      enrichedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx): Promise<Doc<"domains">[]> => {
    const rows = await ctx.db.query("domains").take(500);
    return rows.sort((a, b) => b.trustScore - a.trustScore);
  },
});

// The DECISION view for the trust-map: each domain plus the agent's gate story
// for the signed-in user — did any message from it request sensitive info, and
// did the agent auto-answer or HOLD it. This is what turns the graph from
// decoration into "why the agent withheld your SSN". Auth-scoped on the events.
export type DomainDecision = {
  domain: string;
  trustScore: number;
  verifiedCount: number;
  unverifiedCount: number;
  askedSensitive: boolean; // any email from this domain requested sensitive info
  held: boolean; // agent held (didn't auto-release) at least one message
  heldSubject: string | null; // the held message subject, for the popover
  reason: string | null; // the gate's honest reason
};

export const domainsWithDecisions = query({
  args: {},
  returns: v.array(
    v.object({
      domain: v.string(),
      trustScore: v.number(),
      verifiedCount: v.number(),
      unverifiedCount: v.number(),
      askedSensitive: v.boolean(),
      held: v.boolean(),
      heldSubject: v.union(v.string(), v.null()),
      reason: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx): Promise<DomainDecision[]> => {
    const userId = await getAuthUserId(ctx);
    const domains = await ctx.db.query("domains").take(500);

    // events for this user, to attach the gate story per domain
    const events = userId
      ? await ctx.db
          .query("events")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(500)
      : [];

    const byDomain = new Map<string, typeof events>();
    for (const e of events) {
      const d = e.registryDomain ?? "";
      if (!d) continue;
      const arr = byDomain.get(d) ?? [];
      arr.push(e);
      byDomain.set(d, arr);
    }

    return domains
      .map((d) => {
        const evs = byDomain.get(d.domain) ?? [];
        const heldEv = evs.find((e) => e.gateAction === "hold_for_approval");
        const askedSensitive = evs.some((e) => e.sensitiveRequest === true);
        return {
          domain: d.domain,
          trustScore: d.trustScore,
          verifiedCount: d.verifiedCount,
          unverifiedCount: d.unverifiedCount,
          askedSensitive,
          held: !!heldEv,
          heldSubject: heldEv?.subject ?? null,
          reason: heldEv?.gateReason ?? null,
        };
      })
      .sort((a, b) => b.trustScore - a.trustScore);
  },
});

// Clean, stable shape for the public /registry/domains endpoint — no Convex
// system fields (_id/_creationTime) leak into the agent-facing contract.
export type RegistryEntry = {
  domain: string;
  trustScore: number;
  verifiedCount: number;
  unverifiedCount: number;
  firstSeen: number;
  lastSeen: number;
};

export const listForAgents = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      domain: v.string(),
      trustScore: v.number(),
      verifiedCount: v.number(),
      unverifiedCount: v.number(),
      firstSeen: v.number(),
      lastSeen: v.number(),
    }),
  ),
  handler: async (ctx): Promise<RegistryEntry[]> => {
    const rows = await ctx.db.query("domains").take(500);
    return rows
      .sort((a, b) => b.trustScore - a.trustScore)
      .map((d) => ({
        domain: d.domain,
        trustScore: Math.round(d.trustScore * 1000) / 1000,
        verifiedCount: d.verifiedCount,
        unverifiedCount: d.unverifiedCount,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
      }));
  },
});

// ---------------------------------------------------------------------------
// TRUST GRAPH — the full graph for rendering agent -> (hub | direct) -> company.
//
// Nodes are domains. Edges are the hub -> company relationships learned from
// from/auth mismatches. The frontend adds the single "agent" node itself and
// draws agent -> every top-level node (hubs + direct domains); the companies
// hang off their hub via the returned edges.
//
// PROPAGATION (trust transfer): a company reached only through a VERIFIED hub
// inherits a trust PATH — its effective status is "verified via <hub>", not
// "couldn't verify". A brand-new company seen only behind a trusted hub starts
// trusted, because the hub vouches for it. We keep the honesty discipline: this
// is never "fake" vs "real"; "verified via Greenhouse" is the calmer truth for
// the ATS mismatch. A hub counts as trustworthy-enough-to-vouch when it has any
// verified sighting of its own AND its own grade is C or better (not F/D).
// ---------------------------------------------------------------------------

export type TrustGraphNode = {
  id: string; // the domain (node id)
  kind: "hub" | "company" | "direct";
  isHub: boolean;
  trustScore: number;
  verifiedCount: number; // grade inputs
  unverifiedCount: number;
  grade: Grade;
  hubCompanyCount: number; // how many companies reach through it (0 if not a hub)
  connectsToAgent: boolean; // top-level (drawn straight off the agent node)
  // Propagation: set for companies reached through a hub. Names the best hub
  // that vouches for it and whether that vouch is a VERIFIED path.
  viaHub: string | null; // the vouching hub's domain (best available), else null
  inheritedTrust: boolean; // true iff reached via a hub that can vouch (verified)
};

export type TrustGraphEdge = {
  source: string; // hub domain
  target: string; // company domain
  count: number;
  verifiedVia: boolean; // the hub authenticated (DMARC pass) on this relationship
};

export type TrustGraph = {
  nodes: TrustGraphNode[];
  edges: TrustGraphEdge[];
};

export const trustGraph = query({
  args: {},
  returns: v.object({
    nodes: v.array(
      v.object({
        id: v.string(),
        kind: v.union(
          v.literal("hub"),
          v.literal("company"),
          v.literal("direct"),
        ),
        isHub: v.boolean(),
        trustScore: v.number(),
        verifiedCount: v.number(),
        unverifiedCount: v.number(),
        grade: v.union(
          v.literal("A"),
          v.literal("B"),
          v.literal("C"),
          v.literal("D"),
          v.literal("F"),
        ),
        hubCompanyCount: v.number(),
        connectsToAgent: v.boolean(),
        viaHub: v.union(v.string(), v.null()),
        inheritedTrust: v.boolean(),
      }),
    ),
    edges: v.array(
      v.object({
        source: v.string(),
        target: v.string(),
        count: v.number(),
        verifiedVia: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx): Promise<TrustGraph> => {
    const domains = await ctx.db.query("domains").take(1000);
    const edges = await ctx.db.query("domainEdges").take(2000);

    // Index domains by name for O(1) lookup.
    const domainByName = new Map<string, Doc<"domains">>();
    for (const d of domains) domainByName.set(d.domain, d);

    // A hub can VOUCH if it has its own verified evidence and a passing grade.
    const canVouch = (hubName: string): boolean => {
      const h = domainByName.get(hubName);
      if (!h) return false;
      if (h.verifiedCount <= 0) return false;
      const g = gradeFor(h.trustScore, h.verifiedCount, h.unverifiedCount);
      return g === "A" || g === "B" || g === "C";
    };

    // Which domains are companies (appear as an edge target), and the best hub
    // that vouches for each. "Best" = a vouching hub if any, else the
    // highest-trust hub seen. Also record every hub name.
    const hubNames = new Set<string>();
    const companyTargets = new Set<string>();
    // company -> chosen { hub, inherited }
    const bestVouch = new Map<string, { hub: string; inherited: boolean }>();

    for (const e of edges) {
      hubNames.add(e.hub);
      companyTargets.add(e.company);

      const vouches = e.verifiedVia && canVouch(e.hub);
      const current = bestVouch.get(e.company);
      if (!current) {
        bestVouch.set(e.company, { hub: e.hub, inherited: vouches });
      } else if (vouches && !current.inherited) {
        // Prefer a vouching hub over a non-vouching one.
        bestVouch.set(e.company, { hub: e.hub, inherited: true });
      } else if (vouches && current.inherited) {
        // Both vouch: keep the higher-trust hub.
        const curHub = domainByName.get(current.hub);
        const newHub = domainByName.get(e.hub);
        if ((newHub?.trustScore ?? 0) > (curHub?.trustScore ?? 0)) {
          bestVouch.set(e.company, { hub: e.hub, inherited: true });
        }
      }
    }

    const nodes: TrustGraphNode[] = domains.map((d) => {
      const isHub = (d.isHub ?? false) || hubNames.has(d.domain);
      const isCompany = companyTargets.has(d.domain);
      // A domain can be both a target-of-a-hub AND itself a hub; hub wins for
      // the top-level layout so it still hangs off the agent.
      const kind: "hub" | "company" | "direct" = isHub
        ? "hub"
        : isCompany
          ? "company"
          : "direct";

      const vouch = bestVouch.get(d.domain) ?? null;

      return {
        id: d.domain,
        kind,
        isHub,
        trustScore: Math.round(d.trustScore * 1000) / 1000,
        verifiedCount: d.verifiedCount,
        unverifiedCount: d.unverifiedCount,
        grade: gradeFor(d.trustScore, d.verifiedCount, d.unverifiedCount),
        hubCompanyCount: d.hubCompanyCount ?? 0,
        // Top-level nodes (drawn straight off the agent) are hubs and direct
        // domains. A company reached through a hub hangs off the hub instead.
        connectsToAgent: kind !== "company",
        viaHub: kind === "company" ? (vouch?.hub ?? null) : null,
        inheritedTrust: kind === "company" ? (vouch?.inherited ?? false) : false,
      };
    });

    const graphEdges: TrustGraphEdge[] = edges
      .map((e) => ({
        source: e.hub,
        target: e.company,
        count: e.count,
        verifiedVia: e.verifiedVia,
      }))
      .sort((a, b) => b.count - a.count);

    // Most-trusted nodes first, hubs floated up for stable rendering.
    nodes.sort((a, b) => {
      if (a.isHub !== b.isHub) return a.isHub ? -1 : 1;
      return b.trustScore - a.trustScore;
    });

    return { nodes, edges: graphEdges };
  },
});
