// Attest's policy engine — the user-owned ruleset the agent consults before it
// acts on the user's behalf. Structured input (Inbin schema pattern), NO LLM in
// the enforcement path: rules are typed, and evaluation is deterministic.
//
// This generalizes the hardcoded disclosure gate: "sensitive request → hold" is
// just one special case of a user rule. When no rule matches, we fall back to
// the safe default gate (decideDisclosure).

import {
  decideDisclosure,
  type GateGrade,
  type GateDecision,
} from "./disclosureGate";

// Predefined actions the agent understands, plus a "custom" escape hatch the
// user can name themselves (matched by customLabel).
export type RuleAction =
  | "reply"
  | "payment"
  | "share_info"
  | "schedule"
  | "custom";

export type RuleDecision = "allow" | "hold" | "deny";

export interface Rule {
  id: string;
  action: RuleAction;
  customLabel?: string; // required when action === "custom"
  appliesTo?: string; // domain scope; absent = global
  maxAmount?: number; // payment threshold; auto-act only at/below
  requireVerified?: boolean; // auto-act only if sender verified
  minGrade?: GateGrade; // auto-act only if counterpart grade meets bar
  decision: RuleDecision;
}

// The action the incoming email is requesting. For predefined actions this is
// one of RuleAction; for a custom action it's the free-form label string.
export interface PolicyRequest {
  action: string;
  amount?: number;
  senderVerified: boolean;
  grade: GateGrade;
  domain: string;
}

export interface PolicyResult {
  decision: RuleDecision;
  reason: string;
}

// A best … F worst. Lower rank number = better grade.
const GRADE_RANK: Record<GateGrade, number> = { A: 0, B: 1, C: 2, D: 3, F: 4 };

// The label a rule matches against: its customLabel for custom rules, else the
// predefined action name.
function ruleLabel(r: Rule): string {
  return r.action === "custom" ? (r.customLabel ?? "") : r.action;
}

function matches(r: Rule, req: PolicyRequest): boolean {
  if (ruleLabel(r) !== req.action) return false;
  if (r.appliesTo && r.appliesTo !== req.domain) return false;
  if (r.maxAmount !== undefined) {
    // a threshold rule requires an amount, and it must be at or below the cap
    if (req.amount === undefined || req.amount > r.maxAmount) return false;
  }
  if (r.requireVerified && !req.senderVerified) return false;
  if (r.minGrade && GRADE_RANK[req.grade] > GRADE_RANK[r.minGrade]) return false;
  return true;
}

function reasonFor(r: Rule): string {
  const who = r.appliesTo ? `for ${r.appliesTo}` : "";
  switch (r.decision) {
    case "allow":
      return `Allowed by your policy — "${ruleLabel(r)}" ${who} is auto-approved.`.replace(
        /\s+/g,
        " ",
      ).trim();
    case "deny":
      return `Blocked by your policy — "${ruleLabel(r)}" ${who} is never allowed. Holding for you.`
        .replace(/\s+/g, " ")
        .trim();
    case "hold":
    default:
      return `Your policy holds "${ruleLabel(r)}" ${who} for your approval.`
        .replace(/\s+/g, " ")
        .trim();
  }
}

// Walk rules in order, first match wins. A rule whose action matches but whose
// threshold fails is NOT a match — evaluation falls through to the next rule and
// ultimately to null (caller uses the default gate). Returns null when no rule
// applies.
export function evaluatePolicy(
  rules: Rule[],
  req: PolicyRequest,
): PolicyResult | null {
  for (const r of rules) {
    if (matches(r, req)) {
      return { decision: r.decision, reason: reasonFor(r) };
    }
  }
  return null;
}

// Parse a payment request + amount from free text. Conservative: only treats it
// as a payment when money language is present. Returns the amount if found.
const MONEY = /\$\s?([\d,]+(?:\.\d{1,2})?)/;
const PAY_INTENT =
  /\b(pay|remit|invoice|wire|transfer|charge|bill|deposit)\b/i;

export function detectPaymentRequest(
  text: string,
): { isPayment: boolean; amount?: number } {
  if (!PAY_INTENT.test(text)) return { isPayment: false };
  const m = text.match(MONEY);
  const amount = m ? Number(m[1]!.replace(/,/g, "")) : undefined;
  return { isPayment: true, amount };
}

export interface DecideActionInput {
  grade: GateGrade;
  senderVerified: boolean;
  sensitiveRequest: boolean;
  domain: string;
  text: string;
  rules: Rule[];
}

// Map an incoming email to the action the user's policy reasons about. Payment
// intent wins (it's the higher-stakes classification), then a sensitive-info
// request maps to share_info, else a plain reply. Exported so the
// "remember this decision" flow classifies a held item exactly the way the gate
// did — one source of truth, so the rule it writes will actually match next time.
export function classifyRequest(
  text: string,
  sensitiveRequest: boolean,
): { action: string; amount?: number } {
  const pay = detectPaymentRequest(text);
  if (pay.isPayment) return { action: "payment", amount: pay.amount };
  if (sensitiveRequest) return { action: "share_info" };
  return { action: "reply" };
}

// The unified gate: consult the user's policy first; fall back to the safe
// default disclosure gate when no rule matches. `allow` → auto_answer;
// `hold`/`deny` → hold_for_approval (deny never auto-acts).
export function decideAction(input: DecideActionInput): GateDecision {
  // CONTAINMENT GUARANTEE: releasing sensitive PII (SSN, bank, DOB, …) can NEVER
  // be auto-approved — not by a policy rule, not by any level of trust. A human
  // always approves sensitive disclosure. This is what bounds a compromised
  // trusted domain: even a verified, A-grade, explicitly-allowed sender cannot
  // make the agent hand over sensitive data on its own. Checked BEFORE policy.
  if (input.sensitiveRequest) {
    return decideDisclosure({
      grade: input.grade,
      senderVerified: input.senderVerified,
      sensitiveRequest: true,
    });
  }

  const { action, amount } = classifyRequest(
    input.text,
    input.sensitiveRequest,
  );
  const hit = evaluatePolicy(input.rules, {
    action,
    amount,
    senderVerified: input.senderVerified,
    grade: input.grade,
    domain: input.domain,
  });

  if (hit) {
    return {
      action: hit.decision === "allow" ? "auto_answer" : "hold_for_approval",
      reason: hit.reason,
    };
  }

  // Safe default for MONEY: the disclosure gate below only understands
  // verification + sensitive info, not payments. If money is at stake and no
  // policy rule explicitly allowed it, we must HOLD — never auto-answer a
  // payment the user never authorized.
  if (action === "payment") {
    return {
      action: "hold_for_approval",
      reason:
        "This involves a payment your agent isn't authorized to approve on its own. Set a policy rule to allow it, or approve this one.",
    };
  }

  return decideDisclosure({
    grade: input.grade,
    senderVerified: input.senderVerified,
    sensitiveRequest: input.sensitiveRequest,
  });
}
