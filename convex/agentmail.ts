import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { emitToken } from "./lib/continuityToken";

// AgentMail REST client (raw fetch — no SDK needed in a Convex action).
// Base + auth per docs.agentmail.to. Key is read from the deployment env.
const BASE = "https://api.agentmail.to/v0";
function headers() {
  return {
    Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Provision (or reuse, via client_id idempotency) an AgentMail inbox for the
// signed-in user, then persist it on their profile. Also registers the inbound
// webhook on that inbox so real mail flows to our /webhooks/agentmail endpoint.
export const provisionInbox = action({
  args: {},
  returns: v.union(
    v.object({ email: v.string(), inboxId: v.string() }),
    v.null(),
  ),
  handler: async (ctx): Promise<{ email: string; inboxId: string } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!process.env.AGENTMAIL_API_KEY) {
      throw new Error("AGENTMAIL_API_KEY not set");
    }

    // reuse existing profile inbox if present
    const existing = await ctx.runQuery(internal.profiles.byUser, { userId });
    if (existing) {
      return {
        email: existing.agentmailInbox,
        inboxId: existing.agentmailInboxId,
      };
    }

    // Mint THIS user's own inbox under the Attest-owned AgentMail account.
    // `client_id` is per-user and idempotent, so a retry returns the same inbox
    // instead of creating a duplicate — and, crucially, two different users
    // never collide onto one shared inbox.
    const res = await fetch(`${BASE}/inboxes`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_id: `attest-${userId}` }),
    });
    if (!res.ok) {
      throw new Error(`AgentMail create inbox failed: ${res.status}`);
    }
    const inbox = (await res.json()) as { inbox_id: string; email: string };

    await ctx.runMutation(internal.profiles.create, {
      userId,
      agentmailInbox: inbox.email,
      agentmailInboxId: inbox.inbox_id,
    });

    // register the inbound webhook on this inbox → our public endpoint.
    // Subscribe to both received and the authentication-failure event so our
    // trust verdict can use AgentMail's own auth classification.
    const site = process.env.CONVEX_SITE_URL;
    try {
      await fetch(`${BASE}/inboxes/${inbox.inbox_id}/webhooks`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          url: `${site}/webhooks/agentmail`,
          event_types: ["message.received", "message.received.unauthenticated"],
          client_id: `attest-hook-${userId}`,
        }),
      });
      // The inbound endpoint verifies the Svix signature when
      // AGENTMAIL_WEBHOOK_SECRET is set (see convex/http.ts verifySvix). If it's
      // unset, inbound is accepted unsigned (demo path) but still only ingests
      // known inboxes.
    } catch {
      // webhook registration failure shouldn't block inbox provisioning
    }

    return { email: inbox.email, inboxId: inbox.inbox_id };
  },
});

// Send an outbound reply in-thread via AgentMail. Called when the agent
// auto-answers a verified counterpart, or when the user approves a held item.
export const sendReply = internalAction({
  args: {
    inboxId: v.string(),
    messageId: v.string(),
    text: v.string(),
  },
  returns: v.union(
    v.object({ messageId: v.string(), threadId: v.string() }),
    v.null(),
  ),
  handler: async (_ctx, args) => {
    if (!process.env.AGENTMAIL_API_KEY) return null;
    const res = await fetch(
      `${BASE}/inboxes/${args.inboxId}/messages/${args.messageId}/reply`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ text: args.text, reply_all: false }),
      },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { message_id: string; thread_id: string };
    return { messageId: j.message_id, threadId: j.thread_id };
  },
});

// Compose + send the agent's reply for one event, then mark it sent. Called on
// auto-answer (verified counterpart) and on user approval of a held item.
// No-ops safely if there's no API key or the event lacks AgentMail ids (so the
// simulated demo path never errors).
export const sendAgentReply = internalAction({
  args: { eventId: v.id("events"), kind: v.union(v.literal("auto"), v.literal("approved")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ev = await ctx.runQuery(internal.events.getRaw, {
      eventId: args.eventId,
    });
    if (!ev || !ev.agentmailInboxId || !process.env.AGENTMAIL_API_KEY) {
      return null;
    }
    // A short, honest reply. Auto-answers acknowledge; approved replies confirm
    // the user authorized sharing. (We never auto-compose sensitive values.)
    let text =
      args.kind === "auto"
        ? "Thanks for your message — this is handled by my assistant. I've noted it and will follow up shortly."
        : "Thanks — I've reviewed and approved your request. I'll follow up with the details separately.";

    // CONTINUITY: if this counterpart is a seeded in-network peer, embed the
    // forward-secret token so THEIR agent can verify we're still the same
    // principal. Every Attest agent reads it; ordinary recipients ignore it.
    const domain = ev.registryDomain ?? ev.fromAddress.split("@")[1] ?? "";
    const rec = await ctx.runQuery(internal.continuityStore.getRecord, {
      userId: ev.userId,
      counterpart: domain,
    });
    if (rec && rec.seeded) {
      const token = await emitToken(rec.seed, rec.counter + 1);
      text = `${text}\n\n${token}`;
    }

    await ctx.runAction(internal.agentmail.sendReply, {
      inboxId: ev.agentmailInboxId,
      messageId: ev.agentmailMsgId,
      text,
    });
    return null;
  },
});

// `process.env` is available at Convex runtime; declared for the editor.
declare const process: { env: Record<string, string | undefined> };
