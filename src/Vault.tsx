import { type FormEvent, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

// The vault: what the agent knows about you and may share on your behalf. You
// mark which fields are sensitive; the agent won't auto-release a sensitive
// field to a counterpart it can't verify. Values are masked at rest; editing a
// row reveals the value so you can change it, then it re-masks on save.
function maskValue(value: string, sensitive: boolean): string {
  if (!sensitive) return value;
  if (value.length <= 4) return "••••";
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
                  <VaultRow
                    key={r._id}
                    row={r}
                    onSetSensitive={(s) =>
                      void setSensitive({ id: r._id, sensitive: s })
                    }
                    onRemove={() => void remove({ id: r._id })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function VaultRow({
  row,
  onSetSensitive,
  onRemove,
}: {
  row: Doc<"vault">;
  onSetSensitive: (s: boolean) => void;
  onRemove: () => void;
}) {
  const update = useMutation(api.vault.update);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [value, setValue] = useState(row.value);
  const [reveal, setReveal] = useState(false);

  function startEdit() {
    setLabel(row.label);
    setValue(row.value); // real value revealed for editing
    setReveal(!row.sensitive); // sensitive starts hidden, toggle to reveal
    setEditing(true);
  }
  async function save() {
    if (!label.trim()) return;
    await update({ id: row._id, label: label.trim(), value: value.trim() });
    setEditing(false);
  }
  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <tr>
        <td>
          <input
            className="vault-inline"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label="Edit field label"
          />
        </td>
        <td>
          <div className="vault-edit-value">
            <input
              className="vault-inline mono"
              type={row.sensitive && !reveal ? "password" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Edit field value"
            />
            {row.sensitive && (
              <button
                type="button"
                className="reveal-btn"
                onClick={() => setReveal(!reveal)}
                aria-label={reveal ? "Hide value" : "Reveal value"}
              >
                {reveal ? "hide" : "show"}
              </button>
            )}
          </div>
        </td>
        <td>
          {row.sensitive && <span className="sens-tag">held</span>}
        </td>
        <td className="num">
          <div className="vault-actions">
            <button className="btn btn-primary" onClick={() => void save()}>
              Save
            </button>
            <button className="btn btn-ghost" onClick={cancel}>
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{row.label}</td>
      <td className="m">{maskValue(row.value, row.sensitive)}</td>
      <td>
        <label className="check">
          <input
            type="checkbox"
            checked={row.sensitive}
            onChange={(e) => onSetSensitive(e.target.checked)}
          />
          {row.sensitive && <span className="sens-tag">held</span>}
        </label>
      </td>
      <td className="num">
        <div className="vault-actions">
          <button
            className="btn btn-ghost"
            onClick={startEdit}
            aria-label={`Edit ${row.label}`}
          >
            Edit
          </button>
          <button
            className="btn btn-ghost"
            onClick={onRemove}
            aria-label={`Remove ${row.label}`}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
