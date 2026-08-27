import { describe, expect, test } from "vitest";
import {
  classifyEvent,
  aggregateClassified,
  type ClassifiedEvent,
} from "./reputationClass";

// COMMISSION vs OMISSION.
//
// Haeberlen & Kuznetsov, "The Fault Detection Problem" (OPODIS 2009), prove:
// "In contrast to commission faults, there is no self-contained proof of an
// omission fault; when a node is suspected of having omitted a message m, the
// suspicion can always turn out to be groundless when m eventually arrives."
//
// The original design treated a WRONG token and a MISSING token identically.
// They are not the same kind of fact:
//
//   wrong token   -> COMMISSION. The observer holds the forged value; anyone
//                    with the seed recomputes and reaches the same verdict.
//                    Self-contained proof. Transferable network-wide.
//
//   missing token -> OMISSION. "I did not see a valid proof" is a statement
//                    about the observer's view, not about the counterpart.
//                    Delivery failure produces it (measured: reordering alone
//                    yields it in 60.7% of sessions). NOT transferable.
//
// Propagating an omission network-wide is exactly the DoS weapon Douceur's
// Sybil result warns about: an adversary who can drop traffic manufactures
// disqualifying events against honest agents.

describe("classifyEvent", () => {
  test("a token that fails verification is a COMMISSION fault", () => {
    const e = classifyEvent({ hasResponse: true, responseValid: false });
    expect(e.kind).toBe("takeover_proven");
    expect(e.class).toBe("commission");
    expect(e.transferable).toBe(true);
  });

  test("an ABSENT token is an OMISSION, not a proven takeover", () => {
    const e = classifyEvent({ hasResponse: false, responseValid: false });
    expect(e.kind).toBe("proof_absent");
    expect(e.class).toBe("omission");
    expect(e.transferable).toBe(false);
  });

  test("a valid token is a commission-class confirmation (checkable by anyone)", () => {
    const e = classifyEvent({ hasResponse: true, responseValid: true });
    expect(e.kind).toBe("continuity_confirmed");
    expect(e.class).toBe("commission");
    expect(e.transferable).toBe(true);
  });
});

describe("aggregation respects the class boundary", () => {
  const proven: ClassifiedEvent = {
    kind: "takeover_proven", class: "commission", transferable: true,
    observer: "agentX", at: 1,
  };
  const absent: ClassifiedEvent = {
    kind: "proof_absent", class: "omission", transferable: false,
    observer: "agentX", at: 2,
  };
  const confirmed: ClassifiedEvent = {
    kind: "continuity_confirmed", class: "commission", transferable: true,
    observer: "agentX", at: 3,
  };

  test("a PROVEN takeover disqualifies network-wide", () => {
    const r = aggregateClassified([confirmed, proven], { self: "agentZ" });
    expect(r.standing).toBe("compromised");
    expect(r.networkWide).toBe(true);
  });

  test("an ABSENT proof does NOT disqualify network-wide", () => {
    // agentZ did not observe this; it is agentX's local view, and delivery
    // failure is indistinguishable from takeover from the outside.
    const r = aggregateClassified([confirmed, absent], { self: "agentZ" });
    expect(r.standing).not.toBe("compromised");
    expect(r.networkWide).toBe(false);
  });

  test("an absent proof DOES raise local suspicion for the observer itself", () => {
    const r = aggregateClassified([confirmed, absent], { self: "agentX" });
    expect(r.localSuspicion).toBe(true);
    expect(r.standing).toBe("suspected");
  });

  test("DoS RESISTANCE: many omissions from many observers still do not disqualify", () => {
    // The Sybil attack the original design was open to: an adversary operating
    // participants floods omission reports to tank an honest counterpart.
    const flood: ClassifiedEvent[] = Array.from({ length: 50 }, (_, i) => ({
      kind: "proof_absent" as const, class: "omission" as const,
      transferable: false, observer: `sybil${i}`, at: i,
    }));
    const r = aggregateClassified([confirmed, ...flood], { self: "agentZ" });
    expect(r.standing).not.toBe("compromised");
    expect(r.networkWide).toBe(false);
  });

  test("ONE proven takeover outweighs any number of confirmations", () => {
    const many: ClassifiedEvent[] = Array.from({ length: 100 }, (_, i) => ({
      ...confirmed, at: i,
    }));
    const r = aggregateClassified([...many, proven], { self: "agentZ" });
    expect(r.standing).toBe("compromised");
  });

  test("no history at all is unknown", () => {
    const r = aggregateClassified([], { self: "agentZ" });
    expect(r.standing).toBe("unknown");
  });

  test("confirmations alone are good standing", () => {
    const r = aggregateClassified([confirmed], { self: "agentZ" });
    expect(r.standing).toBe("good");
  });
});
