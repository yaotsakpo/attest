// Reputation aggregation — fold a counterpart's attestable event history into a
// portable standing. Reputation is built ONLY on observed, checkable facts
// (continuity confirmations, suspected takeovers), never on claims or votes, so
// it can't be gamed by what agents SAY about each other. Pure + testable.

export type RepKind = "continuity_confirmed" | "takeover_suspected";

export interface RepEvent {
  kind: RepKind;
  at: number;
}

export type Standing = "unknown" | "suspected" | "good" | "compromised";

export interface Reputation {
  confirmed: number; // c: confirmations (any observer)
  takeovers: number; // p: PROVEN (commission-class) takeovers, any observer
  localAbsent: number; // a_Z: absent proofs the QUERYING agent itself observed
  flagged: boolean; // p ≥ 1 — disqualifying, network-wide
  standing: Standing;
}

// The §5.1 four-state rule. `events` is the network-propagating log (confirmations
// and PROVEN takeovers, any observer). `localAbsent` (a_Z) is the querying agent's
// OWN count of absent proofs — an omission never becomes a network event, so the
// suspicion it raises is local to the querier and enters only through this
// parameter. Standing:
//   p ≥ 1                          → compromised   (proven, travels)
//   p = 0 ∧ a_Z ≥ 1               → suspected     (local friction only)
//   p = 0 ∧ a_Z = 0 ∧ c ≥ 1       → good
//   otherwise                      → unknown
export function aggregateReputation(
  events: RepEvent[],
  localAbsent = 0,
): Reputation {
  let confirmed = 0;
  let takeovers = 0;
  for (const e of events) {
    if (e.kind === "continuity_confirmed") confirmed++;
    else if (e.kind === "takeover_suspected") takeovers++;
  }
  const flagged = takeovers > 0;
  const standing: Standing = flagged
    ? "compromised" // p ≥ 1 dominates, network-wide
    : localAbsent > 0
      ? "suspected" // the querier's own unmet expectation — local, does not travel
      : confirmed > 0
        ? "good"
        : "unknown";
  return { confirmed, takeovers, localAbsent, flagged, standing };
}
