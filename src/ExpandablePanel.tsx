import { useEffect, type ReactNode } from "react";

// A terminal-window panel with a titlebar (traffic lights + path) and an
// ⤢ expand control that opens the SAME content in a fullscreen modal. Used by
// every dashboard panel so the overview grid stays uniform + compact, and depth
// is one click away. Content is rendered once and reflowed by CSS in each mode.
export function ExpandablePanel({
  path,
  tag,
  expanded,
  onToggle,
  children,
}: {
  path: string;
  tag?: ReactNode;
  expanded: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onToggle(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded, onToggle]);

  const bar = (close: boolean) => (
    <div className="term-bar">
      <span className="term-lights">
        <span className="term-light tl-r" />
        <span className="term-light tl-y" />
        <span className="term-light tl-g" />
      </span>
      <span className="term-path">{path}</span>
      <button className="term-expand" onClick={() => onToggle(!close)}>
        {close ? "✕ close" : "⤢ expand"}
      </button>
      {!close && tag}
    </div>
  );

  return (
    <>
      <div className="term panel-term">
        {bar(false)}
        <div className="panel-term-body">{children}</div>
      </div>

      {expanded && (
        <div className="panel-overlay" onClick={() => onToggle(false)}>
          <div className="panel-modal" onClick={(e) => e.stopPropagation()}>
            {bar(true)}
            <div className="panel-modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
