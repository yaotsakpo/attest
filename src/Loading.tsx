// One loading vocabulary for the non-table surfaces (drawers, inline panels).
// Tables use <SkeletonRows>; everywhere else uses this, so the app doesn't speak
// four different "Loading…" dialects.
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading-dot" />
      {label}
    </div>
  );
}
