// Small helpers shared by the two agent-activity panels (NeedsYou + ActivityLog),
// kept here so neither panel imports from the other.

export function domainOf(addr: string): string {
  // handles "Name <user@domain>" and "user@domain" — strips display name + <>
  const m = addr.match(/@([^>\s]+)/);
  return m ? m[1] : addr;
}
