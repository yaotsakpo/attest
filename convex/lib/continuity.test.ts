import { describe, expect, test } from "vitest";
import {
  deriveSeed,
  ratchetKey,
  computeResponse,
  verifyResponse,
} from "./continuity";

// The continuity handshake: at trust-establishment two agents share a seed; on
// every later interaction the challenged agent must produce a FORWARD-SECRET
// rotating response derived from that seed. An impostor who took over the
// address but never held the seed cannot produce it — takeover is exposed at
// challenge time. (TOFU continuity + a forward-secret ratchet + challenge-
// response, composed for agent-identity continuity.)

describe("deriveSeed", () => {
  test("same trust-time inputs → same seed (both agents derive it independently)", async () => {
    const a = await deriveSeed("agentA", "agentB", "trust-secret-xyz");
    const b = await deriveSeed("agentA", "agentB", "trust-secret-xyz");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  test("different trust secret → different seed", async () => {
    const a = await deriveSeed("agentA", "agentB", "secret-1");
    const b = await deriveSeed("agentA", "agentB", "secret-2");
    expect(a).not.toBe(b);
  });

  test("seed is symmetric in the pair (order-independent)", async () => {
    const ab = await deriveSeed("agentA", "agentB", "s");
    const ba = await deriveSeed("agentB", "agentA", "s");
    expect(ab).toBe(ba);
  });
});

describe("ratchetKey — forward secrecy", () => {
  test("each step derives a distinct key", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const k0 = await ratchetKey(seed, 0);
    const k1 = await ratchetKey(seed, 1);
    const k2 = await ratchetKey(seed, 2);
    expect(k0).not.toBe(k1);
    expect(k1).not.toBe(k2);
  });

  test("the ratchet is deterministic (both sides reach the same step key)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    expect(await ratchetKey(seed, 5)).toBe(await ratchetKey(seed, 5));
  });
});

describe("challenge / response", () => {
  test("legit agent (holds the seed) produces a response that verifies", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const nonce = "challenge-nonce-1";
    const resp = await computeResponse(seed, 3, nonce);
    expect(await verifyResponse(seed, 3, nonce, resp)).toBe(true);
  });

  test("TAKEOVER: impostor without the seed fails the challenge", async () => {
    const seed = await deriveSeed("a", "b", "real-trust-secret");
    const nonce = "challenge-nonce-1";
    // The attacker has the ADDRESS and can see past traffic, but never held the
    // trust-time seed. Their best guess (a wrong seed) does not verify.
    const attackerSeed = await deriveSeed("a", "b", "attacker-guess");
    const forged = await computeResponse(attackerSeed, 3, nonce);
    expect(await verifyResponse(seed, 3, nonce, forged)).toBe(false);
  });

  test("wrong counter fails (no replay of an old response at a new step)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const nonce = "n";
    const respAt3 = await computeResponse(seed, 3, nonce);
    expect(await verifyResponse(seed, 4, nonce, respAt3)).toBe(false);
  });

  test("wrong nonce fails (response is bound to THIS challenge)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const resp = await computeResponse(seed, 2, "nonce-A");
    expect(await verifyResponse(seed, 2, "nonce-B", resp)).toBe(false);
  });

  test("observing past responses does not reveal a future one (forward secrecy)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const past = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => computeResponse(seed, i, `n${i}`)),
    );
    const future = await computeResponse(seed, 5, "n5");
    expect(past).not.toContain(future);
    for (const p of past) {
      expect(await verifyResponse(seed, 5, "n5", p)).toBe(false);
    }
  });
});
