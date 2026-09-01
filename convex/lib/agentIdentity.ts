// Agent Identity layer (third axis): accountability, not authentication.
//
// Answers "who is this agent acting for, and what is it authorised to do?" —
// distinct from continuity (is it still the same principal?) and reputation
// (should a report travel?). See docs/specs/agent-identity-layer.md.
//
// THE NON-NEGOTIABLE PRINCIPLE (spec §2): the identity object carries ZERO
// authentication weight. Possession of it, in full, grants nothing. It is a
// public, loggable pointer — not a secret, not a credential, not a bearer
// token, not a capability. RFC 6749 §2.2: "The client identifier is not a
// secret ... MUST NOT be used alone for client authentication." Any reviewer
// must be able to publish the entire object on a billboard without weakening
// the system.
//
// Verifying issuerSignature establishes exactly ONE thing: the issuer asserted
// this binding. It does NOT establish that the sender of the current message is
// that agent — that is continuity's job, and continuity is unchanged.
//
// Real crypto: Ed25519 via Web Crypto (crypto.subtle), available in Convex
// actions and the edge-runtime test env. Canonical, length-prefixed encoding
// (mirrors policyCommitment.ts) so no field value can impersonate a delimiter.

export type IdentityScope =
  | "read_only"
  | "correspond"
  | "transact"
  | "administer";

// The public identity object. Every field here is public by design.
export interface AgentIdentity {
  agentId: string; // stable, public, opaque. NOT derived from owner or address.
  ownerId: string; // resolves to an accountable PRINCIPAL (org/role/person), opaque
  scopes: IdentityScope[]; // DECLARED capabilities (a SET). Descriptive, never enforcing.
  issuer: string; // who attests the binding: "self" or a registry id
  issuedAt: number;
  revocationRef: string; // where current status is checked
  // issuerSignature covers the fields above; it grants nothing by itself.
  issuerSignature: string;
}

// Canonical order for the scope set, so the same capabilities always sign
// identically regardless of the order they were declared in.
const SCOPE_ORDER: IdentityScope[] = [
  "read_only",
  "correspond",
  "transact",
  "administer",
];
function canonicalScopes(scopes: IdentityScope[]): string {
  const present = new Set(scopes);
  return SCOPE_ORDER.filter((s) => present.has(s)).join(",");
}

// The fields the signature binds (everything except the signature itself).
export type SignedIdentityFields = Omit<AgentIdentity, "issuerSignature">;

const enc = new TextEncoder();

// Canonical, length-prefixed encoding: `${len}:${value}` per field, joined by a
// delimiter. Because each field is prefixed with its own length, no value can
// contain the delimiter and impersonate a field boundary (the field-boundary
// attack the tests exercise). Mirrors policyCommitment.ts canonical().
export function canonicalIdentity(f: SignedIdentityFields): string {
  const field = (v: string | number): string => {
    const s = String(v);
    return `${s.length}:${s}`;
  };
  return [
    field(f.agentId),
    field(f.ownerId),
    field(canonicalScopes(f.scopes)),
    field(f.issuer),
    field(f.issuedAt),
    field(f.revocationRef),
  ].join("|");
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Sign the canonical encoding with an Ed25519 private key. Used by the "self"
// issuer path in the demo and by tests. Returns a hex signature.
export async function signIdentityBinding(
  fields: SignedIdentityFields,
  privateKey: CryptoKey,
): Promise<string> {
  const msg = enc.encode(canonicalIdentity(fields));
  const sig = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    msg as unknown as BufferSource,
  );
  return toHex(new Uint8Array(sig));
}

// Verify that `issuer` asserted this binding. Establishes ONLY that the issuer
// signed these exact fields — nothing about the current sender's liveness.
// Returns false on any malformed input rather than throwing, so a bad object
// can never crash the gate (fail-closed for verification).
export async function verifyIdentityBinding(
  identity: AgentIdentity,
  issuerPublicKey: CryptoKey,
): Promise<boolean> {
  try {
    const { issuerSignature, ...fields } = identity;
    if (!issuerSignature) return false;
    const msg = enc.encode(canonicalIdentity(fields));
    return await crypto.subtle.verify(
      "Ed25519",
      issuerPublicKey,
      hexToBytes(issuerSignature) as unknown as BufferSource,
      msg as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

// Test/demo helper: generate an Ed25519 keypair via Web Crypto.
export async function generateIssuerKeypair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
}
