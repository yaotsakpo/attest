import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

// The agent's settings surface. Where you connect your agent to its email
// identity and see the address the whole system runs on. Deliberately explicit:
// the header badge is easy to miss, so the connection lives here in full.
export function Settings() {
  const inbox = useQuery(api.profiles.myInbox);
  const provision = useAction(api.agentmail.provisionInbox);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  function copy() {
    if (!inbox) return;
    void navigator.clipboard.writeText(inbox.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="section settings">
      <div className="section-head">
        <span className="section-label">[ settings ]</span>
        <h2 className="section-title">Your agent</h2>
        <span className="section-note">
          Your agent talks to the world through its own email address. Mail sent
          here flows into the dashboard, and your agent replies from it.
        </span>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <span className="settings-key">Agent inbox</span>
          {inbox === undefined ? (
            <span className="settings-val dim">Loading…</span>
          ) : inbox ? (
            <span className="settings-val">
              <span className="inbox-dot" />
              <span className="mono">{inbox.email}</span>
              <button className="mini-btn" onClick={copy}>
                {copied ? "copied" : "copy"}
              </button>
            </span>
          ) : (
            <span className="settings-val">
              <button
                className="btn btn-primary"
                onClick={() => void connect()}
                disabled={busy}
              >
                {busy ? "Connecting…" : "Connect inbox"}
              </button>
            </span>
          )}
        </div>

        <div className="settings-row">
          <span className="settings-key">Status</span>
          <span className="settings-val">
            {inbox ? (
              <span className="status status-verified">
                <span className="dot" /> connected
              </span>
            ) : (
              <span className="status status-unverified">
                <span className="dot" /> not connected
              </span>
            )}
          </span>
        </div>

        {err && <div className="settings-err">{err}</div>}

        <p className="settings-hint">
          Warden provisions this inbox for you under its own AgentMail account —
          there’s no key to paste. Send a test email to the address above and it
          appears in your dashboard within seconds.
        </p>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <span className="settings-key">Policy</span>
          <span className="settings-val dim">
            Set the rules your agent follows in the <b>Policy</b> panel (top
            right). Anything no rule allows is held for your approval.
          </span>
        </div>
      </div>
    </section>
  );
}
