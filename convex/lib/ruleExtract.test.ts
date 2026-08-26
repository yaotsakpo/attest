import { describe, it, expect } from "vitest";
import { ruleExtract } from "./ruleExtract";

describe("ruleExtract", () => {
  it("classifies an application confirmation", () => {
    const r = ruleExtract("Thanks for applying to Acme", "We received your application.", "acme.com");
    expect(r.eventType).toBe("confirmation");
    expect(r.company).toBe("Acme");
  });

  it("classifies an interview invite", () => {
    const r = ruleExtract("Next steps", "Are you free this week for a first screen?", "acme.com");
    expect(r.eventType).toBe("interview_invite");
  });

  it("classifies a rejection", () => {
    const r = ruleExtract("Update on your application", "Unfortunately we are not moving forward.", "acme.com");
    expect(r.eventType).toBe("rejection");
  });

  it("classifies an offer", () => {
    const r = ruleExtract("Great news", "We are pleased to offer you the role.", "acme.com");
    expect(r.eventType).toBe("offer");
  });

  it("falls back to recruiter_reply when nothing matches", () => {
    const r = ruleExtract("Hello", "Just checking in.", "acme.com");
    expect(r.eventType).toBe("recruiter_reply");
  });

  it("does NOT name a company for known ATS/mailer domains", () => {
    expect(ruleExtract("x", "y", "greenhouse.io").company).toBeNull();
    expect(ruleExtract("x", "y", "myworkday.com").company).toBeNull();
  });

  it("never invents a role without an LLM", () => {
    expect(ruleExtract("Interview for Senior Engineer", "role details", "acme.com").role).toBeNull();
  });
});
