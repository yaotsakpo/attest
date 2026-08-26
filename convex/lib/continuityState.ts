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
  | "takeover_suspected"; // seeded, but the proof is missing/wrong → hold

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
  shouldHold: boolean; // does this verdict force a hold, overriding other trust?
}

export function continuityVerdict(
  record: ContinuityRecord | null,
  proof: IncomingProof,
): ContinuityVerdict {
  // Never seen before → continuity doesn't apply yet. Caller ranks as today and
  // (if it decides to trust) seeds the counterpart for next time.
  if (!record) {
    return { status: "not_applicable", shouldHold: false };
  }

  // Seed sent but no proof received yet — the counterpart hasn't replied since we
  // seeded. Not a takeover; just awaiting first confirmation. Don't hold on this
  // alone (the normal gate still applies).
  if (!record.seeded) {
    return { status: "pending", shouldHold: false };
  }

  // Seeded: the counterpart MUST carry a valid rotating response. A member that
  // stops proving continuity (missing or wrong) is a possible takeover — hold,
  // and this overrides other trust (a taken-over member is worse than a stranger).
  if (proof.hasResponse && proof.responseValid) {
    return { status: "confirmed", shouldHold: false };
  }
  return { status: "takeover_suspected", shouldHold: true };
}
