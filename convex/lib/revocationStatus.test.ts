// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import {
  resolveRevocation,
  identityRevokedFor,
  type RevocationInput,
} from "./revocationStatus";

const TTL = 5 * 60_000; // 5 minutes
const NOW = 1_700_000_000_000;

function input(over: Partial<RevocationInput> = {}): RevocationInput {
  return {
    cachedStatus: "active",
    statusCheckedAt: NOW, // fresh
    now: NOW,
    ttlMs: TTL,
    ...over,
  };
}

describe("revocation resolution (spec §5)", () => {
  it("a known-revoked identity yields verdict 'revoked'", () => {
    const r = resolveRevocation(input({ cachedStatus: "revoked" }));
    expect(r.verdict).toBe("revoked");
    expect(identityRevokedFor(r, false)).toBe(true); // holds even non-consequential
  });

  it("a fresh active status yields 'active'", () => {
    const r = resolveRevocation(input({ statusCheckedAt: NOW }));
    expect(r.verdict).toBe("active");
    expect(r.stale).toBe(false);
    expect(identityRevokedFor(r, true)).toBe(false);
  });

  it("a stale active status (older than TTL) yields 'unknown', NOT 'active'", () => {
    // cache written 6 minutes ago, TTL 5 minutes
    const r = resolveRevocation(
      input({ statusCheckedAt: NOW - 6 * 60_000 }),
    );
    expect(r.verdict).toBe("unknown");
    expect(r.stale).toBe(true);
    expect(r.verdict).not.toBe("active");
  });

  it("unknown status + a consequential action holds (fail closed)", () => {
    const r = resolveRevocation(input({ statusCheckedAt: NOW - 6 * 60_000 }));
    expect(r.verdict).toBe("unknown");
    expect(identityRevokedFor(r, true)).toBe(true); // consequential => hold
  });

  it("unknown status + a routine (non-consequential) action does NOT hold", () => {
    const r = resolveRevocation(input({ statusCheckedAt: NOW - 6 * 60_000 }));
    expect(r.verdict).toBe("unknown");
    expect(identityRevokedFor(r, false)).toBe(false); // stale doesn't block routine replies
  });

  it("status age is recorded and exposed at decision time", () => {
    const age = 90_000;
    const r = resolveRevocation(input({ statusCheckedAt: NOW - age }));
    expect(r.statusAgeMs).toBe(age);
  });

  it("clock skew (checkedAt in the future) yields age 0, not negative", () => {
    const r = resolveRevocation(input({ statusCheckedAt: NOW + 10_000 }));
    expect(r.statusAgeMs).toBe(0);
    expect(r.verdict).toBe("active");
  });

  it("a revoked status that is also stale is still 'revoked' (revocation wins)", () => {
    const r = resolveRevocation(
      input({ cachedStatus: "revoked", statusCheckedAt: NOW - 60 * 60_000 }),
    );
    expect(r.verdict).toBe("revoked");
  });
});
