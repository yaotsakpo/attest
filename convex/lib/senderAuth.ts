export interface SenderVerdict {
  verified: boolean;
  reason?: string;
}

function fromDomain(addr: string): string {
  const m = addr.trim().toLowerCase().match(/@([^>\s]+)/);
  return m ? m[1]! : "";
}

/**
 * Evaluate whether an inbound email's sender is authenticated.
 *
 * Two honest states only:
 *  - verified: DMARC passed AND the authenticated domain aligns with the
 *    domain in the From address (we can prove the mail came from that domain).
 *  - couldn't verify (with a reason): anything else.
 *
 * We NEVER return "fake" or "spoofed". Legitimate recruiting mail routed
 * through ATS platforms (Greenhouse, Lever, Workday, LinkedIn) frequently
 * fails alignment against the company's own domain — flagging that as fake
 * would be a worse failure than not checking, because it could make a user
 * ignore a genuine opportunity. Unverified means lower confidence, not fake.
 */
export function evaluateSender(
  fromAddress: string,
  authResultsHeader: string | null,
): SenderVerdict {
  if (!authResultsHeader) {
    return {
      verified: false,
      reason: "No Authentication-Results header on this message.",
    };
  }

  const h = authResultsHeader.toLowerCase();
  const dmarc = (h.match(/dmarc=(\w+)/) || [])[1] ?? null;
  const alignDomain = (h.match(/header\.from=([^\s;]+)/) || [])[1] ?? null;
  const senderDomain = fromDomain(fromAddress);

  if (dmarc !== "pass") {
    return {
      verified: false,
      reason: `DMARC did not pass (dmarc=${dmarc ?? "absent"}). Real recruiters sometimes send via tools that trip this — treat as lower confidence, not fake.`,
    };
  }

  if (alignDomain && senderDomain && alignDomain !== senderDomain) {
    return {
      verified: false,
      reason: `DMARC passed but the message authenticated as ${alignDomain}, not ${senderDomain} (common when a company sends recruiting mail through an ATS). Lower confidence, not fake.`,
    };
  }

  return { verified: true };
}
