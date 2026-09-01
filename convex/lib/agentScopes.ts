// Shared, pure normalization for the agent-identity scope SET. Used by the
// profile identity mutation. Kept pure so it's unit-testable without Convex.

export type AgentScope = "read_only" | "correspond" | "transact" | "administer";

export const AGENT_SCOPES: readonly AgentScope[] = [
  "read_only",
  "correspond",
  "transact",
  "administer",
];

// Normalize an arbitrary input into a valid, deduped, canonically-ordered scope
// set. Throws on any unknown value (the caller surfaces it). An empty array (or
// null/undefined) means "no identity declared" and returns [].
export function normalizeScopes(input: unknown): AgentScope[] {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new Error("scopes must be an array");
  }
  const seen = new Set<string>();
  for (const s of input) {
    if (typeof s !== "string" || !(AGENT_SCOPES as readonly string[]).includes(s)) {
      throw new Error(`unknown scope: ${String(s)}`);
    }
    seen.add(s);
  }
  // canonical order, not input order
  return AGENT_SCOPES.filter((s) => seen.has(s));
}
