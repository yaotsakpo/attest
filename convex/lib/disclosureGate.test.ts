import { describe, it, expect } from "vitest";
import { detectSensitiveRequest, decideDisclosure } from "./disclosureGate";

describe("detectSensitiveRequest", () => {
  it("flags a request for SSN", () => {
    expect(
      detectSensitiveRequest("Please confirm your SSN to finish onboarding."),
    ).toBe(true);
  });
  it("flags date of birth and bank details", () => {
    expect(detectSensitiveRequest("send your date of birth")).toBe(true);
    expect(detectSensitiveRequest("we need your bank account number")).toBe(true);
  });
  it("does NOT flag a normal scheduling email", () => {
    expect(
      detectSensitiveRequest("Are you free Thursday at 2pm for a call?"),
    ).toBe(false);
  });
});

describe("decideDisclosure", () => {
  // Non-sensitive request from a verified top-grade domain -> auto-answer.
  it("auto-answers a normal request from a grade-A verified sender", () => {
    const d = decideDisclosure({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: false,
    });
    expect(d.action).toBe("auto_answer");
  });

  // Sensitive request -> HOLD even from a decent sender, unless top-grade verified.
  it("holds a sensitive request from an unverified sender", () => {
    const d = decideDisclosure({
      grade: "F",
      senderVerified: false,
      sensitiveRequest: true,
    });
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/couldn.t verify/i);
    expect(d.reason).not.toMatch(/fake|scam/i); // honesty rule
  });

  // Any unverified sender holds, even for a normal request.
  it("holds a normal request from an unverified sender", () => {
    const d = decideDisclosure({
      grade: "C",
      senderVerified: false,
      sensitiveRequest: false,
    });
    expect(d.action).toBe("hold_for_approval");
  });

  // Sensitive request from a verified but not-top domain still holds.
  it("holds a sensitive request from a verified grade-C sender", () => {
    const d = decideDisclosure({
      grade: "C",
      senderVerified: true,
      sensitiveRequest: true,
    });
    expect(d.action).toBe("hold_for_approval");
  });

  // Sensitive request from a verified grade-A domain: still hold — sensitive
  // PII never auto-releases without a human, but the reason is calmer.
  it("holds a sensitive request even from grade-A (PII never auto-releases)", () => {
    const d = decideDisclosure({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: true,
    });
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/sensitive/i);
  });
});
