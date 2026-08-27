import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Drawer } from "./Drawer";
import { Loading } from "./Loading";

// Mirrors convex/lib/policyEngine.ts Rule (kept structural so the panel stays
// decoupled from generated types; the save mutation validates the shape).
type RuleAction = "reply" | "payment" | "share_info" | "schedule" | "custom";
type RuleDecision = "allow" | "hold" | "deny";
type Grade = "A" | "B" | "C" | "D" | "F";
type Rule = {
  id: string;
  action: RuleAction;
  customLabel?: string;
  appliesTo?: string;
  maxAmount?: number;
  requireVerified?: boolean;
  minGrade?: Grade;
  decision: RuleDecision;
};

const ACTIONS: { value: RuleAction; label: string }[] = [
  { value: "reply", label: "Reply / correspond" },
  { value: "payment", label: "Payment / invoice" },
  { value: "share_info", label: "Share sensitive info" },
  { value: "schedule", label: "Schedule / meet" },
  { value: "custom", label: "Custom…" },
];

// A tiny stable id without pulling in a dep.
let seq = 0;
function newId(): string {
  seq += 1;
  return `rule_${seq}_${Date.now().toString(36)}`;
}

function blankRule(): Rule {
  return { id: newId(), action: "reply", decision: "hold" };
}

// The right-side drawer where a user builds the structured ruleset their agent
// obeys. Free-form to configure, structured to store (no LLM). First-match-wins
// order matters, so rows can be reordered.
export function PolicyPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const saved = useQuery(api.policy.get);
  const save = useMutation(api.policy.save);
  const [rules, setRules] = useState<Rule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Hydrate the local editable copy when the server value first arrives (and
  // whenever we open fresh, if not mid-edit).
  useEffect(() => {
    if (saved && !dirty) setRules(saved as Rule[]);
  }, [saved, dirty]);

  function patch(id: string, next: Partial<Rule>) {
    setDirty(true);
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }
  function remove(id: string) {
    setDirty(true);
    setRules((rs) => rs.filter((r) => r.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setDirty(true);
    setRules((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = rs.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function add() {
    setDirty(true);
    setRules((rs) => [...rs, blankRule()]);
  }

  async function onSave() {
    // Strip empties: custom rules must carry a label; numbers coerced.
    const clean = rules.map((r) => ({
      ...r,
      customLabel:
        r.action === "custom" ? (r.customLabel ?? "").trim() || "custom" : undefined,
      appliesTo: r.appliesTo?.trim() || undefined,
    }));
    await save({ rules: clean });
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }

  return (
    <Drawer open={open} onClose={onClose} path="agent@attest ~ policy">
          <AgentConnection />
          <GovernancePanel />

          <p className="drawer-intro">
            Rules your agent follows before it acts for you. Checked top to
            bottom, first match wins. Anything no rule allows is held for you.
          </p>

          {rules.length === 0 ? (
            <div className="drawer-empty">
              No rules yet. Your agent holds anything it can’t stand behind.
              <br />
              Add a rule to let it act on its own inside limits you set.
            </div>
          ) : (
            <ol className="rule-list">
              {rules.map((r, i) => (
                <li key={r.id} className="rule-row">
                  <div className="rule-head">
                    <span className="rule-num">{i + 1}</span>
                    <select
                      className="rule-select"
                      value={r.action}
                      onChange={(e) =>
                        patch(r.id, { action: e.target.value as RuleAction })
                      }
                      aria-label="Action"
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>

                    <div className="rule-decision" role="group" aria-label="Decision">
                      {(["allow", "hold", "deny"] as RuleDecision[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`seg seg-${d} ${
                            r.decision === d ? "seg-on" : ""
                          }`}
                          onClick={() => patch(r.id, { decision: d })}
                        >
                          {d}
                        </button>
                      ))}
                    </div>

                    <div className="rule-reorder">
                      <button
                        className="mini"
                        onClick={() => move(r.id, -1)}
                        disabled={i === 0}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className="mini"
                        onClick={() => move(r.id, 1)}
                        disabled={i === rules.length - 1}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className="mini mini-x"
                        onClick={() => remove(r.id)}
                        aria-label="Remove rule"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="rule-conds">
                    {r.action === "custom" && (
                      <label className="cond">
                        <span>Label</span>
                        <input
                          className="cond-input"
                          placeholder="e.g. contract_signing"
                          value={r.customLabel ?? ""}
                          onChange={(e) =>
                            patch(r.id, { customLabel: e.target.value })
                          }
                        />
                      </label>
                    )}

                    {r.action === "payment" && (
                      <label className="cond">
                        <span>Max $</span>
                        <input
                          className="cond-input cond-num"
                          type="number"
                          min={0}
                          placeholder="500"
                          value={r.maxAmount ?? ""}
                          onChange={(e) =>
                            patch(r.id, {
                              maxAmount:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    )}

                    <label className="cond">
                      <span>Only domain</span>
                      <input
                        className="cond-input"
                        placeholder="any (e.g. acme.com)"
                        value={r.appliesTo ?? ""}
                        onChange={(e) => patch(r.id, { appliesTo: e.target.value })}
                      />
                    </label>

                    <label className="cond">
                      <span>Min grade</span>
                      <select
                        className="cond-input"
                        value={r.minGrade ?? ""}
                        onChange={(e) =>
                          patch(r.id, {
                            minGrade: (e.target.value || undefined) as
                              | Grade
                              | undefined,
                          })
                        }
                      >
                        <option value="">any</option>
                        {(["A", "B", "C", "D"] as Grade[]).map((g) => (
                          <option key={g} value={g}>
                            {g}+
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="cond cond-check">
                      <input
                        type="checkbox"
                        checked={r.requireVerified ?? false}
                        onChange={(e) =>
                          patch(r.id, { requireVerified: e.target.checked })
                        }
                      />
                      <span>Verified only</span>
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <button className="load-more drawer-add" onClick={add}>
            + Add rule
          </button>

        <div className="drawer-foot">
          <span className="drawer-hint">
            {savedFlash ? "Saved. Your agent uses these now." : dirty ? "Unsaved changes" : " "}
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void onSave()}
            disabled={!dirty}
          >
            Save policy
          </button>
        </div>
    </Drawer>
  );
}

// The agent's email identity, folded into the top of the drawer next to the
// rules that govern it. Shows the inbox address (Attest auto-provisions it — no
// key to paste), and a non-destructive "re-link" that re-registers the inbound
// webhook if mail ever stopped flowing. Reconnect never mints a new inbox, which
// would orphan your address and its history.
function AgentConnection() {
  const inbox = useQuery(api.profiles.myInbox);
  const provision = useAction(api.agentmail.provisionInbox);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function connect() {
    setBusy(true);
    setNote(null);
    try {
      const res = await provision();
      if (!res) setNote("Couldn’t connect — is AgentMail configured?");
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
    <div className="agent-conn">
      <div className="agent-conn-head">
        <span className="agent-conn-label">Agent inbox</span>
        {inbox && (
          <span className="status status-verified">
            <span className="dot" /> connected
          </span>
        )}
      </div>

      {inbox === undefined ? (
        <Loading />
      ) : inbox ? (
        <>
          <div className="agent-conn-addr">
            <span className="inbox-dot" />
            <span className="mono">{inbox.email}</span>
            <button className="mini-btn" onClick={copy}>
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <p className="agent-conn-hint">
            This is your agent’s address. Send email here — or forward your real
            mail to it — and it appears in your dashboard in seconds.
          </p>
        </>
      ) : (
        <>
          <button
            className="btn btn-primary"
            onClick={() => void connect()}
            disabled={busy}
          >
            {busy ? "Connecting…" : "Connect inbox"}
          </button>
          <p className="agent-conn-hint">
            Attest gives your agent its own email address — no setup, nothing to
            paste. Click to create it.
          </p>
        </>
      )}

      {note && <div className="agent-conn-note">{note}</div>}
    </div>
  );
}

// The governance commitment status — makes the policy-commitment mechanism
// VISIBLE: the current committed version + a short fingerprint. A counterpart
// can be shown this to confirm governance is intact; a version bump right before
// an unusual request is the takeover tell. The RULES are never shown, only that
// they're committed and at which version.
function GovernancePanel() {
  const chain = useQuery(api.policyCommit.chain);
  if (!chain || chain.length === 0) return null;
  const latest = chain[chain.length - 1];
  return (
    <div className="gov-panel">
      <span className="gov-k">governance</span>
      <span className="gov-v">
        committed · v{latest.version}
        <span className="gov-fp mono" title="commitment fingerprint">
          {latest.commit.slice(0, 12)}
        </span>
      </span>
      <p className="gov-hint">
        Your policy is committed, not published — a counterpart can verify it
        hasn’t silently changed without seeing a single rule. A version bump is a
        visible event.
      </p>
    </div>
  );
}
