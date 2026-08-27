import { type ReactNode } from "react";
import { useDialog } from "./useDialog";

// A right-side slide-out drawer with terminal chrome. Reused by the Agent
// (policy), Vault, and Continuity panels. When open, it shows ONLY its own
// children. Full modal-dialog behavior (Esc, scroll-lock, focus trap + return)
// comes from useDialog — one source so every overlay behaves identically.
export function Drawer({
  open,
  onClose,
  path,
  children,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  children: ReactNode;
}) {
  const panelRef = useDialog<HTMLElement>(open, onClose);

  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <aside
        ref={panelRef}
        className={`drawer ${open ? "drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={path}
        aria-hidden={!open}
        tabIndex={-1}
      >
        <div className="term-bar">
          <span className="term-lights">
            <span className="term-light tl-r" />
            <span className="term-light tl-y" />
            <span className="term-light tl-g" />
          </span>
          <span className="term-path">{path}</span>
          <button className="term-expand" onClick={onClose} aria-label="Close">
            ✕ close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
