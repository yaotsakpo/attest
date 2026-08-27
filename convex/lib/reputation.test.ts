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

// The paper's §5.1 rule is FOUR states. `p` (proven takeovers, any observer) and
// `c` (confirmations) come from the network event log; `a_Z` (absent proofs the
// QUERYING agent itself observed) is a LOCAL count — an omission never becomes a
// network event, so it can only enter as the querier's own view. Standing:
//   p≥1 → compromised ; p=0 ∧ a_Z≥1 → suspected ; p=0 ∧ a_Z=0 ∧ c≥1 → good ; else unknown
describe("aggregateReputation — the 4-state §5.1 rule with local a_Z", () => {
  test("no events, no local absences → unknown", () => {
    expect(aggregateReputation([], 0).standing).toBe("unknown");
  });

  test("confirmations, and THIS querier saw an absent proof → suspected (local friction)", () => {
    const r = aggregateReputation(
      [{ kind: "continuity_confirmed", at: 1 }],
      2, // a_Z: this querier observed 2 absent proofs of its own
    );
    expect(r.standing).toBe("suspected");
    expect(r.localAbsent).toBe(2);
  });

  test("a_Z is LOCAL: another querier's absences don't apply — a_Z=0 with confirmations → good", () => {
    const r = aggregateReputation([{ kind: "continuity_confirmed", at: 1 }], 0);
    expect(r.standing).toBe("good");
  });

  test("a proven takeover OVERRIDES local suspicion → compromised (p≥1 wins)", () => {
    const r = aggregateReputation(
      [{ kind: "takeover_suspected", at: 1 }],
      5, // even with local absences, a proven takeover dominates
    );
    expect(r.standing).toBe("compromised");
  });

  test("local absences but no confirmations and no takeover → still suspected (a_Z≥1)", () => {
    expect(aggregateReputation([], 1).standing).toBe("suspected");
  });

  test("localAbsent defaults to 0 (back-compat) → prior 3-state behavior preserved", () => {
    expect(aggregateReputation([{ kind: "continuity_confirmed", at: 1 }]).standing).toBe(
      "good",
    );
  });
});
