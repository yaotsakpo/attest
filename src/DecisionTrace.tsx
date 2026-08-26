// The DECISION TRACE — the protocol made visible. For any message the agent
// handled, this shows HOW it decided, not just the outcome: what the message
// claimed, where authority actually came from (the authenticated channel vs. the
// message content), what the agent was being asked to do, and the deterministic
// verdict. This is the substance behind the dashboard — the reason a spoofed
// counterpart can't win by sounding convincing. The classification is computed
// server-side (same as the gate), so the raw email body never reaches the client.

type TraceEvent = {
  fromAddress: string;
  senderVerified: boolean;
  gateAction: "auto_answer" | "hold_for_approval" | null;
  gateReason: string | null;
  registryDomain?: string | null;
  requestedAction: string;
  requestedAmount: number | null;
  tier: "in_network" | "verified" | "unverified";
};

const TIER_LABEL: Record<string, string> = {
  in_network: "in Attest's network — identity held by Attest",
  verified: "verified, outside the network — earns trust by behavior",
  unverified: "couldn't verify — held by default",
};

const ACTION_LABEL: Record<string, string> = {
  payment: "make a payment",
  share_info: "share sensitive info",
  reply: "reply",
};

export function DecisionTrace({ ev }: { ev: TraceEvent }) {
  const domain = ev.registryDomain ?? ev.fromAddress.split("@")[1] ?? "";
  const action = ev.requestedAction;
  const amount = ev.requestedAmount ?? undefined;
  const asked = ACTION_LABEL[action] ?? action;
  const held = ev.gateAction === "hold_for_approval";

  return (
    <div className="trace">
      <div className="trace-step">
        <span className="trace-k">claim</span>
        <span className="trace-v">
          message asks to <b>{asked}</b>
          {action === "payment" && amount !== undefined
            ? ` ($${amount.toLocaleString()})`
            : ""}
        </span>
      </div>

      <div className="trace-step">
        <span className="trace-k">channel</span>
        <span className="trace-v">
          {ev.senderVerified ? (
            <>
              authority from the <b>authenticated channel</b> — {domain}{" "}
              authenticated (DMARC-aligned)
            </>
          ) : (
            <>
              <b className="trace-warn">not authenticated</b> — authority is only
              asserted in the message content, not the channel
            </>
          )}
        </span>
      </div>

      <div className="trace-step">
        <span className="trace-k">tier</span>
        <span className="trace-v">{TIER_LABEL[ev.tier] ?? ev.tier}</span>
      </div>

      <div className="trace-step">
        <span className="trace-k">rule</span>
        <span className="trace-v">
          {ev.gateReason ?? "default gate applied"}
        </span>
      </div>

      <div className="trace-step">
        <span className="trace-k">verdict</span>
        <span className="trace-v">
          <span className={`trace-verdict ${held ? "is-held" : "is-auto"}`}>
            {held ? "HOLD" : "ALLOW"}
          </span>
          <span className="trace-det">deterministic · 0 LLM calls</span>
        </span>
      </div>
    </div>
  );
}
