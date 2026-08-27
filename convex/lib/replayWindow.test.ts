import { describe, expect, test } from "vitest";
import { deriveSeed } from "./continuity";
import { emitToken, readToken } from "./continuityToken";
import { createWindow, acceptStep, type ReplayWindow } from "./replayWindow";

// The anti-replay WINDOW. A single monotone counter cannot survive ordinary email
// delivery: a reordered or duplicated message arrives BEHIND the counter, so a
// forward-only look-ahead can never recover it (measured: ~61% of legitimate
// sessions falsely flagged at 5% reordering, regardless of window size).
//
// The fix is the IPsec anti-replay discipline (RFC 4303 §3.4.3): track a highest
// step seen plus a bitmap of which recent steps have been consumed. Accept any
// step inside the window exactly ONCE, in any order. Replay resistance is
// preserved because a consumed step is never accepted twice.

async function tok(seed: string, step: number): Promise<string> {
  return readToken(await emitToken(seed, step))!;
}

describe("replay window: ordered delivery still works", () => {
  test("in-order steps are all accepted once", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow();
    for (let n = 1; n <= 10; n++) {
      const r = await acceptStep(w, seed, await tok(seed, n));
      expect(r.accepted).toBe(true);
      w = r.window;
    }
  });
});

describe("replay window: REORDERING (the measured defect)", () => {
  test("a swapped adjacent pair is accepted, not flagged as takeover", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow();
    // delivered 1, 3, 2 — the exact sequence that broke the counter design
    for (const n of [1, 3, 2]) {
      const r = await acceptStep(w, seed, await tok(seed, n));
      expect(r.accepted).toBe(true);
      w = r.window;
    }
  });

  test("a badly shuffled session is fully accepted", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow();
    for (const n of [3, 1, 5, 2, 4, 8, 6, 7]) {
      const r = await acceptStep(w, seed, await tok(seed, n));
      expect(r.accepted).toBe(true);
      w = r.window;
    }
  });
});

describe("replay window: replay resistance is PRESERVED", () => {
  test("a duplicate of a consumed step is REJECTED", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow();
    const t = await tok(seed, 1);
    const first = await acceptStep(w, seed, t);
    expect(first.accepted).toBe(true);
    // the SAME token again — this is replay, and must fail
    const second = await acceptStep(first.window, seed, t);
    expect(second.accepted).toBe(false);
  });

  test("a step that has fallen out of the window is REJECTED (too old)", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow(8); // small window
    for (let n = 1; n <= 40; n++) {
      w = (await acceptStep(w, seed, await tok(seed, n))).window;
    }
    // step 1 is far below the window floor now
    const old = await acceptStep(w, seed, await tok(seed, 1));
    expect(old.accepted).toBe(false);
  });

  test("a forged token still fails (crypto is unchanged)", async () => {
    const seed = await deriveSeed("a", "b", "real");
    const wrong = await deriveSeed("a", "b", "impostor");
    const w = createWindow();
    const r = await acceptStep(w, seed, await tok(wrong, 1));
    expect(r.accepted).toBe(false);
  });

  test("an absent token is not accepted", async () => {
    const seed = await deriveSeed("a", "b", "s");
    const w = createWindow();
    const r = await acceptStep(w, seed, null);
    expect(r.accepted).toBe(false);
  });
});

describe("replay window: LOSS", () => {
  test("gaps are tolerated; later steps still accepted", async () => {
    const seed = await deriveSeed("a", "b", "s");
    let w = createWindow();
    for (const n of [1, 2, 7, 8]) { // 3..6 lost
      const r = await acceptStep(w, seed, await tok(seed, n));
      expect(r.accepted).toBe(true);
      w = r.window;
    }
  });
});
