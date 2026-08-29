// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { decideAction } from "./lib/policyEngine";
import { detectSensitiveRequest } from "./lib/disclosureGate";
import type { Rule } from "./lib/policyEngine";

// Proves the demo tells a coherent YES/NO story through the REAL gate: the
// verified recruiter info-request and the small verified invoice auto-answer
// (YES); the SSN scam and the unverified $5k wire hold (NO). If this test breaks,
// the demo narrative is lying and must be fixed.

// the exact rules demo.ts seeds
const DEMO_RULES: Rule[] = [
  { id: "demo_pay", action: "payment", maxAmount: 200, requireVerified: true, decision: "allow" },
  { id: "demo_share", action: "share_info", requireVerified: true, minGrade: "A", decision: "allow" },
  { id: "demo_reply", action: "reply", minGrade: "B", decision: "allow" },
];

function decide(opts: {
  text: string;
  senderVerified: boolean;
  grade: "A" | "B" | "C" | "D" | "F";
  domain: string;
}) {
  return decideAction({
    grade: opts.grade,
    senderVerified: opts.senderVerified,
    sensitiveRequest: detectSensitiveRequest(opts.text),
    domain: opts.domain,
    text: opts.text,
    rules: DEMO_RULES,
  });
}

describe("demo scenarios — the gate says YES to the safe ones", () => {
  it("verified recruiter asks for NON-sensitive info (availability/salary) → auto-answers", () => {
    const d = decide({
      text: "can you confirm your general availability next week and your expected salary range? Nothing sensitive.",
      senderVerified: true,
      grade: "A",
      domain: "stripe.com",
    });
    expect(d.action).toBe("auto_answer");
  });

  it("verified vendor, $20 invoice (≤ $200 limit) → auto-pays", () => {
    const d = decide({
      text: "Your monthly Vercel Pro subscription invoice is ready: $20.00, due now.",
      senderVerified: true,
      grade: "A",
      domain: "vercel.com",
    });
    expect(d.action).toBe("auto_answer");
  });
});

describe("demo scenarios — the gate says NO to the scams", () => {
  it("SSN request ALWAYS holds — even from a verified A-grade sender (containment)", () => {
    const d = decide({
      text: "To finalize onboarding, please reply with your Social Security Number.",
      senderVerified: true, // even verified: sensitive PII can never auto-share
      grade: "A",
      domain: "offer-onboarding.co",
    });
    expect(d.action).toBe("hold_for_approval");
  });

  it("unverified $5,000 wire holds (unverified + over limit)", () => {
    const d = decide({
      text: "Please remit payment of $5,000 for services rendered. Wire instructions attached.",
      senderVerified: false,
      grade: "F",
      domain: "vendor-invoices.net",
    });
    expect(d.action).toBe("hold_for_approval");
  });

  it("the SAME info request from an UNVERIFIED sender holds (verification gates the YES)", () => {
    const d = decide({
      text: "confirm your availability and salary range",
      senderVerified: false,
      grade: "F",
      domain: "totally-legit-recruiter.co",
    });
    expect(d.action).toBe("hold_for_approval");
  });
});
