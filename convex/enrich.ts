import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Firecrawl enrichment: scrape a counterpart's homepage so the agent (and the
// user) know WHO they're about to share info with. Synchronous v2 scrape via
// raw fetch (no SDK). No-ops safely without a key, so the demo still runs.

const asStr = (x: unknown): string | undefined =>
  Array.isArray(x) ? (x[0] as string) : (x as string | undefined);

export const scrapeDomain = internalAction({
  args: { domain: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!process.env.FIRECRAWL_API_KEY) return null;
    if (!args.domain || args.domain.includes(" ")) return null;

    // Only enrich real company-style domains, skip obvious ATS/mailer hosts and
    // free-mail providers (they don't describe a counterpart).
    const skip = ["gmail.com", "outlook.com", "yahoo.com", "agentmail.to"];
    if (skip.includes(args.domain)) return null;

    let title: string | undefined;
    let description: string | undefined;
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `https://${args.domain}`,
          formats: ["markdown"],
          onlyMainContent: true,
          maxAge: 172800000, // reuse a <48h cached scrape — saves credits
          timeout: 20000,
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        success?: boolean;
        data?: { metadata?: { title?: unknown; description?: unknown } };
      };
      if (!json.success || !json.data) return null;
      title = asStr(json.data.metadata?.title);
      description = asStr(json.data.metadata?.description);
    } catch {
      return null; // enrichment failure never blocks anything
    }

    if (title || description) {
      await ctx.runMutation(internal.enrich.saveEnrichment, {
        domain: args.domain,
        title,
        description,
      });
    }
    return null;
  },
});

export const saveEnrichment = internalMutation({
  args: {
    domain: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query("domains")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique()
      .catch(() => null);
    if (!row) return null;
    await ctx.db.patch("domains", row._id, {
      enrichTitle: args.title,
      enrichDescription: args.description,
      enrichedAt: Date.now(),
    });
    return null;
  },
});

// `process.env` at Convex runtime; declared for the editor.
declare const process: { env: Record<string, string | undefined> };
