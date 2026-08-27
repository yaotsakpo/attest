import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ExpandablePanel } from "./ExpandablePanel";
import { DecisionTrace } from "./DecisionTrace";
import { domainOf } from "./activityShared";

// "Needs you" — the live action surface. Items the agent HELD because it couldn't
// stand behind acting (couldn't verify the sender, or a sensitive/payment
// request). Approve or dismiss; on approve, offer to remember the decision as a
// standing policy rule so the agent handles it itself next time.
export function NeedsYou() {
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
  const [expanded, setExpanded] = useState(false);
  // After an Approve, offer to turn that one-off into a standing policy rule.
  // The card is gone (optimistic), so we surface a prompt referencing the item.
  const [justApproved, setJustApproved] = useState<{
    id: Id<"events">;
    domain: string;
  } | null>(null);
  const [remembered, setRemembered] = useState(false);
  const [remembering, setRemembering] = useState(false);
  const [traceId, setTraceId] = useState<Id<"events"> | null>(null);

  function approve(e: { _id: Id<"events">; fromAddress: string }) {
    void resolve({ id: e._id, decision: "approved" });
    setRemembered(false);
    setJustApproved({ id: e._id, domain: domainOf(e.fromAddress) });
  }
  async function doRemember() {
    if (!justApproved || remembering) return; // guard against double-fire
    setRemembering(true);
    try {
      await remember({ eventId: justApproved.id });
      setRemembered(true);
      setTimeout(() => setJustApproved(null), 2200);
    } finally {
      setRemembering(false);
    }
  }

  const count = held?.length ?? 0;

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ needs you ]</span>
        <h2 className="section-title">Held for your call</h2>
        <span className="section-note">
          Anything the agent couldn’t stand behind — an unverified sender, or a
          request for sensitive info or a payment — waits here for you.
        </span>
      </div>

      <ExpandablePanel
        path="agent@attest ~ needs-you"
        expanded={expanded}
        onToggle={setExpanded}
        tag={
          count > 0 ? (
            <span className="term-tag needs-count">{count} waiting</span>
          ) : undefined
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
                  <button
                    className="btn btn-primary"
                    onClick={() => void doRemember()}
                    disabled={remembering}
                  >
                    {remembering ? "Saving…" : "Remember this"}
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

        {held === undefined ? (
          <div className="needs-empty">Loading…</div>
        ) : count === 0 && !justApproved ? (
          <div className="needs-empty">
            Nothing needs you right now. The agent is handling verified
            counterparts on its own — anything it can’t stand behind lands here.
          </div>
        ) : (
          <div className="held-stack">
            {held.map((e) => (
              <div key={e._id} className="held">
                <div className="held-main">
                  <div className="held-top">
                    <span className="gate gate-hold">held for you</span>
                    {e.sensitiveRequest && (
                      <span className="sens-tag">sensitive request</span>
                    )}
                    <span className="held-from mono">
                      {domainOf(e.fromAddress)}
                    </span>
                  </div>
                  <div className="held-subject">
                    {e.subject || "(no subject)"}
                  </div>
                  <div className="held-reason">{e.gateReason}</div>
                  <button
                    className="trace-toggle"
                    onClick={() =>
                      setTraceId(traceId === e._id ? null : e._id)
                    }
                  >
                    {traceId === e._id ? "▾ hide reasoning" : "▸ why?"}
                  </button>
                  {traceId === e._id && <DecisionTrace ev={e} />}
                </div>
                <div className="held-actions">
                  <button className="btn btn-primary" onClick={() => approve(e)}>
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
      </ExpandablePanel>
    </section>
  );
}
