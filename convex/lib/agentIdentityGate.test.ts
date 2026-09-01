// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { decideAction, type DecideActionInput } from "./policyEngine";
import {
  signIdentityBinding,
  verifyIdentityBinding,
  generateIssuerKeypair,
  type AgentIdentity,
  type SignedIdentityFields,
} from "./agentIdentity";

// A baseline input where the gate WOULD auto-answer (verified, A-grade, non-
// sensitive reply, no policy rule blocking). We then show identity can never
// make it more permissive, and can only add holds.
function baseAllow(over: Partial<DecideActionInput> = {}): DecideActionInput {
  return {
    grade: "A",
    senderVerified: true,
    sensitiveRequest: false,
    domain: "acme.com",
    text: "Following up on the interview schedule.",
    rules: [],
    tier: "in_network",
    ...over,
  };
}

async function validIdentity(
  scopes: SignedIdentityFields["scopes"] = ["administer"],
): Promise<{ identity: AgentIdentity; keys: CryptoKeyPair }> {
  const keys = await generateIssuerKeypair();
  const fields: SignedIdentityFields = {
    agentId: "agent_known",
    ownerId: "owner_known",
    scopes,
    issuer: "self",
    issuedAt: 1_700_000_000_000,
    revocationRef: "https://revoke/agent_known",
  };
  const issuerSignature = await signIdentityBinding(fields, keys.privateKey);
  return { identity: { ...fields, issuerSignature }, keys };
}

describe("zero-authority invariant (spec §2 / §8)", () => {
  it("a fully-known, valid identity grants NO action the gate would otherwise hold", async () => {
    // Gate would HOLD this: unverified sender asking to share info.
    const held = decideAction(
      baseAllow({
        senderVerified: false,
        grade: "F",
        sensitiveRequest: true,
        tier: "unverified",
      }),
    );
    expect(held.action).toBe("hold_for_approval");

    // Now the sender presents a fully-valid, verified identity. It must NOT
    // change the outcome: decideAction does not even accept the identity object,
    // by design. The verdict is identical.
    const { identity, keys } = await validIdentity();
    expect(await verifyIdentityBinding(identity, keys.publicKey)).toBe(true);
    const stillHeld = decideAction(
      baseAllow({
        senderVerified: false,
        grade: "F",
        sensitiveRequest: true,
        tier: "unverified",
      }),
    );
    expect(stillHeld.action).toBe("hold_for_approval");
    expect(stillHeld).toEqual(held);
  });

  it("a valid issuerSignature does NOT lift a continuityHold", async () => {
    const { identity, keys } = await validIdentity();
    expect(await verifyIdentityBinding(identity, keys.publicKey)).toBe(true);
    const d = decideAction(baseAllow({ continuityHold: true }));
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/continuity/i);
  });

  it("a valid issuerSignature does NOT lift reputationFlagged", async () => {
    const { identity, keys } = await validIdentity();
    expect(await verifyIdentityBinding(identity, keys.publicKey)).toBe(true);
    const d = decideAction(baseAllow({ reputationFlagged: true }));
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/takeover|flagged/i);
  });

  it('scope "transact" does NOT permit a payment the user policy would hold', async () => {
    // An unauthorized payment always holds (no allow rule). A transact-scoped
    // identity must not change that.
    const { identity } = await validIdentity(["transact"]);
    expect(identity.scopes).toContain("transact");
    const d = decideAction(
      baseAllow({ text: "Please wire $5,000 to finalize.", rules: [] }),
    );
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/payment/i);
  });

  it("decideAction has no identity field input other than identityRevoked", () => {
    // Structural guard: the ONLY identity-derived input the gate accepts is the
    // boolean revoked/unknown flag. If someone adds e.g. `identityScope` or
    // `identityValid` to DecideActionInput, this test should be revisited.
    // We assert behaviourally: passing identityRevoked:false is a no-op.
    const allow = decideAction(baseAllow());
    const withFlagFalse = decideAction(baseAllow({ identityRevoked: false }));
    expect(withFlagFalse).toEqual(allow);
  });
});

describe("identity as a hold condition (spec §6)", () => {
  it("identityRevoked holds an action the gate would otherwise allow", () => {
    const allow = decideAction(baseAllow());
    expect(allow.action).toBe("auto_answer");
    const revoked = decideAction(baseAllow({ identityRevoked: true }));
    expect(revoked.action).toBe("hold_for_approval");
    expect(revoked.reason).toMatch(/identity|revoked/i);
  });

  it("continuity outranks identity: a continuityHold reason wins over identity", () => {
    // Both set — continuity is higher priority, so its reason is returned.
    const d = decideAction(
      baseAllow({ continuityHold: true, identityRevoked: true }),
    );
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/continuity/i);
  });

  it("reputation outranks identity", () => {
    const d = decideAction(
      baseAllow({ reputationFlagged: true, identityRevoked: true }),
    );
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/takeover|flagged/i);
  });

  it("identity outranks sensitive containment in ordering (both hold anyway)", () => {
    // identityRevoked is checked before sensitive; both hold, but identity's
    // reason is returned, proving the §6 ordering.
    const d = decideAction(
      baseAllow({ identityRevoked: true, sensitiveRequest: true }),
    );
    expect(d.action).toBe("hold_for_approval");
    expect(d.reason).toMatch(/identity|revoked/i);
  });
});
