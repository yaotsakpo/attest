import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const SYS = `You extract structured facts from a single job-search email. Return ONLY valid JSON:
{"company": string|null, "role": string|null,
 "eventType": "confirmation"|"recruiter_reply"|"interview_invite"|"rejection"|"offer",
 "interview_date": string|null, "next_action": string|null, "sentiment": "positive"|"neutral"|"negative"}
Rules: return null for anything NOT present in the email. NEVER guess or fabricate. If unsure of eventType, use "recruiter_reply".`;

// Extract typed fields from an inbound email with OpenAI, then apply them to the
// pipeline. Failure-tolerant: if the key is missing or the call fails, we leave
// the event raw (still visible) and never corrupt the pipeline. Uses fetch, so
// no "use node" needed.
export const run = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<null> => {
    const ev = await ctx.runQuery(internal.events.getRaw, {
      eventId: args.eventId,
    });
    if (!ev) return null;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // No key (e.g. in tests): skip extraction; the raw event still stands.
      return null;
    }

    let extracted: unknown = null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYS },
            {
              role: "user",
              content: `Subject: ${ev.subject}\nFrom: ${ev.fromAddress}\n\n${ev.rawText}`,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = j.choices?.[0]?.message?.content;
      if (!content) return null;
      extracted = JSON.parse(content);
    } catch {
      return null; // extraction failure never blocks the pipeline
    }

    await ctx.runMutation(internal.pipeline.applyExtraction, {
      eventId: args.eventId,
      extracted,
    });
    return null;
  },
});

// `process.env` is available at Convex runtime; declare it so the editor
// typechecks without adding "node" to the tsconfig types allowlist.
declare const process: { env: Record<string, string | undefined> };
