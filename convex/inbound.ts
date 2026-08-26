import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { evaluateSender } from "./lib/senderAuth";
import { domainFor, fromDomainOf } from "./lib/trustScore";

// Persist an inbound email as an `events` row, then schedule OpenAI extraction.
// Idempotent: a duplicate delivery (same AgentMail message id) is dropped so the
// webhook can be retried safely. Internal: only the httpAction calls this.
export const ingestInbound = internalMutation({
  args: {
    userId: v.id("users"),
    agentmailMsgId: v.string(),
    fromAddress: v.string(),
    subject: v.string(),
    rawText: v.string(),
    authResultsHeader: v.optional(v.string()),
    // AgentMail's own auth classification: true when the mail provider flagged
    // the sender as failing authentication. Authoritative when present.
    agentmailUnauthenticated: v.optional(v.boolean()),
    // The inbox that received this email — stored so the agent can reply
    // in-thread later.
    agentmailInboxId: v.optional(v.string()),
  },
  returns: v.union(v.id("events"), v.null()),
  handler: async (ctx, args): Promise<Id<"events"> | null> => {
    // Dedup on the message id (idempotent webhook).
    const existing = await ctx.db
      .query("events")
      .withIndex("by_msg", (q) => q.eq("agentmailMsgId", args.agentmailMsgId))
      .unique()
      .catch(() => null); // .unique() throws on >1 — treat as "already seen"
    if (existing) return null;

    // Verdict precedence: AgentMail's own auth classification is authoritative
    // when present. If the mail provider flagged the sender as unauthenticated,
    // force "couldn't verify" — keeping the honesty discipline (never "fake"/
    // "spoofed"; unverified = we couldn't verify, not a fraud claim). Otherwise
    // fall back to the header-based `evaluateSender` path, which is what our own
    // simulated webhooks (no AgentMail event) rely on.
    const verdict = args.agentmailUnauthenticated
      ? {
          verified: false,
          reason:
            "Sender failed authentication (flagged by the mail provider) — treat as lower confidence, not fake.",
        }
      : evaluateSender(args.fromAddress, args.authResultsHeader ?? null);

    const now = Date.now();
    const domain = domainFor(args.fromAddress, args.authResultsHeader ?? null);
    const eventId = await ctx.db.insert("events", {
      userId: args.userId,
      agentmailMsgId: args.agentmailMsgId,
      agentmailInboxId: args.agentmailInboxId,
      fromAddress: args.fromAddress,
      subject: args.subject,
      rawText: args.rawText,
      senderVerified: verdict.verified,
      verifyReason: verdict.reason,
      registryDomain: domain,
    });

    // Trust-transfer / hub detection: when the AUTHENTICATED domain (`domain`)
    // differs from the From-address domain, this email was sent THROUGH a hub
    // (an ATS like greenhouse.io) on behalf of a company. The auth header
    // authenticated the HUB (its `header.from=` domain passed DMARC), it just
    // isn't ALIGNED with the company's From-domain. So `evaluateSender` calls
    // the alignment "couldn't verify" (verdict.verified=false), which is the
    // right honesty verdict for the COMPANY — but the HUB itself genuinely
    // authenticated. We detect the hub relationship and record it below.
    const authDomain = domain;
    const senderFromDomain = fromDomainOf(args.fromAddress);
    const isHubMismatch =
      !!args.authResultsHeader &&
      !!authDomain &&
      !!senderFromDomain &&
      authDomain !== senderFromDomain &&
      // The registry key came from header.from= (auth), not the From fallback.
      domainFor(args.fromAddress, args.authResultsHeader ?? null) === authDomain;

    // Earn trust for the registry-key domain (the authenticated domain) — the
    // registry grows on every email. Same transaction as the event insert, so
    // the two can never drift. For a hub mismatch the registry key IS the hub,
    // and the hub genuinely authenticated (DMARC passed as it), so it earns a
    // VERIFIED sighting — that authenticated evidence is what later lets the hub
    // vouch for the companies it fronts. For an aligned email the registry key
    // is the sender and the verdict is the honest verified/couldn't-verify.
    await ctx.runMutation(internal.registry.observeDomain, {
      domain,
      verified: isHubMismatch ? true : verdict.verified,
      at: now,
    });

    if (isHubMismatch) {
      // The company domain earns its own registry row so it's a graph node even
      // before it ever sends direct, aligned mail. It's a couldn't-verify
      // sighting on the company ITSELF (we could not prove the mail came from
      // the company, only from the hub); the graph's propagation is what marks
      // it "verified via <hub>" — never asserting the company authenticated.
      await ctx.runMutation(internal.registry.observeDomain, {
        domain: senderFromDomain,
        verified: false,
        at: now,
      });
      // Record the hub -> company edge so the graph can draw agent -> hub ->
      // company and propagate the hub's vouch. verified: the hub authenticated.
      await ctx.runMutation(internal.registry.observeEdge, {
        hub: authDomain,
        company: senderFromDomain,
        verified: true,
        at: now,
      });
    }

    // Schedule extraction (Task 5) — never block the webhook on the LLM call.
    await ctx.scheduler.runAfter(0, internal.extract.run, { eventId });

    return eventId;
  },
});
