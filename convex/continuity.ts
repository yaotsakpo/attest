import { action } from "./_generated/server";
import { v } from "convex/values";
import {
  deriveSeed,
  computeResponse,
  verifyResponse,
} from "./lib/continuity";

// A self-contained, RUNNABLE demonstration of the continuity handshake, exposed
// so the UI can show it live. This is real crypto (HMAC-SHA256 via Web Crypto),
// not a mock. It illustrates the receiving-side value: a counterpart that fails
// the forward-secret challenge is a possible takeover, even if it authenticates
// as the right address.
//
// Honest scoping: live email does not yet carry this challenge (other mail
// agents don't speak the protocol). This endpoint demonstrates the mechanism
// end-to-end between a "genuine" agent (holds the trust-time seed) and an
// "impostor" (has the address, lacks the seed).

export const demo = action({
  args: {
    // the shared trust-time secret the two agents established at first contact
    trustSecret: v.string(),
    // the counter/step of the interaction being challenged
    counter: v.number(),
    // whether the responder is the genuine agent or an impostor without the seed
    responder: v.union(v.literal("genuine"), v.literal("impostor")),
  },
  returns: v.object({
    nonce: v.string(),
    seedFingerprint: v.string(), // first bytes of the genuine seed (display only)
    response: v.string(), // the responder's answer to the challenge
    verified: v.boolean(), // did it pass?
    verdict: v.string(),
  }),
  handler: async (_ctx, args) => {
    const agentX = "your-agent@warden";
    const agentY = "counterpart@acme.com";

    // The verifier (your agent) holds the genuine trust-time seed.
    const genuineSeed = await deriveSeed(agentX, agentY, args.trustSecret);

    // A fresh challenge nonce for this interaction. (Deterministic here so the
    // demo is reproducible without Math.random, which the runtime disallows.)
    const nonce = `nonce-${args.counter}-${args.trustSecret.length}`;

    // The responder computes its answer. The genuine agent uses the real seed;
    // the impostor has the ADDRESS but not the seed, so it can only guess.
    const responderSeed =
      args.responder === "genuine"
        ? genuineSeed
        : await deriveSeed(agentX, agentY, "impostor-does-not-hold-the-seed");

    const response = await computeResponse(responderSeed, args.counter, nonce);
    const verified = await verifyResponse(
      genuineSeed,
      args.counter,
      nonce,
      response,
    );

    return {
      nonce,
      seedFingerprint: genuineSeed.slice(0, 12),
      response: response.slice(0, 24) + "…",
      verified,
      verdict: verified
        ? "Identity confirmed — same principal that earned trust."
        : "⚠ Possible takeover — authenticates as the address, but failed the continuity challenge. Actions held.",
    };
  },
});
