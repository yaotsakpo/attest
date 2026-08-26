// The trust TIER — the second axis, on top of the continuity (impersonation)
// check. Answers "how much do I trust who you are?", distinct from continuity's
// "are you still you?".
//
//   in_network  — a counterpart Attest itself holds the identity of (a
//                 registered Attest agent). Attest is the mutually-trusted root,
//                 so two members can deal with lower friction.
//   verified    — authenticates (DMARC) but Attest doesn't hold its identity:
//                 trusted, but earns it only by observed behavior → more scrutiny.
//   unverified  — couldn't verify; held by default.
//
// IMPORTANT: tier is NOT a substitute for the continuity check. Membership never
// rescues an impostor — a network member whose address is taken over still fails
// the forward-secret challenge. Tier only modulates scrutiny once identity holds.

export type Tier = "in_network" | "verified" | "unverified";

// Attest provisions its agents' inboxes under this domain; a counterpart on it
// is an Attest agent whose identity Attest holds.
export const NETWORK_DOMAIN = "agentmail.to";

export function tierFor(input: {
  domain: string;
  senderVerified: boolean;
  isNetworkMember: boolean; // Attest holds this counterpart's identity
}): Tier {
  if (input.isNetworkMember) return "in_network";
  return input.senderVerified ? "verified" : "unverified";
}

// Does a domain belong to Attest's network? True when it's the network domain
// (an Attest-provisioned inbox host). Callers may also pass an explicit set of
// registered member domains for a stricter check.
export function isNetworkDomain(
  domain: string,
  memberDomains?: Set<string>,
): boolean {
  if (memberDomains && memberDomains.has(domain)) return true;
  return domain === NETWORK_DOMAIN;
}

// A short, honest human label for the tier — used in the UI and the decision
// trace so the two axes read distinctly.
export function tierLabel(tier: Tier): string {
  switch (tier) {
    case "in_network":
      return "in Attest's network — identity held by Attest";
    case "verified":
      return "verified, outside the network — earns trust by behavior";
    case "unverified":
      return "couldn't verify — held by default";
  }
}
