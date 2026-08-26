import { useCallback, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useInfiniteScroll } from "./useInfiniteScroll";
import { ExpandablePanel } from "./ExpandablePanel";

function domainOf(addr: string): string {
  // handles "Name <user@domain>" and "user@domain" — strips display name + <>
  const m = addr.match(/@([^>\s]+)/);
  return m ? m[1] : addr;
}

// The agent-activity surface. Held items (couldn't verify / sensitive request)
// rise to the top awaiting the user's call; the full handled history is a
// PAGINATED, SEARCHABLE log below.
export function Activity() {
  const held = useQuery(api.activity.held);
  // Optimistic: the held card vanishes the instant you click Approve/Dismiss,
  // before the server round-trips — no perceptible delay, no reload.
  const resolve = useMutation(api.activity.resolve).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.activity.held, {});
      if (current) {
        store.setQuery(
          api.activity.held,
          {},
          current.filter((e) => e._id !== args.id),
        );
      }
    },
  );
  const remember = useMutation(api.policy.rememberDecision);
  // After an Approve, offer to turn that one-off into a standing policy rule.
  // The card is gone (optimistic), so we surface a small prompt referencing the
  // item the user just approved.
  const [justApproved, setJustApproved] = useState<{
    id: Id<"events">;
    domain: string;
  } | null>(null);
  const [remembered, setRemembered] = useState(false);

  function approve(e: { _id: Id<"events">; fromAddress: string }) {
    void resolve({ id: e._id, decision: "approved" });
    setRemembered(false);
    setJustApproved({ id: e._id, domain: domainOf(e.fromAddress) });
  }
  async function doRemember() {
    if (!justApproved) return;
    await remember({ eventId: justApproved.id });
    setRemembered(true);
    setTimeout(() => setJustApproved(null), 2200);
  }
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
      {justApproved && (
        <div className="remember-prompt">
          {remembered ? (
            <span className="remember-done">
              ✓ Saved. Your agent will auto-approve this from{" "}
              <b>{justApproved.domain}</b> next time.
            </span>
          ) : (
            <>
              <span>
                Approved. Always allow this from <b>{justApproved.domain}</b>?
              </span>
              <span className="remember-actions">
                <button className="btn btn-primary" onClick={() => void doRemember()}>
                  Remember this
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setJustApproved(null)}
                >
                  Just this once
                </button>
              </span>
            </>
          )}
        </div>
      )}
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
                  onClick={() => approve(e)}
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
                  // The DECISION tells the WHOLE story: an auto-answer is one
                  // badge; a held item that you later resolved shows BOTH facts —
                  // it was "held", then "approved"/"dismissed" by you — so the
                  // history is legible and consistent with the live graph state.
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
                  return (
                    <tr key={e._id}>
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
