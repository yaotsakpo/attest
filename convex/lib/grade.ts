// Canonical trust-grade logic, shared by the backend gate (pipeline) and the
// frontend registry table. Map a 0..1 trust score to a letter grade, with an
// SSL-Labs-style hard CAP: a domain with any couldn't-verify sighting can't
// earn an A, and a majority-unverified domain is floored to F — a single
// disqualifying fact overrides the arithmetic.
export type Grade = "A" | "B" | "C" | "D" | "F";

export function gradeFor(
  trustScore: number,
  verifiedCount: number,
  unverifiedCount: number,
): Grade {
  if (unverifiedCount > verifiedCount) return "F";
  const hasUnverified = unverifiedCount > 0;

  let g: Grade;
  if (trustScore >= 0.85) g = "A";
  else if (trustScore >= 0.7) g = "B";
  else if (trustScore >= 0.55) g = "C";
  else if (trustScore >= 0.4) g = "D";
  else g = "F";

  if (g === "A" && hasUnverified) g = "B"; // the cap
  return g;
}
