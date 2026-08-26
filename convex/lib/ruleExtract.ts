// Keyless, rule-based email extraction. Runs when no OPENAI_API_KEY is set so
// the pipeline (and the demo) works with zero LLM spend. When a key IS present,
// extract.ts uses OpenAI for smarter results and this is the fallback.
//
// Honest by construction: it only classifies from signals actually present in
// the text, and returns null for fields it cannot determine — it never invents
// an interview date or a role it didn't see.

export type EventType =
  | "confirmation"
  | "recruiter_reply"
  | "interview_invite"
  | "rejection"
  | "offer";

export interface RuleExtraction {
  company: string | null;
  role: string | null;
  eventType: EventType;
}

// Domain -> a human-ish company name. Strips the TLD and known ATS suffixes.
function companyFromDomain(domain: string): string | null {
  if (!domain) return null;
  const base = domain.toLowerCase().split(".")[0];
  if (!base) return null;
  // Known ATS/mailer domains don't name the hiring company.
  const ats = new Set(["greenhouse", "lever", "myworkday", "workday", "ashby", "smartrecruiters"]);
  if (ats.has(base)) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Order matters: check the most specific / highest-stakes signals first.
function classify(text: string): EventType {
  const t = text.toLowerCase();
  if (/\b(unfortunately|not moving forward|other candidates|won'?t be moving|decided not to|regret to inform)\b/.test(t))
    return "rejection";
  if (/\b(offer|pleased to offer|offer letter|compensation package)\b/.test(t))
    return "offer";
  if (/\b(interview|schedule a (call|chat)|availability|are you free|book a time|next round|onsite|technical (screen|round))\b/.test(t))
    return "interview_invite";
  if (/\b(thanks for applying|application (received|has been received)|received your application|thank you for your interest)\b/.test(t))
    return "confirmation";
  return "recruiter_reply";
}

export function ruleExtract(
  subject: string,
  body: string,
  fromDomain: string,
): RuleExtraction {
  const combined = `${subject}\n${body}`;
  return {
    company: companyFromDomain(fromDomain),
    role: null, // we do not guess a role from unstructured text without an LLM
    eventType: classify(combined),
  };
}
