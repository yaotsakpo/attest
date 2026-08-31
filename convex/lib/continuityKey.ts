// Per-agent keying resolution (spec §7), NON-DESTRUCTIVE.
//
// Continuity and reputation rows are keyed by `counterpart` (domain) today.
// The identity layer lets them be keyed more finely by `agentId`. We migrate
// WITHOUT rewriting existing rows: a row may carry an optional `agentId`, and
// lookups resolve by agentId first, falling back to the domain key. An existing
// seed is therefore never touched (a lost seed forces re-establishment, which
// is the flow an attacker wants to trigger — spec §7).
//
// This module is the pure resolution logic, unit-testable without a database.
// The DB lookup in the pipeline uses the same order (by_user_and_agent, then
// by_user_and_counterpart).

export interface KeyedRow {
  counterpart: string; // domain (always present on legacy + new rows)
  agentId?: string; // finer key (present only on rows written post-identity)
}

// The lookup key for a message: prefer the agentId when the counterpart has a
// known agent identity, else the domain. Returns which field to query and the
// value, so callers hit the right index.
export function resolveLookupKey(
  domain: string,
  knownAgentId: string | null,
): { by: "agent"; agentId: string } | { by: "domain"; domain: string } {
  if (knownAgentId) return { by: "agent", agentId: knownAgentId };
  return { by: "domain", domain };
}

// Given the rows that could match (an agent-keyed candidate and/or a legacy
// domain-keyed candidate), pick the one that governs. The agent-keyed row wins
// when present (it is the finer, more specific record); otherwise the legacy
// domain row is used unchanged. This is what makes the migration non-destructive:
// a legacy row keeps governing until an agent-specific row exists for it.
export function pickGoverningRow<T extends KeyedRow>(
  agentRow: T | null,
  domainRow: T | null,
): T | null {
  return agentRow ?? domainRow ?? null;
}
