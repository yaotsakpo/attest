import { describe, expect, test } from "vitest";
import { deriveSeed } from "./continuity";
import { emitToken, readToken, verifyToken } from "./continuityToken";

// The continuity TOKEN wire-format: what a genuine Attest agent embeds in an
// outgoing message, and how the receiver verifies it against the stored seed
// with REAL crypto (not marker-presence). The counter is the ratchet step both
// sides agree on; the nonce is derived from it so both compute the same value.

describe("emit / read / verify", () => {
  test("a genuine agent's token verifies against the shared seed at the right step", async () => {
    const seed = await deriveSeed("a", "b", "trust-secret");
    const msg = "Hello, following up. " + (await emitToken(seed, 4));
    const token = readToken(msg);
    expect(token).not.toBeNull();
    expect(await verifyToken(seed, 4, token!)).toBe(true);
  });

  test("IMPOSTOR: a well-formed but wrong token (no seed) FAILS verification", async () => {
    const seed = await deriveSeed("a", "b", "real-secret");
    const attackerSeed = await deriveSeed("a", "b", "attacker-guess");
    // The attacker embeds a perfectly well-formed token — but derived from the
    // wrong seed. Marker-presence would pass this; real crypto rejects it.
    const forgedMsg = "Hi there " + (await emitToken(attackerSeed, 4));
    const token = readToken(forgedMsg);
    expect(token).not.toBeNull(); // it IS well-formed…
    expect(await verifyToken(seed, 4, token!)).toBe(false); // …but doesn't verify
  });

  test("replay at the wrong step fails (token is bound to its counter)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const token = readToken(await emitToken(seed, 3))!;
    expect(await verifyToken(seed, 3, token)).toBe(true);
    expect(await verifyToken(seed, 4, token)).toBe(false); // replayed at step 4
  });

  test("no token in the message → readToken returns null (absence = takeover for a seeded peer)", () => {
    expect(readToken("just a normal email with no token")).toBeNull();
  });
});
