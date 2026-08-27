// The continuity STATE MACHINE. Pure: given a counterpart's continuity record
// and whether the incoming message carried a valid rotating response, decide the
// verdict the gate acts on. The crypto (deriveSeed/computeResponse/verifyResponse)
// is in continuity.ts; this file decides what the result MEANS for trust.
//
// Design (user's): first trusted contact is ranked as normal (no continuity yet),
// then we SEED the counterpart — embed a key in our reply that every Attest agent
// knows to decode. From then on we watch every message for the forward-secret
// response. A SEEDED counterpart that stops producing it (missing or wrong) is a
// takeover signal, because the impostor holds the address but not the seed.

export type ContinuityStatus =
  | "not_applicable" // never contacted before → rank as today, seed if trusted
  | "pending" // seed just sent, awaiting the counterpart's first proof
  | "confirmed" // valid rotating response → still the same principal
  | "takeover_suspected" // a WRONG token: a commission fault, cryptographically provable
  | "unproven_gap"; // a MISSING token: an omission — hold locally, but NOT provable

export interface ContinuityRecord {
  seeded: boolean; // have we established + sent a seed to this counterpart?
  counter: number; // ratchet step of the last interaction
  lastStatus: ContinuityStatus;
}

export interface IncomingProof {
  hasResponse: boolean; // did the message carry a continuity response at all?
  responseValid: boolean; // did it verify against the expected rotating value?
}

export interface ContinuityVerdict {
  status: ContinuityStatus;
  shouldHold: boolean; // does this verdict force a hold locally?
  // Is this fault a self-contained PROOF (a wrong token an impostor could only
  // produce without the seed)? Only a provable fault may propagate as a
  // network-wide reputation event. An omission (missing token) is NOT provable —
  // Haeberlen/Kuznetsov: no self-contained proof of an omission exists, and it is
  // indistinguishable from reordering/delay/drop — so it must stay local, or a
  // dropped message would permanently smear an honest agent across the network.
  provable: boolean;
}

export function continuityVerdict(
  record: ContinuityRecord | null,
  proof: IncomingProof,
): ContinuityVerdict {
  // Never seen before → continuity doesn't apply yet. Caller ranks as today and
  // (if it decides to trust) seeds the counterpart for next time.
  if (!record) {
    return { status: "not_applicable", shouldHold: false, provable: false };
  }

  // Seed sent but no proof received yet — the counterpart hasn't replied since we
  // seeded. Not a takeover; just awaiting first confirmation. Don't hold on this
  // alone (the normal gate still applies).
  if (!record.seeded) {
    return { status: "pending", shouldHold: false, provable: false };
  }

  // Valid token → still the same principal.
  if (proof.hasResponse && proof.responseValid) {
    return { status: "confirmed", shouldHold: false, provable: false };
  }

  // COMMISSION: a token is present but does NOT verify. Only an entity that
  // produced a value without the seed does this — a self-contained proof of a
  // fault. Hold, and this is transferable (a network-wide reputation event).
  if (proof.hasResponse && !proof.responseValid) {
    return { status: "takeover_suspected", shouldHold: true, provable: true };
  }

  // OMISSION: no token at all. Hold locally (safe), but this is NOT a proof — it
  // could be reordering, delay, or a drop. It must not propagate as reputation.
  return { status: "unproven_gap", shouldHold: true, provable: false };
}
