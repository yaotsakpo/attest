// Derive a domain's trust score from observed authenticated-mail behavior.
//
// Trust is EARNED, not asserted: a domain that consistently sends DMARC-aligned
// mail climbs toward 1.0; couldn't-verify sightings hold it back. We use a
// smoothed ratio (Laplace / add-one) so a single sighting isn't 0 or 1 — trust
// accrues with evidence, the way a real reputation does.
//
//   score = (verified + 1) / (verified + unverified + 2)
//
// Properties: starts at 0.5 with no evidence, rises with verified volume,
// never claims certainty from thin data. Pure function — unit-tested directly.
export function computeTrustScore(
  verifiedCount: number,
  unverifiedCount: number,
): number {
  const v = Math.max(0, verifiedCount);
  const u = Math.max(0, unverifiedCount);
  return (v + 1) / (v + u + 2);
}

// Extract the registry key domain: prefer the authenticated (aligned) domain
// from the auth header, else fall back to the From address domain. Lowercased.
export function domainFor(
  fromAddress: string,
  authResultsHeader: string | null,
): string {
  if (authResultsHeader) {
    const m = authResultsHeader.toLowerCase().match(/header\.from=([^\s;]+)/);
    if (m && m[1]) return m[1];
  }
  const fm = fromAddress.trim().toLowerCase().match(/@([^>\s]+)/);
  return fm ? fm[1]! : "";
}
