// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import {
  canonicalIdentity,
  signIdentityBinding,
  verifyIdentityBinding,
  generateIssuerKeypair,
  type AgentIdentity,
  type SignedIdentityFields,
} from "./agentIdentity";

async function makeIdentity(
  overrides: Partial<SignedIdentityFields> = {},
): Promise<{ identity: AgentIdentity; keys: CryptoKeyPair }> {
  const keys = await generateIssuerKeypair();
  const fields: SignedIdentityFields = {
    agentId: "agent_7f3a",
    ownerId: "owner_acme",
    scope: "correspond",
    issuer: "self",
    issuedAt: 1_700_000_000_000,
    revocationRef: "https://revoke.example/agent_7f3a",
    ...overrides,
  };
  const issuerSignature = await signIdentityBinding(fields, keys.privateKey);
  return { identity: { ...fields, issuerSignature }, keys };
}

describe("agent identity: binding", () => {
  it("a well-formed identity with a valid signature verifies", async () => {
    const { identity, keys } = await makeIdentity();
    expect(await verifyIdentityBinding(identity, keys.publicKey)).toBe(true);
  });

  it("altering agentId invalidates the signature", async () => {
    const { identity, keys } = await makeIdentity();
    const tampered = { ...identity, agentId: "agent_evil" };
    expect(await verifyIdentityBinding(tampered, keys.publicKey)).toBe(false);
  });

  it("altering ownerId invalidates the signature", async () => {
    const { identity, keys } = await makeIdentity();
    const tampered = { ...identity, ownerId: "owner_attacker" };
    expect(await verifyIdentityBinding(tampered, keys.publicKey)).toBe(false);
  });

  it("altering scope invalidates the signature", async () => {
    const { identity, keys } = await makeIdentity({ scope: "correspond" });
    const tampered: AgentIdentity = { ...identity, scope: "administer" };
    expect(await verifyIdentityBinding(tampered, keys.publicKey)).toBe(false);
  });

  it("altering revocationRef invalidates the signature", async () => {
    const { identity, keys } = await makeIdentity();
    const tampered = { ...identity, revocationRef: "https://evil/agent" };
    expect(await verifyIdentityBinding(tampered, keys.publicKey)).toBe(false);
  });

  it("a signature from a different issuer key does not verify", async () => {
    const { identity } = await makeIdentity();
    const otherKeys = await generateIssuerKeypair();
    expect(await verifyIdentityBinding(identity, otherKeys.publicKey)).toBe(
      false,
    );
  });

  it("a missing/empty signature returns false, never throws", async () => {
    const { identity, keys } = await makeIdentity();
    const noSig = { ...identity, issuerSignature: "" };
    expect(await verifyIdentityBinding(noSig, keys.publicKey)).toBe(false);
  });

  it("a malformed (non-hex) signature returns false, never throws", async () => {
    const { identity, keys } = await makeIdentity();
    const bad = { ...identity, issuerSignature: "not-hex-zz!!" };
    expect(await verifyIdentityBinding(bad, keys.publicKey)).toBe(false);
  });
});

describe("agent identity: field-boundary attack (canonical encoding)", () => {
  it("values containing the delimiter do not produce a colliding encoding", () => {
    // Two different field assignments that would collide under naive join.
    // With length-prefixing, the encodings must differ.
    const a: SignedIdentityFields = {
      agentId: "x|y", // contains the delimiter
      ownerId: "z",
      scope: "correspond",
      issuer: "self",
      issuedAt: 1,
      revocationRef: "r",
    };
    const b: SignedIdentityFields = {
      agentId: "x",
      ownerId: "y|z", // delimiter shifted across the boundary
      scope: "correspond",
      issuer: "self",
      issuedAt: 1,
      revocationRef: "r",
    };
    expect(canonicalIdentity(a)).not.toBe(canonicalIdentity(b));
  });

  it("a value that mimics a length prefix cannot forge a boundary", async () => {
    // agentId engineered to look like a longer/shorter field must still bind
    // exactly: signing A and verifying against A' (crafted) fails.
    const keys = await generateIssuerKeypair();
    const fieldsA: SignedIdentityFields = {
      agentId: "3:abcowner", // looks like "3:abc" + "owner" under a naive parser
      ownerId: "o",
      scope: "correspond",
      issuer: "self",
      issuedAt: 1,
      revocationRef: "r",
    };
    const sig = await signIdentityBinding(fieldsA, keys.privateKey);
    const crafted: AgentIdentity = {
      agentId: "3:abc",
      ownerId: "owner", // the "smuggled" portion moved into ownerId
      scope: "correspond",
      issuer: "self",
      issuedAt: 1,
      revocationRef: "o",
      issuerSignature: sig,
    };
    expect(await verifyIdentityBinding(crafted, keys.publicKey)).toBe(false);
  });
});
