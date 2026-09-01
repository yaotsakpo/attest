import { describe, it, expect } from "vitest";
import { normalizeScopes } from "./agentScopes";

describe("normalizeScopes", () => {
  it("empty / null / undefined => [] (no identity declared)", () => {
    expect(normalizeScopes([])).toEqual([]);
    expect(normalizeScopes(null)).toEqual([]);
    expect(normalizeScopes(undefined)).toEqual([]);
  });

  it("dedupes and returns canonical order (not input order)", () => {
    expect(normalizeScopes(["transact", "read_only", "read_only"])).toEqual([
      "read_only",
      "transact",
    ]);
  });

  it("keeps a full valid set", () => {
    expect(
      normalizeScopes(["administer", "correspond", "read_only", "transact"]),
    ).toEqual(["read_only", "correspond", "transact", "administer"]);
  });

  it("throws on an unknown scope", () => {
    expect(() => normalizeScopes(["correspond", "root"])).toThrow(/unknown scope/);
  });

  it("throws on a non-array", () => {
    expect(() => normalizeScopes("transact")).toThrow(/must be an array/);
  });
});
