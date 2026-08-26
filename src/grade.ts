// Map a 0..1 trust score to a letter grade, with an SSL-Labs-style hard CAP:
// a domain that has ANY couldn't-verify sighting can't earn an A, and one that
// is majority-unverified is floored — a single disqualifying fact overrides the
// arithmetic. This is the "rigorous, not vibes" move from real registries.
export type Grade = "A" | "B" | "C" | "D" | "F";

export function gradeFor(
  trustScore: number,
  verifiedCount: number,
  unverifiedCount: number,
): Grade {
  // Cap: never award an A while any sighting failed verification.
  const hasUnverified = unverifiedCount > 0;
  // Floor: majority-unverified is untrusted regardless of score.
  if (unverifiedCount > verifiedCount) return "F";

  let g: Grade;
  if (trustScore >= 0.85) g = "A";
  else if (trustScore >= 0.7) g = "B";
  else if (trustScore >= 0.55) g = "C";
  else if (trustScore >= 0.4) g = "D";
  else g = "F";

  if (g === "A" && hasUnverified) g = "B"; // the cap
  return g;
}
