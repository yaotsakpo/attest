// Reputation events, split by FAULT CLASS.
//
// The original design recorded one event kind for "this counterpart failed the
// continuity check" and propagated it network-wide. That conflates two facts
// with different evidentiary status, and the conflation is the design's most
// serious defect.
//
// Haeberlen & Kuznetsov (OPODIS 2009) prove there is no self-contained proof of
// an OMISSION fault: a node suspected of having omitted a message may simply
// have had the message delayed. A COMMISSION fault is different: the observer
// holds the incorrect value the counterpart produced, and any other party can
// recompute and reach the same verdict.
//
// Applied here:
//
//   WRONG token  -> commission. The observer holds a value that fails HMAC
//                   verification against the pairwise seed. Anyone given the
//                   same inputs reaches the same answer. Transferable.
//
//   ABSENT token -> omission. "No valid proof arrived" is a claim about the
//                   observer's view. Delivery failure produces it: the
//                   continuity experiments measured 60.7% of legitimate
//                   sessions producing it under 5% message reordering alone.
//                   NOT transferable.
//
// Why this matters beyond taxonomy: propagating omissions network-wide turns
// the disqualification rule into a denial-of-service weapon. An adversary who
// can drop or delay traffic, or who operates enough participants, manufactures
// disqualifying events against honest counterparts. Douceur (IPTPS 2002) proved
// Sybil identities cannot be excluded without a central authority, so the
// defense cannot be "keep the adversary out"; it has to be that an omission is
// never sufficient to disqualify anyone.

export type EventKind =
  | "continuity_confirmed" // valid proof: commission-class, checkable
  | "takeover_proven" // invalid proof held by the observer: commission-class
  | "proof_absent"; // no proof arrived: omission-class, local only

export type FaultClass = "commission" | "omission";

export interface ClassifiedEvent {
  kind: EventKind;
  class: FaultClass;
  transferable: boolean; // may this event legitimately affect other agents?
  observer: string; // who observed it (provenance of the observation)
  at: number;
}

export interface IncomingProof {
  hasResponse: boolean;
  responseValid: boolean;
}

// Decide what KIND of fact an observation is. This is the whole contribution:
// the classification happens at observation time, and the aggregation rule is
// then forbidden from treating the two classes alike.
export function classifyEvent(
  proof: IncomingProof,
): Pick<ClassifiedEvent, "kind" | "class" | "transferable"> {
  if (proof.hasResponse && proof.responseValid) {
    return { kind: "continuity_confirmed", class: "commission", transferable: true };
  }
  if (proof.hasResponse && !proof.responseValid) {
    // The observer holds the forged value. Self-contained proof.
    return { kind: "takeover_proven", class: "commission", transferable: true };
  }
  // Nothing arrived. Indistinguishable from delivery failure.
  return { kind: "proof_absent", class: "omission", transferable: false };
}

export type Standing = "unknown" | "good" | "suspected" | "compromised";

export interface ClassifiedReputation {
  confirmed: number;
  proven: number;
  absent: number;
  standing: Standing;
  networkWide: boolean; // is the compromised verdict propagatable?
  localSuspicion: boolean; // does the querying agent have its own doubt?
}

// Fold a counterpart's classified history into a standing, from the point of
// view of `self`. Omissions count only for the agent that observed them.
export function aggregateClassified(
  events: ClassifiedEvent[],
  ctx: { self: string },
): ClassifiedReputation {
  let confirmed = 0, proven = 0, absent = 0, localSuspicion = false;

  for (const e of events) {
    if (e.kind === "continuity_confirmed") confirmed++;
    else if (e.kind === "takeover_proven") proven++;
    else {
      absent++;
      // An omission is evidence only for the agent that failed to see the proof.
      // Another agent's omission tells us nothing about our own channel.
      if (e.observer === ctx.self) localSuspicion = true;
    }
  }

  // A proven takeover is disqualifying and propagates: the evidence travels.
  if (proven > 0) {
    return { confirmed, proven, absent, standing: "compromised", networkWide: true, localSuspicion };
  }
  // Our own unmet expectation raises local friction, and nothing more. It does
  // not travel, and no volume of it from others reaches this branch.
  if (localSuspicion) {
    return { confirmed, proven, absent, standing: "suspected", networkWide: false, localSuspicion };
  }
  if (confirmed > 0) {
    return { confirmed, proven, absent, standing: "good", networkWide: false, localSuspicion };
  }
  return { confirmed, proven, absent, standing: "unknown", networkWide: false, localSuspicion };
}
