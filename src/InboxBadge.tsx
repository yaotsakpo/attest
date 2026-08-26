import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

// Shows the user's connected agent inbox address, or a "Connect inbox" button
// that provisions one via AgentMail. Mail sent to this address flows into the
// dashboard (and back out when the agent replies).
export function InboxBadge() {
  const inbox = useQuery(api.profiles.myInbox);
  const provision = useAction(api.agentmail.provisionInbox);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const res = await provision();
      if (!res) setErr("Couldn’t connect an inbox. Is AgentMail configured?");
    } catch {
      setErr("Couldn’t connect an inbox right now.");
    } finally {
      setBusy(false);
    }
  }

  if (inbox === undefined) return null;

  if (inbox) {
    return (
      <span className="inbox-badge" title="Your agent's email address">
        <span className="inbox-dot" />
        <span className="mono">{inbox.email}</span>
      </span>
    );
  }

  return (
    <span className="inbox-connect">
      <button className="btn btn-ghost" onClick={() => void connect()} disabled={busy}>
        {busy ? "Connecting…" : "Connect inbox"}
      </button>
      {err && <span className="inbox-err">{err}</span>}
    </span>
  );
}
