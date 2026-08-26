import { describe, it, expect } from "vitest";
import { computeTrustScore, domainFor } from "./trustScore";

describe("computeTrustScore", () => {
  it("starts neutral (0.5) with no evidence", () => {
    expect(computeTrustScore(0, 0)).toBe(0.5);
  });

  it("rises toward 1 as verified sightings accumulate", () => {
    const one = computeTrustScore(1, 0);
    const ten = computeTrustScore(10, 0);
    expect(ten).toBeGreaterThan(one);
    expect(ten).toBeGreaterThan(0.9);
    expect(ten).toBeLessThan(1); // never claims certainty
  });

  it("is held back by couldn't-verify sightings", () => {
    const clean = computeTrustScore(5, 0);
    const mixed = computeTrustScore(5, 5);
    expect(mixed).toBeLessThan(clean);
    expect(mixed).toBeCloseTo(0.5, 1);
  });

  it("never returns 0 or 1 (evidence-smoothed)", () => {
    expect(computeTrustScore(0, 100)).toBeGreaterThan(0);
    expect(computeTrustScore(100, 0)).toBeLessThan(1);
  });
});

describe("domainFor", () => {
  it("uses the authenticated (aligned) domain when present", () => {
    expect(
      domainFor(
        "recruiter@acme.com",
        "mx; spf=pass; dkim=pass; dmarc=pass header.from=greenhouse.io",
      ),
    ).toBe("greenhouse.io");
  });

  it("falls back to the From domain when no auth header", () => {
    expect(domainFor("recruiter@Acme.com", null)).toBe("acme.com");
  });
});
