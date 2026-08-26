import { describe, it, expect } from "vitest";
import { evaluateSender } from "./senderAuth";

describe("evaluateSender", () => {
  it("verified when dmarc=pass and aligned to the From domain", () => {
    const r = evaluateSender(
      "recruiter@acme.com",
      "mx; spf=pass; dkim=pass; dmarc=pass header.from=acme.com",
    );
    expect(r.verified).toBe(true);
  });

  it("NOT verified (couldn't verify) when dmarc fails — never 'fake'", () => {
    const r = evaluateSender(
      "recruiter@acme.com",
      "mx; spf=pass; dkim=fail; dmarc=fail header.from=acme.com",
    );
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/DMARC/i);
  });

  it("NOT verified when dmarc passes but the authenticated domain differs from the From domain (ATS case)", () => {
    // legit ATS mail: the From header says the recruiter is @acme.com, but the
    // mail authenticated as greenhouse.io (Acme uses Greenhouse). DMARC passed
    // for greenhouse.io, not acme.com -> we can't prove it's really Acme, but
    // it is NOT fake. Lower confidence, honest reason.
    const r = evaluateSender(
      "recruiter@acme.com",
      "mx; spf=pass; dkim=pass; dmarc=pass header.from=greenhouse.io",
    );
    expect(r.verified).toBe(false);
    // honest reason: names both domains, and explicitly NOT "fake"
    expect(r.reason).toMatch(/greenhouse\.io/i);
    expect(r.reason).toMatch(/acme\.com/i);
    expect(r.reason).toMatch(/not fake/i);
  });

  it("verified when the From domain genuinely matches its own aligned auth (e.g. a real greenhouse.io address)", () => {
    // If the From address IS the ATS domain and it aligns, that is a real,
    // verifiable claim about greenhouse.io — verified.
    const r = evaluateSender(
      "no-reply@greenhouse.io",
      "mx; spf=pass; dkim=pass; dmarc=pass header.from=greenhouse.io",
    );
    expect(r.verified).toBe(true);
  });

  it("NOT verified when the header is missing entirely", () => {
    const r = evaluateSender("x@y.com", null);
    expect(r.verified).toBe(false);
  });
});
