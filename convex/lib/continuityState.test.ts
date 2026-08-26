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

  test("seeded counterpart, WRONG response → takeover → hold", () => {
    const rec: ContinuityRecord = { seeded: true, counter: 3, lastStatus: "confirmed" };
    const v = continuityVerdict(rec, { hasResponse: true, responseValid: false });
    expect(v.status).toBe("takeover_suspected");
    expect(v.shouldHold).toBe(true);
  });

  test("seeded counterpart, response MISSING → takeover → hold (a member must carry it)", () => {
    const rec: ContinuityRecord = { seeded: true, counter: 3, lastStatus: "confirmed" };
    const v = continuityVerdict(rec, { hasResponse: false, responseValid: false });
    expect(v.status).toBe("takeover_suspected");
    expect(v.shouldHold).toBe(true);
  });

  test("record exists but not yet seeded (trusted once, seed just sent, awaiting first proof) → pending, no hold", () => {
    const rec: ContinuityRecord = { seeded: false, counter: 0, lastStatus: "pending" };
    const v = continuityVerdict(rec, { hasResponse: false, responseValid: false });
    expect(v.status).toBe("pending");
    expect(v.shouldHold).toBe(false);
  });
});
