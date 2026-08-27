import { describe, expect, test } from "vitest";
import { continuityVerdict, type ContinuityRecord } from "./continuityState";

// The continuity STATE MACHINE — how a counterpart's continuity record + an
// incoming message combine into a verdict the gate can act on. Pure + testable,
// no DB. The crypto (seed/challenge/response) lives in continuity.ts; this
// decides what the presence/absence/correctness of a response MEANS.
//
// Flow (user's design): first trusted contact → we seed the counterpart (embed a
// key in our reply, which every Attest agent knows to decode). From then on we
// watch every message for the rotating response. Present+correct → continuity
// holds; absent/wrong on a SEEDED counterpart → takeover signal.

describe("continuityVerdict", () => {
  test("no record yet (first ever contact) → not_applicable (rank as today, then seed if trusted)", () => {
    const v = continuityVerdict(null, { hasResponse: false, responseValid: false });
    expect(v.status).toBe("not_applicable");
    expect(v.shouldHold).toBe(false);
  });

  test("seeded counterpart, correct response → confirmed (continuity holds)", () => {
    const rec: ContinuityRecord = { seeded: true, counter: 3, lastStatus: "confirmed" };
    const v = continuityVerdict(rec, { hasResponse: true, responseValid: true });
    expect(v.status).toBe("confirmed");
    expect(v.shouldHold).toBe(false);
  });

  // COMMISSION (a wrong token): a self-contained cryptographic proof of a fault.
  // An impostor without the seed produced a token that doesn't verify. This is
  // PROVABLE and therefore transferable network-wide.
  test("seeded counterpart, WRONG response → takeover_suspected, holds, PROVABLE", () => {
    const rec: ContinuityRecord = { seeded: true, counter: 3, lastStatus: "confirmed" };
    const v = continuityVerdict(rec, { hasResponse: true, responseValid: false });
    expect(v.status).toBe("takeover_suspected");
    expect(v.shouldHold).toBe(true);
    expect(v.provable).toBe(true); // commission fault → transferable
  });

  // OMISSION (a missing token): Haeberlen/Kuznetsov — there is NO self-contained
  // proof of an omission. It could be reordering, delay, or a drop (which the
  // continuity experiment measured as ~61% of sessions at 5% reordering). So we
  // HOLD LOCALLY (safe) but the fault is NOT provable and must NOT propagate as a
  // network reputation event, or a dropped email permanently smears an honest agent.
  test("seeded counterpart, MISSING response → unproven_gap, holds LOCALLY, NOT provable", () => {
    const rec: ContinuityRecord = { seeded: true, counter: 3, lastStatus: "confirmed" };
    const v = continuityVerdict(rec, { hasResponse: false, responseValid: false });
    expect(v.status).toBe("unproven_gap");
    expect(v.shouldHold).toBe(true); // still safe locally
    expect(v.provable).toBe(false); // omission → NOT transferable
  });

  test("record exists but not yet seeded (trusted once, seed just sent, awaiting first proof) → pending, no hold", () => {
    const rec: ContinuityRecord = { seeded: false, counter: 0, lastStatus: "pending" };
    const v = continuityVerdict(rec, { hasResponse: false, responseValid: false });
    expect(v.status).toBe("pending");
    expect(v.shouldHold).toBe(false);
  });
});
