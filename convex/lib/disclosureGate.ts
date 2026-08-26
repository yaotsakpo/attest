// Grade tiers, kept in sync with src/grade.ts (A best … F worst).
export type GateGrade = "A" | "B" | "C" | "D" | "F";

// Does this email ask for sensitive personal information the agent holds on the
// user's behalf? Conservative keyword match — the cost of a false positive
// (holding a benign email for approval) is low; the cost of a false negative
// (auto-releasing an SSN) is catastrophic, so we err toward flagging.
const SENSITIVE = [
  /\bssn\b/i,
  /social security/i,
  /date of birth/i,
  /\bdob\b/i,
  /\bbank\b/i,
  /account number/i,
  /routing number/i,
  /passport/i,
  /driver.?s? licen[sc]e/i,
  /home address/i,
  /credit card/i,
  /tax id/i,
];

export function detectSensitiveRequest(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}

export interface GateInput {
  grade: GateGrade;
  senderVerified: boolean;
  sensitiveRequest: boolean;
}

export interface GateDecision {
  action: "auto_answer" | "hold_for_approval";
  reason: string;
}

// The gate. The agent holds the user's PII and may auto-answer recruiters — but
// only when it can stand behind the decision. Two honest states, never "fake".
//
//  - Sensitive PII requests NEVER auto-release, regardless of grade. A human
//    always approves releasing an SSN/DOB/bank detail. (Responsible-AI stance.)
//  - Non-sensitive requests auto-answer only from a VERIFIED sender.
//  - Anything unverified holds for approval, with a calm reason.
export function decideDisclosure(input: GateInput): GateDecision {
  if (input.sensitiveRequest) {
    return {
      action: "hold_for_approval",
      reason: input.senderVerified
        ? "This asks for sensitive personal information. I never release that automatically — approve it and I'll send, or reply yourself."
        : "This asks for sensitive personal information and I couldn't verify the sender. Approve only if you trust them.",
    };
  }
  if (!input.senderVerified) {
    return {
      action: "hold_for_approval",
      reason:
        "I couldn't verify this sender, so I'm holding my reply for you to approve. Not necessarily a bad actor — mail routed through some tools can't be verified.",
    };
  }
  return {
    action: "auto_answer",
    reason: "Verified sender, routine request — answered on your behalf.",
  };
}
