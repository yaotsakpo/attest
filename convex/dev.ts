import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Demo/CLI utilities. Internal only — never exposed to clients. Used to inspect
// and reset demo data from the terminal during a live demo. Not part of the app
// runtime; no client or server code imports these.

// Read the live board/registry state from the CLI (no UI needed) to verify the
// pipeline during a demo: `npx convex run dev:peek`.
export const peek = internalQuery({
  args: {},
  returns: v.object({
    applications: v.array(
      v.object({
        company: v.string(),
        role: v.string(),
        stage: v.string(),
        trust: v.string(),
      }),
    ),
    eventCount: v.number(),
    domains: v.array(v.object({ domain: v.string(), score: v.number() })),
    decisions: v.array(
      v.object({
        from: v.string(),
        verified: v.boolean(),
        sensitive: v.boolean(),
        gate: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const apps = await ctx.db.query("applications").take(100);
    const events = await ctx.db.query("events").take(100);
    const domains = await ctx.db.query("domains").take(100);
    return {
      applications: apps.map((a) => ({
        company: a.company,
        role: a.role,
        stage: a.stage,
        trust: a.trustState,
      })),
      eventCount: events.length,
      domains: domains.map((d) => ({ domain: d.domain, score: d.trustScore })),
      decisions: events.map((e) => ({
        from: e.fromAddress,
        verified: e.senderVerified,
        sensitive: e.sensitiveRequest ?? false,
        gate: e.gateAction ?? null,
      })),
    };
  },
});

// Seed an example policy for the most-recent user so the Agent drawer shows how
// rules render — presets (payment/share_info/reply) + a custom one, with a mix
// of conditions and decisions: `npx convex run dev:seedPolicy`.
export const seedPolicy = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const users = await ctx.db.query("users").order("desc").take(1);
    const user = users[0];
    if (!user) return "no users yet — sign up first";

    const rules = [
      // preset: auto-pay small invoices, but only to verified counterparts
      {
        id: "seed_pay",
        action: "payment" as const,
        maxAmount: 500,
        requireVerified: true,
        decision: "allow" as const,
      },
      // preset: never auto-share sensitive info — always hold
      {
        id: "seed_share",
        action: "share_info" as const,
        decision: "hold" as const,
      },
      // preset: auto-reply, but only to counterparts graded B or better
      {
        id: "seed_reply",
        action: "reply" as const,
        minGrade: "B" as const,
        decision: "allow" as const,
      },
      // per-domain override: always allow payments to a trusted vendor
      {
        id: "seed_vendor",
        action: "payment" as const,
        appliesTo: "acme.com",
        decision: "allow" as const,
      },
      // custom: a user-named action, always held for review
      {
        id: "seed_custom",
        action: "custom" as const,
        customLabel: "contract_signing",
        decision: "hold" as const,
      },
    ];

    const existing = await ctx.db
      .query("policies")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique()
      .catch(() => null);
    if (existing) {
      await ctx.db.patch(existing._id, { rules, updatedAt: 0 });
    } else {
      await ctx.db.insert("policies", { userId: user._id, rules, updatedAt: 0 });
    }
    return `seeded ${rules.length} example rules for ${user._id}`;
  },
});

// Wipe demo data (applications, events, drafts, domains, domainEdges) for a
// clean re-run: `npx convex run dev:resetDemo`. Leaves users/profiles/policies
// intact so you stay signed in with your settings.
export const resetDemo = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    for (const table of [
      "applications",
      "events",
      "drafts",
      "domains",
      "domainEdges",
    ] as const) {
      const rows = await ctx.db.query(table).take(2000);
      for (const r of rows) await ctx.db.delete(table, r._id);
    }
    return "demo data cleared";
  },
});
