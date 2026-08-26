import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// Convex Auth registers its own routes (token exchange, etc.).
auth.addHttpRoutes(http);

// --- AgentMail inbound webhook -------------------------------------------
// AgentMail POSTs here on message.received. We resolve the inbox owner, hand
// the raw message to the ingest mutation (dedup + sender-auth + schedule
// extraction), and fast-ack. Body is untrusted: treat as unknown, narrow each
// field, and never throw — an unknown/malformed delivery is acked (2xx) so
// AgentMail doesn't retry a poison payload forever.
function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}

http.route({
  path: "/webhooks/agentmail",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (typeof payload !== "object" || payload === null) {
      return new Response(null, { status: 400 });
    }

    const p = payload as Record<string, unknown>;
    // AgentMail nests the message under `message`; the envelope carries
    // `event_type` (e.g. "message.received.unauthenticated" when the sender
    // failed authentication — AgentMail's own verdict).
    const eventType = str(p.event_type);
    const msg = (typeof p.message === "object" && p.message !== null
      ? p.message
      : p) as Record<string, unknown>;

    const msgId = str(msg.message_id) || str(msg.id);
    if (!msgId) return new Response(null, { status: 202 }); // nothing to dedup on

    // Resolve the inbox owner. AgentMail gives inbox_id on the message; fall back
    // to the `to` address for our own simulated webhooks.
    const toList = Array.isArray(msg.to) ? msg.to : [];
    const inboxId = str(msg.inbox_id) || str(p.inbox_id);
    const inboxAddr = str(toList[0]);
    const userId = await ctx.runQuery(internal.profiles.userByInbox, {
      inbox: inboxAddr,
      inboxId,
    });
    if (!userId) return new Response(null, { status: 202 }); // unknown inbox: ack, ignore

    // From can be a string or an object with .address.
    const from =
      typeof msg.from === "string"
        ? msg.from
        : str((msg.from as Record<string, unknown> | undefined)?.address);

    // Authentication-Results lives in headers (case varies).
    const headers = (typeof msg.headers === "object" && msg.headers !== null
      ? msg.headers
      : {}) as Record<string, unknown>;
    const authResults =
      str(headers["Authentication-Results"]) ||
      str(headers["authentication-results"]) ||
      undefined;

    await ctx.runMutation(internal.inbound.ingestInbound, {
      userId,
      agentmailMsgId: msgId,
      fromAddress: from,
      subject: str(msg.subject),
      rawText: str(msg.text) || str(msg.preview),
      authResultsHeader: authResults,
      // AgentMail's own auth verdict: true when it classified the sender as
      // unauthenticated (SPF/DKIM/DMARC failure).
      agentmailUnauthenticated: eventType === "message.received.unauthenticated",
      // store the inbox + AgentMail message id so the agent can reply in-thread
      agentmailInboxId: inboxId || undefined,
    });

    return new Response(null, { status: 200 });
  }),
});

// --- Agent-queryable trust registry --------------------------------------
// Read-only. An agent (or anyone) can GET the domains this system has learned
// to trust, ranked by earned reputation. This is the seed of a larger idea:
// a trust surface for agents built from observed authenticated behavior, not
// SEO. Returns JSON: { domains: [{ domain, trustScore, verifiedCount, ... }] }.
http.route({
  path: "/registry/domains",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const domains = await ctx.runQuery(internal.registry.listForAgents, {});
    return new Response(JSON.stringify({ domains }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // read-only public registry — allow agent/browser fetches
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=30",
      },
    });
  }),
});

export default http;
