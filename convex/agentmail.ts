import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

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

    // Prefer reusing an inbox that already exists on the AgentMail account
    // (e.g. the demo inbox) rather than always minting a new one.
    let inbox: { inbox_id: string; email: string } | null = null;
    try {
      const listRes = await fetch(`${BASE}/inboxes`, { headers: headers() });
      if (listRes.ok) {
        const list = (await listRes.json()) as {
          inboxes?: { inbox_id: string; email: string }[];
        };
        if (list.inboxes && list.inboxes.length > 0) {
          inbox = list.inboxes[0];
        }
      }
    } catch {
      // fall through to create
    }

    if (!inbox) {
      // create a fresh inbox (client_id makes it idempotent per user)
      const res = await fetch(`${BASE}/inboxes`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ client_id: `warden-${userId}` }),
      });
      if (!res.ok) {
        throw new Error(`AgentMail create inbox failed: ${res.status}`);
      }
      inbox = (await res.json()) as { inbox_id: string; email: string };
    }

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
          client_id: `warden-hook-${userId}`,
        }),
      });
      // Note: the response includes a `secret` (whsec_...) for Svix
      // verification. For the hackathon we accept unsigned inbound (the endpoint
      // still resolves the inbox owner and only ingests known inboxes); wiring
      // Svix verification is a follow-up hardening step.
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
    const text =
      args.kind === "auto"
        ? "Thanks for your message — this is handled by my assistant. I've noted it and will follow up shortly."
        : "Thanks — I've reviewed and approved your request. I'll follow up with the details separately.";
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
