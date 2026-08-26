import { useEffect, type ReactNode } from "react";

// A right-side slide-out drawer with terminal chrome. Reused by the Agent
// (policy) and Vault panels. When open, it shows ONLY its own children — nothing
// else. Esc + scrim click close it; body scroll locks while open.
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {open && <div className="drawer-scrim" onClick={onClose} />}
      <aside className={`drawer ${open ? "drawer-open" : ""}`} aria-hidden={!open}>
        <div className="term-bar">
          <span className="term-lights">
            <span className="term-light tl-r" />
            <span className="term-light tl-y" />
            <span className="term-light tl-g" />
          </span>
          <span className="term-path">{path}</span>
          <button className="term-expand" onClick={onClose}>
            ✕ close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
