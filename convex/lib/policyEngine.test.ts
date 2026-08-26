import { describe, expect, test } from "vitest";
import { evaluatePolicy, decideAction, type Rule } from "./policyEngine";

// A rule builder to keep tests terse; only the fields a test cares about are set.
function rule(partial: Partial<Rule> & Pick<Rule, "action" | "decision">): Rule {
  return { id: partial.id ?? "r1", ...partial } as Rule;
}

describe("evaluatePolicy", () => {
  test("empty ruleset returns null (caller falls back to default gate)", () => {
    expect(
      evaluatePolicy([], {
        action: "reply",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      }),
    ).toBeNull();
  });

  test("action match returns that rule's decision", () => {
    const rules = [rule({ action: "reply", decision: "allow" })];
    const r = evaluatePolicy(rules, {
      action: "reply",
      senderVerified: true,
      grade: "A",
      domain: "acme.com",
    });
    expect(r?.decision).toBe("allow");
  });

  test("action mismatch does not match (returns null)", () => {
    const rules = [rule({ action: "payment", decision: "allow" })];
    expect(
      evaluatePolicy(rules, {
        action: "reply",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      }),
    ).toBeNull();
  });

  test("amount at or below maxAmount allows; above falls through to null", () => {
    const rules = [
      rule({ action: "payment", maxAmount: 500, decision: "allow" }),
    ];
    const under = evaluatePolicy(rules, {
      action: "payment",
      amount: 500,
      senderVerified: true,
      grade: "A",
      domain: "acme.com",
    });
    expect(under?.decision).toBe("allow");

    const over = evaluatePolicy(rules, {
      action: "payment",
      amount: 501,
      senderVerified: true,
      grade: "A",
      domain: "acme.com",
    });
    expect(over).toBeNull(); // threshold fail is NOT a match — falls through
  });

  test("payment rule with maxAmount requires an amount to be present", () => {
    const rules = [
      rule({ action: "payment", maxAmount: 500, decision: "allow" }),
    ];
    const noAmount = evaluatePolicy(rules, {
      action: "payment",
      senderVerified: true,
      grade: "A",
      domain: "acme.com",
    });
    expect(noAmount).toBeNull();
  });

  test("requireVerified gates unverified senders", () => {
    const rules = [
      rule({ action: "reply", requireVerified: true, decision: "allow" }),
    ];
    expect(
      evaluatePolicy(rules, {
        action: "reply",
        senderVerified: false,
        grade: "A",
        domain: "acme.com",
      }),
    ).toBeNull();
    expect(
      evaluatePolicy(rules, {
        action: "reply",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("allow");
  });

  test("minGrade gates counterparts below the bar (A best)", () => {
    const rules = [
      rule({ action: "reply", minGrade: "B", decision: "allow" }),
    ];
    // grade C is below B → no match
    expect(
      evaluatePolicy(rules, {
        action: "reply",
        senderVerified: true,
        grade: "C",
        domain: "acme.com",
      }),
    ).toBeNull();
    // grade A meets B → match
    expect(
      evaluatePolicy(rules, {
        action: "reply",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("allow");
  });

  test("appliesTo scopes a rule to one domain", () => {
    const rules = [
      rule({ action: "payment", appliesTo: "acme.com", decision: "allow" }),
    ];
    expect(
      evaluatePolicy(rules, {
        action: "payment",
        amount: 9999,
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("allow");
    expect(
      evaluatePolicy(rules, {
        action: "payment",
        amount: 10,
        senderVerified: true,
        grade: "A",
        domain: "globex.com",
      }),
    ).toBeNull();
  });

  test("first match wins: a domain rule placed above a global rule overrides it", () => {
    const rules = [
      rule({
        id: "domain",
        action: "payment",
        appliesTo: "acme.com",
        decision: "allow",
      }),
      rule({ id: "global", action: "payment", decision: "hold" }),
    ];
    // acme.com hits the domain rule first → allow
    expect(
      evaluatePolicy(rules, {
        action: "payment",
        amount: 100,
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("allow");
    // another domain skips the domain rule, hits the global → hold
    expect(
      evaluatePolicy(rules, {
        action: "payment",
        amount: 100,
        senderVerified: true,
        grade: "A",
        domain: "globex.com",
      })?.decision,
    ).toBe("hold");
  });

  test("custom action matches by customLabel", () => {
    const rules = [
      rule({
        action: "custom",
        customLabel: "contract_signing",
        decision: "hold",
      }),
    ];
    expect(
      evaluatePolicy(rules, {
        action: "contract_signing",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("hold");
    // a different custom label doesn't match
    expect(
      evaluatePolicy(rules, {
        action: "data_export",
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      }),
    ).toBeNull();
  });

  test("deny is a valid decision and is returned on match", () => {
    const rules = [
      rule({ action: "payment", decision: "deny" }),
    ];
    expect(
      evaluatePolicy(rules, {
        action: "payment",
        amount: 10,
        senderVerified: true,
        grade: "A",
        domain: "acme.com",
      })?.decision,
    ).toBe("deny");
  });
});

describe("decideAction (policy first, default gate fallback)", () => {
  test("no rules → falls back to default gate: sensitive request holds", () => {
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: true,
      domain: "acme.com",
      text: "Please confirm your SSN.",
      rules: [],
    });
    expect(r.action).toBe("hold_for_approval");
  });

  test("no rules → verified non-sensitive auto-answers (default gate)", () => {
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: false,
      domain: "acme.com",
      text: "Are you available Tuesday?",
      rules: [],
    });
    expect(r.action).toBe("auto_answer");
  });

  test("a payment rule under threshold auto-answers even though default gate has no payment concept", () => {
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: false,
      domain: "acme.com",
      text: "Invoice attached, please remit $200.",
      rules: [
        {
          id: "pay",
          action: "payment",
          maxAmount: 500,
          requireVerified: true,
          decision: "allow",
        },
      ],
    });
    expect(r.action).toBe("auto_answer");
  });

  test("a payment over the user's threshold holds (falls through policy to default hold)", () => {
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: false,
      domain: "acme.com",
      text: "Please wire $5,000 today.",
      rules: [
        { id: "pay", action: "payment", maxAmount: 500, decision: "allow" },
      ],
    });
    expect(r.action).toBe("hold_for_approval");
  });

  test("sensitive info ALWAYS holds — no policy rule can auto-release it", () => {
    // Even with an explicit 'always allow share_info from acme.com' rule AND a
    // verified, A-grade sender, a request for sensitive PII must HOLD. This is
    // the containment guarantee: trust never unlocks releasing your SSN/bank —
    // so a COMPROMISED trusted domain still can't auto-extract it. A human
    // always approves sensitive disclosure.
    const rules = [
      {
        id: "s",
        action: "share_info" as const,
        appliesTo: "acme.com",
        requireVerified: true,
        decision: "allow" as const,
      },
    ];
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: true,
      domain: "acme.com",
      text: "Send your bank account number.",
      rules,
    });
    expect(r.action).toBe("hold_for_approval");

    // And of course it holds with no rule too.
    const noRule = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: true,
      domain: "acme.com",
      text: "Send your bank account number.",
      rules: [],
    });
    expect(noRule.action).toBe("hold_for_approval");
  });

  test("a deny decision holds (never auto-acts) and carries a reason", () => {
    const r = decideAction({
      grade: "A",
      senderVerified: true,
      sensitiveRequest: false,
      domain: "acme.com",
      text: "Please remit $50.",
      rules: [{ id: "pay", action: "payment", decision: "deny" }],
    });
    expect(r.action).toBe("hold_for_approval");
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
