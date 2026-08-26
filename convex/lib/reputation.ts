// Reputation aggregation — fold a counterpart's attestable event history into a
// portable standing. Reputation is built ONLY on observed, checkable facts
// (continuity confirmations, suspected takeovers), never on claims or votes, so
// it can't be gamed by what agents SAY about each other. Pure + testable.

export type RepKind = "continuity_confirmed" | "takeover_suspected";

export interface RepEvent {
  kind: RepKind;
  at: number;
}

export type Standing = "unknown" | "good" | "compromised";

export interface Reputation {
  confirmed: number;
  takeovers: number;
  flagged: boolean; // has a takeover ever been observed? (disqualifying)
  standing: Standing;
}

export function aggregateReputation(events: RepEvent[]): Reputation {
  let confirmed = 0;
  let takeovers = 0;
  for (const e of events) {
    if (e.kind === "continuity_confirmed") confirmed++;
    else if (e.kind === "takeover_suspected") takeovers++;
  }
  // A single observed takeover is disqualifying — an identity that was ever taken
  // over can't be treated as clean until a human re-establishes trust. Standing
  // is "good" only with confirmations and zero takeovers; "unknown" with no
  // history at all.
  const flagged = takeovers > 0;
  const standing: Standing = flagged
    ? "compromised"
    : confirmed > 0
      ? "good"
      : "unknown";
  return { confirmed, takeovers, flagged, standing };
}
