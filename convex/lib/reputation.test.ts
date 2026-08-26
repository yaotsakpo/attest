import { describe, expect, test } from "vitest";
import { aggregateReputation, type RepEvent } from "./reputation";

// Reputation = portable standing derived ONLY from attestable events (continuity
// confirmations / suspected takeovers), never from claims or votes. This pure
// function folds a counterpart's event history into a standing the gate + UI use.

describe("aggregateReputation", () => {
  test("no events → neutral / unknown standing", () => {
    const r = aggregateReputation([]);
    expect(r.standing).toBe("unknown");
    expect(r.confirmed).toBe(0);
    expect(r.takeovers).toBe(0);
    expect(r.flagged).toBe(false);
  });

  test("only confirmations → good standing, not flagged", () => {
    const evs: RepEvent[] = [
      { kind: "continuity_confirmed", at: 1 },
      { kind: "continuity_confirmed", at: 2 },
      { kind: "continuity_confirmed", at: 3 },
    ];
    const r = aggregateReputation(evs);
    expect(r.confirmed).toBe(3);
    expect(r.takeovers).toBe(0);
    expect(r.standing).toBe("good");
    expect(r.flagged).toBe(false);
  });

  test("ANY takeover event → flagged, standing compromised (a single takeover is disqualifying)", () => {
    const evs: RepEvent[] = [
      { kind: "continuity_confirmed", at: 1 },
      { kind: "continuity_confirmed", at: 2 },
      { kind: "takeover_suspected", at: 3 },
    ];
    const r = aggregateReputation(evs);
    expect(r.takeovers).toBe(1);
    expect(r.flagged).toBe(true);
    expect(r.standing).toBe("compromised");
  });

  test("a few confirmations but no takeover → good; sparse but clean", () => {
    const r = aggregateReputation([{ kind: "continuity_confirmed", at: 1 }]);
    expect(r.standing).toBe("good");
  });
});
