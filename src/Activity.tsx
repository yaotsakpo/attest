import { useCallback, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useInfiniteScroll } from "./useInfiniteScroll";
import { ExpandablePanel } from "./ExpandablePanel";

function domainOf(addr: string): string {
  const m = addr.match(/@(.+)$/);
  return m ? m[1] : addr;
}

// The agent-activity surface. Held items (couldn't verify / sensitive request)
// rise to the top awaiting the user's call; the full handled history is a
// PAGINATED, SEARCHABLE log below.
export function Activity() {
  const held = useQuery(api.activity.held);
  const resolve = useMutation(api.activity.resolve);
  const {
    results: logItems,
    status,
    loadMore,
  } = usePaginatedQuery(api.activity.log, {}, { initialNumItems: 25 });
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? logItems.filter(
        (e) =>
          domainOf(e.fromAddress).toLowerCase().includes(term) ||
          e.subject.toLowerCase().includes(term),
      )
    : logItems;

  // lazy-load more as the sentinel scrolls into view (disabled while searching,
  // since search filters the already-loaded set)
  const canLoad = status === "CanLoadMore" && !term;
  const loadNext = useCallback(() => loadMore(25), [loadMore]);
  const sentinel = useInfiniteScroll(canLoad, loadNext);

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ agent ]</span>
        <h2 className="section-title">What my agent did</h2>
        <span className="section-note">
          It replies to verified counterparts for you, and holds anything it
          can’t verify, especially requests for sensitive info like your SSN,
          bank details, or address.
        </span>
      </div>

      <ExpandablePanel
        path="agent@jobcopilot ~ inbox"
        expanded={expanded}
        onToggle={setExpanded}
        tag={
          <input
            className="table-search"
            placeholder="search sender or subject…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the agent inbox"
          />
        }
      >
      {held && held.length > 0 && (
        <div className="held-stack">
          {held.map((e) => (
            <div key={e._id} className="held">
              <div className="held-main">
                <div className="held-top">
                  <span className="gate gate-hold">held for you</span>
                  {e.sensitiveRequest && (
                    <span className="sens-tag">sensitive request</span>
                  )}
                  <span className="held-from mono">{domainOf(e.fromAddress)}</span>
                </div>
                <div className="held-subject">{e.subject || "(no subject)"}</div>
                <div className="held-reason">{e.gateReason}</div>
              </div>
              <div className="held-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void resolve({ id: e._id, decision: "approved" })}
                >
                  Approve
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    void resolve({ id: e._id, decision: "dismissed" })
                  }
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Sender</th>
                <th>Subject</th>
                <th className="num">Status</th>
              </tr>
            </thead>
            <tbody>
              {status === "LoadingFirstPage" ? (
                <SkeletonRows cols={4} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={4}>
                    {term
                      ? `No results for “${q}”.`
                      : "Nothing yet. When email arrives, the agent’s decision shows here."}
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const auto = e.gateAction === "auto_answer";
                  return (
                    <tr key={e._id}>
                      <td>
                        <span
                          className={`gate ${auto ? "gate-auto" : "gate-hold"}`}
                        >
                          {auto ? "auto-answered" : "held"}
                        </span>
                      </td>
                      <td className="m">{domainOf(e.fromAddress)}</td>
                      <td>{e.subject || "(no subject)"}</td>
                      <td className="num dim">
                        {e.gateResolved ?? (auto ? "sent" : "—")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {canLoad && (
          <>
            <div ref={sentinel} aria-hidden="true" />
            <button className="load-more" onClick={loadNext}>
              Load more
            </button>
          </>
        )}
        {status === "LoadingMore" && <div className="load-more muted">Loading…</div>}
      </ExpandablePanel>
    </section>
  );
}

export function SkeletonRows({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c}>
              <span className="skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
