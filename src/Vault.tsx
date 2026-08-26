import { type FormEvent, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// The vault: what the agent knows about you and may share with recruiters. You
// mark which fields are sensitive; the agent will not auto-release a sensitive
// field to a sender it can't verify — it holds it for your approval instead.
function maskValue(value: string, sensitive: boolean): string {
  if (!sensitive || value.length <= 4) return sensitive ? "••••" : value;
  return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

export function Vault() {
  const rows = useQuery(api.vault.list);
  const add = useMutation(api.vault.add);
  const setSensitive = useMutation(api.vault.setSensitive);
  const remove = useMutation(api.vault.remove);

  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sensitive, setSensitive2] = useState(false);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    await add({ label: label.trim(), value: value.trim(), sensitive });
    setLabel("");
    setValue("");
    setSensitive2(false);
  }

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ vault ]</span>
        <h2 className="section-title">What my agent can share</h2>
        <span className="section-note">
          You decide what’s sensitive. The agent never auto-releases a sensitive
          field to a counterpart it can’t verify.
        </span>
      </div>

      <div className="panel">
        <form className="vault-row-form" onSubmit={onAdd}>
          <input
            type="text"
            placeholder="Field (e.g. Availability, Bank account, SSN)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Field label"
          />
          <input
            type="text"
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Field value"
          />
          <label className="check">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitive2(e.target.checked)}
            />
            sensitive
          </label>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>

        {rows === undefined ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            Nothing yet. Add anything your agent might share on your behalf —
            availability, an account number, your address — and flag what’s
            sensitive.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Sensitive</th>
                  <th aria-label="actions"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>{r.label}</td>
                    <td className="m">{maskValue(r.value, r.sensitive)}</td>
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={r.sensitive}
                          onChange={(e) =>
                            void setSensitive({
                              id: r._id,
                              sensitive: e.target.checked,
                            })
                          }
                        />
                        {r.sensitive && <span className="sens-tag">held</span>}
                      </label>
                    </td>
                    <td className="num">
                      <button
                        className="btn btn-ghost"
                        onClick={() => void remove({ id: r._id })}
                        aria-label={`Remove ${r.label}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
