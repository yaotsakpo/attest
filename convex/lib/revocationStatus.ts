// Revocation status resolution for agent identities (spec §5).
//
// Policy: ttl_bounded (the cache expires after a TTL regardless of whether a
// refresh was attempted), NOT the fail_closed the spec §5 originally named.
//
// Why ttl_bounded, stated at the correct strength (the supporting paper,
// "Checking More Often Makes It Worse", papers/revocation-propagation-v1.0.md,
// was heavily corrected under adversarial review — several results were
// withdrawn or demoted, so this cites ONLY what survived):
//   • An adversary who suppresses refreshes only after revocation achieves near-
//     total EVASION against cache-use (100%) and fail_closed (~94%). This is a
//     genuine MEASUREMENT that varies with the check interval. It is the reason
//     cache-use and fail_closed are inadequate here, and a TTL is what bounds it.
//   • fail_closed is additionally nearly INERT at realistic check intervals: it
//     addresses a refresh that was attempted and failed, not the interval during
//     which none is attempted, and the interval is the dominant term.
// NOTE ON ATTRIBUTION: the evasion-vs-outage FRAMING ("a TTL is a mandatory
// choice between two attacks") is prior art, conceded to the browser-PKI
// literature (Langley 2012). The mirror "outage" attack is a closed-form
// identity (ttl=t refuses ~ (100 - t)% under total suppression), NOT a measured
// result. So the TTL is a documented deployment parameter here; we do not claim
// its necessity as a novel finding. The one novel result that survived is
// Proposition 1 (the 1/k pricing law), which does not bear on this code path.
//
// The gate consumes ONLY the resolved verdict; it never reads identity fields
// to become more permissive. This function can add a hold, never lift one.

export type RevocationVerdict = "active" | "revoked" | "unknown";

export interface RevocationInput {
  // Cached status from the last successful check of revocationRef.
  cachedStatus: "active" | "revoked";
  // When that cache was written (ms epoch). Stale by construction.
  statusCheckedAt: number;
  now: number;
  // TTL in milliseconds: how old a cache may be before it is treated as unknown.
  // A tight TTL resists evasion but is vulnerable to an outage attack; a loose
  // TTL is available but concedes evasion. This is the deployment's choice.
  ttlMs: number;
}

export interface RevocationResult {
  verdict: RevocationVerdict;
  // Age of the cached status at decision time (ms). Exposed for audit and for
  // the instrumentation the paper's finding depends on (spec §5: "emit the age
  // of the status at decision time; do not optimise the propagation delay away
  // before it is measured").
  statusAgeMs: number;
  stale: boolean;
}

// TTL-bounded resolution (a standard revocation-cache policy, RFC 6960 / browser
// PKI; NOT a novel result of ours). A bounded cache is chosen over an aggressive
// fail-closed refresh because a stale cache should stop governing regardless of
// whether a refresh was even attempted.
//   revoked            -> revoked   (a known revocation always holds)
//   active & fresh     -> active
//   active & too old   -> unknown   (older than TTL => treat as unknown)
// "unknown" is NOT "active": the caller fails closed on unknown for a
// consequential action (see identityRevokedFor).
export function resolveRevocation(input: RevocationInput): RevocationResult {
  const statusAgeMs = Math.max(0, input.now - input.statusCheckedAt);
  const stale = statusAgeMs > input.ttlMs;
  if (input.cachedStatus === "revoked") {
    return { verdict: "revoked", statusAgeMs, stale };
  }
  // cached active
  return { verdict: stale ? "unknown" : "active", statusAgeMs, stale };
}

// The single boolean the gate consumes (spec §6 `identityRevoked`): hold when
// the identity is known-revoked, OR its status is unknown and the action is
// consequential. Fail closed on unknown only for consequential actions, so a
// stale identity does not needlessly hold routine, low-stakes replies.
export function identityRevokedFor(
  result: RevocationResult,
  consequential: boolean,
): boolean {
  if (result.verdict === "revoked") return true;
  if (result.verdict === "unknown" && consequential) return true;
  return false;
}
