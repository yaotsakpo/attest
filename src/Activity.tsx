import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

function domainOf(addr: string): string {
  const m = addr.match(/@(.+)$/);
  return m ? m[1] : addr;
}

// The agent-activity feed — the dramatic surface. Held items (couldn't verify /
// sensitive request) rise to the top awaiting the user's call; auto-answered
// items read as a calm log. This is where "the agent won't release your info to
// a sender it can't verify" becomes visible.
export function Activity() {
  const feed = useQuery(api.activity.feed);
  const resolve = useMutation(api.activity.resolve);

  if (feed === undefined) return null;

  const held = feed.filter(
    (e) => e.gateAction === "hold_for_approval" && !e.gateResolved,
  );
  const done = feed.filter(
    (e) => e.gateAction !== "hold_for_approval" || e.gateResolved,
  );

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ agent ]</span>
        <h2 className="section-title">What my agent did</h2>
        <span className="section-note">
          It answers verified senders for you, and holds anything it can’t
          verify, especially requests for sensitive info.
        </span>
      </div>

      {held.length > 0 && (
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
                  onClick={() =>
                    void resolve({ id: e._id, decision: "approved" })
                  }
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

      <div className="term">
        <div className="term-bar">
          <span className="term-lights">
            <span className="term-light tl-r" />
            <span className="term-light tl-y" />
            <span className="term-light tl-g" />
          </span>
          <span className="term-path">agent@jobcopilot ~ inbox</span>
          <span className="term-tag">{done.length} handled</span>
        </div>
        <div className="term-body table-scroll">
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
            {done.length === 0 && held.length === 0 ? (
              <tr>
                <td className="empty" colSpan={4}>
                  Nothing yet. When email arrives, the agent’s decision shows
                  here.
                </td>
              </tr>
            ) : (
              done.map((e) => {
                const auto = e.gateAction === "auto_answer";
                return (
                  <tr key={e._id}>
                    <td>
                      <span className={`gate ${auto ? "gate-auto" : "gate-hold"}`}>
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
      </div>
    </section>
  );
}
