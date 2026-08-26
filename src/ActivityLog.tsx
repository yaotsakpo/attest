import { Fragment, useCallback, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useInfiniteScroll } from "./useInfiniteScroll";
import { ExpandablePanel } from "./ExpandablePanel";
import { SkeletonRows } from "./SkeletonRows";
import { DecisionTrace } from "./DecisionTrace";
import { domainOf } from "./activityShared";

// The full handled history — every decision the agent made, PAGINATED and
// SEARCHABLE. A resolved hold shows BOTH facts (held → approved/dismissed) so
// the record reads completely and matches the live graph state.
export function ActivityLog() {
  const {
    results: logItems,
    status,
    loadMore,
  } = usePaginatedQuery(api.activity.log, {}, { initialNumItems: 25 });
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [traceId, setTraceId] = useState<Id<"events"> | null>(null);

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
        <span className="section-label">[ activity ]</span>
        <h2 className="section-title">What my agent did</h2>
        <span className="section-note">
          The record of every decision — auto-answered a verified counterpart, or
          held something for you and what you decided.
        </span>
      </div>

      <ExpandablePanel
        path="agent@attest ~ activity-log"
        expanded={expanded}
        onToggle={setExpanded}
        tag={
          <input
            className="table-search"
            placeholder="search sender or subject…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the activity log"
          />
        }
      >
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
                  // The DECISION tells the WHOLE story: an auto-answer is one
                  // badge; a held item you later resolved shows BOTH facts — it
                  // was "held", then "approved"/"dismissed" by you.
                  const resolvedBadge =
                    e.gateResolved === "approved"
                      ? { label: "approved", cls: "gate-auto" }
                      : e.gateResolved === "dismissed"
                        ? { label: "dismissed", cls: "gate-dismissed" }
                        : null;
                  const status = auto
                    ? "sent"
                    : e.gateResolved === "approved"
                      ? "you approved"
                      : e.gateResolved === "dismissed"
                        ? "you dismissed"
                        : "awaiting you";
                  const open = traceId === e._id;
                  return (
                    <Fragment key={e._id}>
                      <tr
                        className="log-row"
                        onClick={() => setTraceId(open ? null : e._id)}
                      >
                        <td>
                          {auto ? (
                            <span className="gate gate-auto">auto-answered</span>
                          ) : (
                            <span className="decision-pair">
                              <span className="gate gate-hold">held</span>
                              {resolvedBadge && (
                                <>
                                  <span className="decision-arrow">→</span>
                                  <span className={`gate ${resolvedBadge.cls}`}>
                                    {resolvedBadge.label}
                                  </span>
                                </>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="m">{domainOf(e.fromAddress)}</td>
                        <td>{e.subject || "(no subject)"}</td>
                        <td className="num dim">{status}</td>
                      </tr>
                      {open && (
                        <tr className="log-trace-row">
                          <td colSpan={4}>
                            <DecisionTrace ev={e} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
        {status === "LoadingMore" && (
          <div className="load-more muted">Loading…</div>
        )}
      </ExpandablePanel>
    </section>
  );
}
