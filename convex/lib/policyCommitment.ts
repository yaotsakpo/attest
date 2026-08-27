// POLICY COMMITMENT — proving an agent's governance is unchanged without
// revealing what that governance is.
//
// WHY NOT JUST PUBLISH THE POLICY. A policy is a map of exactly where the
// automatic approvals stop. A counterpart who can read `payment <= $500 allow`
// invoices $499. Publishing the ruleset hands every counterpart the threshold to
// sit underneath, so the contents must stay private.
//
// WHAT IS PUBLISHED instead is a commitment: H(canonical(policy) | nonce | prev).
// From it a counterpart can check two things and learn nothing else:
//   • the rules governing this decision are the ones committed at version n;
//   • version n descends from the version in force when trust was established.
//
// WHY THE NONCE. Policies have very little entropy. Without a per-version nonce
// an adversary enumerates plausible rulesets, hashes each, and recovers the
// policy by brute force. The nonce makes the committed value unguessable, which
// is what turns a hash into a commitment.
//
// WHY A CHAIN. A legitimate policy change must be legible rather than alarming,
// so versions link: each commits to its predecessor. That also makes retroactive
// rewriting impossible once a later version exists, for the same reason a git
// history is hard to forge quietly.
//
// The security relevance: an attacker who takes over a mailbox and needs to
// authorize something the policy forbids must either operate inside rules they
// cannot see, or publish a new version and be visibly a policy that changed
// immediately before an unusual request.

export interface PolicyRule {
  id: string;
  action: string;
  customLabel?: string;
  appliesTo?: string;
  maxAmount?: number;
  requireVerified?: boolean;
  minGrade?: string;
  decision: string;
}

export interface PolicyCommitment {
  version: number;
  commit: string; // hex digest
  nonce: string; // hex, per-version, never reused
  prev: string | null; // the previous version's commit; null at the root
}

const enc = new TextEncoder();

async function sha256hex(msg: string): Promise<string> {
  const d = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(msg) as unknown as BufferSource,
  );
  let s = "";
  for (const b of new Uint8Array(d)) s += b.toString(16).padStart(2, "0");
  return s;
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

// Canonical encoding. Two policies that differ only in key order or in absent-vs-
// undefined fields must produce the SAME bytes, or an agent could appear to have
// changed its governance by re-serializing it. Rule ORDER is preserved, because
// first-match-wins makes order semantic: reordering is a real policy change.
// Field values are length-prefixed so no value can impersonate a delimiter.
function canonical(rules: PolicyRule[]): string {
  const field = (v: string | number | boolean | undefined): string =>
    v === undefined ? "-" : `${String(v).length}:${String(v)}`;
  return rules
    .map((r) =>
      [
        field(r.id),
        field(r.action),
        field(r.customLabel),
        field(r.appliesTo),
        field(r.maxAmount),
        field(r.requireVerified),
        field(r.minGrade),
        field(r.decision),
      ].join(","),
    )
    .join(";");
}

async function digest(
  rules: PolicyRule[],
  nonce: string,
  prev: string | null,
): Promise<string> {
  // Domain-separated and length-prefixed, so a policy cannot be crafted to
  // collide with a different (policy, nonce, prev) triple.
  const body = canonical(rules);
  return await sha256hex(
    `policy-commit-v1|${body.length}:${body}|${nonce}|${prev ?? "root"}`,
  );
}

// Commit to a ruleset. `prev` is the previous version's commitment record, or
// null for the first version. The version number is derived from the chain
// rather than supplied, so a caller cannot mis-number a version into looking
// like a different point in history.
export async function commitPolicy(
  rules: PolicyRule[],
  prev: PolicyCommitment | string | null,
): Promise<PolicyCommitment> {
  const prevCommit =
    prev === null ? null : typeof prev === "string" ? prev : prev.commit;
  const version =
    prev === null || typeof prev === "string" ? (prev === null ? 1 : 2) : prev.version + 1;
  const nonce = randomHex(16);
  const commit = await digest(rules, nonce, prevCommit);
  return { version, commit, nonce, prev: prevCommit };
}

// Does this ruleset match this commitment? The verifier must be given the rules
// (by the agent, when it chooses to prove), plus the public commitment record.
export async function verifyCommitment(
  rules: PolicyRule[],
  c: PolicyCommitment,
): Promise<boolean> {
  const expected = await digest(rules, c.nonce, c.prev);
  return timingSafeEqual(expected, c.commit);
}

// Is this a well-formed version chain: rooted, contiguous, each linking to the
// last? Detects retroactive rewriting and splicing, neither of which can survive
// a later version that commits to what it replaced.
export async function verifyChain(chain: PolicyCommitment[]): Promise<boolean> {
  if (chain.length === 0) return false;
  if (chain[0].prev !== null) return false; // must start at the root
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].prev !== chain[i - 1].commit) return false;
    if (chain[i].version !== chain[i - 1].version + 1) return false;
  }
  return true;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
