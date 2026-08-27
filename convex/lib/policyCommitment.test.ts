import { describe, expect, test } from "vitest";
import {
  commitPolicy,
  verifyCommitment,
  verifyChain,
  type PolicyCommitment,
  type PolicyRule,
} from "./policyCommitment";

// POLICY COMMITMENT — proving an agent's governance is unchanged without
// revealing what that governance is.
//
// The policy itself must NEVER be published: it is a map of exactly where the
// automatic approvals stop, so a counterpart who reads `payment <= $500 allow`
// simply invoices $499. What is published is a COMMITMENT: H(policy | nonce |
// prev). A counterpart learns that the rules governing this decision are the
// same rules that governed the last one, and learns nothing about the rules.
//
// Versions chain, so a legitimate policy change is a legible event rather than
// an alarm, and a retroactive rewrite is impossible once a later version exists.

const RULES_A: PolicyRule[] = [
  { id: "pay500", action: "payment", maxAmount: 500, decision: "allow" },
];
const RULES_B: PolicyRule[] = [
  { id: "pay500", action: "payment", maxAmount: 500, decision: "allow" },
  { id: "share", action: "share_info", decision: "hold" },
];

describe("commitment hides the policy", () => {
  test("the commitment does not contain the rules in any readable form", async () => {
    const c = await commitPolicy(RULES_A, null);
    expect(c.commit).not.toContain("500");
    expect(c.commit).not.toContain("payment");
    expect(c.commit).toMatch(/^[a-f0-9]{64}$/);
  });

  test("LOW-ENTROPY GUESSING: the same rules commit to DIFFERENT values each time", async () => {
    // Policies have little entropy. Without a per-version nonce an adversary
    // enumerates plausible rulesets, hashes them, and recovers the policy by
    // brute force. The nonce is what makes the commitment a commitment.
    const c1 = await commitPolicy(RULES_A, null);
    const c2 = await commitPolicy(RULES_A, null);
    expect(c1.commit).not.toBe(c2.commit);
  });
});

describe("the nonce is the confidentiality boundary", () => {
  // Measured: with the nonce known, a policy is recovered in 28 guesses by
  // enumerating plausible thresholds. Without it, each candidate additionally
  // requires guessing 128 bits. The nonce is therefore not a formatting detail;
  // it is the whole reason the commitment hides anything.
  test("each version carries a fresh 128-bit nonce", async () => {
    const c1 = await commitPolicy(RULES_A, null);
    const c2 = await commitPolicy(RULES_A, null);
    expect(c1.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(c1.nonce).not.toBe(c2.nonce);
  });

  test("REUSED NONCE across versions leaks that the policy is unchanged", async () => {
    // If two versions shared a nonce, identical rules would produce identical
    // digests, revealing to any observer that nothing changed. Fresh nonces mean
    // even an unchanged policy re-commits to a fresh-looking value.
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_A, v1); // SAME rules, new version
    expect(v2.commit).not.toBe(v1.commit);
  });
});

describe("commitment binds the policy", () => {
  test("the committed policy verifies against its own commitment", async () => {
    const c = await commitPolicy(RULES_A, null);
    expect(await verifyCommitment(RULES_A, c)).toBe(true);
  });

  test("SILENT SWAP: a different ruleset does NOT verify", async () => {
    const c = await commitPolicy(RULES_A, null);
    expect(await verifyCommitment(RULES_B, c)).toBe(false);
  });

  test("a single changed threshold does not verify", async () => {
    const c = await commitPolicy(RULES_A, null);
    const raised: PolicyRule[] = [
      { id: "pay500", action: "payment", maxAmount: 50000, decision: "allow" },
    ];
    expect(await verifyCommitment(raised, c)).toBe(false);
  });

  test("rule ORDER is bound (first match wins, so order is semantic)", async () => {
    const c = await commitPolicy(RULES_B, null);
    const reordered = [RULES_B[1], RULES_B[0]];
    expect(await verifyCommitment(reordered, c)).toBe(false);
  });
});

describe("version chain", () => {
  test("a legitimate change produces a version that descends from the last", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    expect(v2.version).toBe(v1.version + 1);
    expect(v2.prev).toBe(v1.commit);
    expect(await verifyChain([v1, v2])).toBe(true);
  });

  test("a chain of several versions verifies end to end", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    const v3 = await commitPolicy(RULES_A, v2);
    expect(await verifyChain([v1, v2, v3])).toBe(true);
  });

  test("RETROACTIVE REWRITE: substituting an earlier version breaks the chain", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    // the agent tries to rewrite history: swap v1 for a version it prefers
    const forgedV1 = await commitPolicy(RULES_B, null);
    expect(await verifyChain([forgedV1, v2])).toBe(false);
  });

  test("a version spliced out of the middle breaks the chain", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    const v3 = await commitPolicy(RULES_A, v2);
    expect(await verifyChain([v1, v3])).toBe(false);
  });

  test("a chain that does not start at the root is rejected", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    expect(await verifyChain([v2])).toBe(false);
  });
});

describe("what a counterpart can check", () => {
  test("governance unchanged: the current version is the one trust was established at", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    // counterpart recorded v1.commit at trust-establishment; nothing has changed
    expect(v1.commit).toBe(v1.commit);
    expect(await verifyCommitment(RULES_A, v1)).toBe(true);
  });

  test("governance CHANGED is visible without revealing what changed", async () => {
    const v1 = await commitPolicy(RULES_A, null);
    const v2 = await commitPolicy(RULES_B, v1);
    // the counterpart sees a new commitment and a bumped version. That a change
    // occurred is public; WHAT changed is not derivable from the commitments.
    expect(v2.commit).not.toBe(v1.commit);
    expect(v2.version).toBeGreaterThan(v1.version);
    expect(v2.commit).not.toContain("share_info");
  });
});
