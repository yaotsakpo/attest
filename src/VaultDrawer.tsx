import { type FormEvent, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { Drawer } from "./Drawer";
import { Loading } from "./Loading";

// The vault, in its OWN right-side drawer. When open it shows only the vault —
// what the agent knows about you and may share on your behalf. You mark which
// fields are sensitive; the agent won't auto-release a sensitive field to a
// counterpart it can't verify.
function maskValue(value: string, sensitive: boolean): string {
  if (!sensitive) return value;
  if (value.length <= 4) return "••••";
  return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

export function VaultDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const rows = useQuery(api.vault.list);
  const add = useMutation(api.vault.add);
  const setSensitive = useMutation(api.vault.setSensitive);
  const remove = useMutation(api.vault.remove);

  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sensitive, setSensitiveNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Run a vault mutation with real failure feedback — no more silent
  // fire-and-forget. Surfaces an error the user can see instead of the row just
  // not changing.
  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
    } catch {
      setErr("Something went wrong. Please try again.");
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await add({ label: label.trim(), value: value.trim(), sensitive });
      setLabel("");
      setValue("");
      setSensitiveNew(false);
    } catch {
      setErr("Couldn’t add that field. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onClose={onClose} path="agent@attest ~ vault">
      <p className="drawer-intro">
        What your agent knows about you and may share on your behalf. Flag what’s
        sensitive — the agent never auto-releases a sensitive field to a
        counterpart it can’t verify.
      </p>

      <form className="vault-drawer-form" onSubmit={onAdd}>
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
        <div className="vault-drawer-form-foot">
          <label className="check">
            <input
              type="checkbox"
              checked={sensitive}
              onChange={(e) => setSensitiveNew(e.target.checked)}
            />
            sensitive
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {err && <div className="drawer-err">{err}</div>}

      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="drawer-empty">
          Nothing yet. Add anything your agent might share on your behalf —
          availability, an account number, your address — and flag what’s
          sensitive.
        </div>
      ) : (
        <ul className="vault-list">
          {rows.map((r) => (
            <VaultItem
              key={r._id}
              row={r}
              onSetSensitive={(s) =>
                void run(() => setSensitive({ id: r._id, sensitive: s }))
              }
              onRemove={() => void run(() => remove({ id: r._id }))}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function VaultItem({
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
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setLabel(row.label);
    setValue(row.value);
    setReveal(!row.sensitive);
    setEditing(true);
  }
  async function save() {
    if (!label.trim() || saving) return;
    setSaving(true);
    try {
      await update({ id: row._id, label: label.trim(), value: value.trim() });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="vault-item vault-item-edit">
        <input
          className="vault-inline"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Edit field label"
        />
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
            >
              {reveal ? "hide" : "show"}
            </button>
          )}
        </div>
        <div className="vault-item-actions">
          <button
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={saving}
          >
            Save
          </button>
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="vault-item">
      <div className="vault-item-main">
        <span className="vault-item-label">{row.label}</span>
        <span className="vault-item-value mono">
          {maskValue(row.value, row.sensitive)}
        </span>
      </div>
      <div className="vault-item-side">
        <label className="check" title="Sensitive fields are held, not auto-shared">
          <input
            type="checkbox"
            checked={row.sensitive}
            onChange={(e) => onSetSensitive(e.target.checked)}
          />
          {row.sensitive ? <span className="sens-tag">held</span> : "sensitive"}
        </label>
        <div className="vault-item-actions">
          <button className="mini-btn" onClick={startEdit}>
            edit
          </button>
          <button className="mini-btn" onClick={onRemove}>
            remove
          </button>
        </div>
      </div>
    </li>
  );
}
