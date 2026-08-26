import { describe, expect, test } from "vitest";
import { tierFor, isNetworkDomain, tierLabel, NETWORK_DOMAIN } from "./membership";

describe("tierFor", () => {
  test("network member → in_network (regardless of DMARC verdict)", () => {
    expect(
      tierFor({ domain: "x.agentmail.to", senderVerified: false, isNetworkMember: true }),
    ).toBe("in_network");
  });

  test("verified, not a member → verified", () => {
    expect(
      tierFor({ domain: "acme.com", senderVerified: true, isNetworkMember: false }),
    ).toBe("verified");
  });

  test("unverified, not a member → unverified", () => {
    expect(
      tierFor({ domain: "shady.example", senderVerified: false, isNetworkMember: false }),
    ).toBe("unverified");
  });
});

describe("isNetworkDomain", () => {
  test("the network domain is in-network", () => {
    expect(isNetworkDomain(NETWORK_DOMAIN)).toBe(true);
  });

  test("an arbitrary domain is not", () => {
    expect(isNetworkDomain("acme.com")).toBe(false);
  });

  test("an explicit member-domain set is honored", () => {
    const members = new Set(["partner.com"]);
    expect(isNetworkDomain("partner.com", members)).toBe(true);
    expect(isNetworkDomain("acme.com", members)).toBe(false);
  });
});

describe("tierLabel", () => {
  test("each tier has a distinct human label", () => {
    const labels = [
      tierLabel("in_network"),
      tierLabel("verified"),
      tierLabel("unverified"),
    ];
    expect(new Set(labels).size).toBe(3);
    expect(tierLabel("in_network")).toMatch(/network/i);
  });
});
