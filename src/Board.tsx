import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const STAGES = [
  { key: "applied", label: "Applied" },
  { key: "screen", label: "Screen" },
  { key: "technical", label: "Technical" },
  { key: "onsite", label: "Onsite" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
] as const;

function TrustBadge({ state }: { state: string }) {
  if (state === "verified")
    return <span className="badge badge-verified">✓ verified</span>;
  if (state === "mixed")
    return <span className="badge badge-mixed">~ mixed</span>;
  return <span className="badge badge-unverified">⚠ couldn’t verify</span>;
}

export function Board() {
  const apps = useQuery(api.board.myApplications);

  if (apps === undefined) return <p className="muted">Loading your pipeline…</p>;
  if (apps.length === 0)
    return (
      <p className="muted">
        No applications yet. When a recruiter emails your inbox, a card appears
        here on its own.
      </p>
    );

  return (
    <div className="board">
      {STAGES.map((stage) => {
        const cards = apps.filter((a) => a.stage === stage.key);
        return (
          <div key={stage.key} className="column">
            <h3 className="column-title">
              {stage.label} <span className="count">{cards.length}</span>
            </h3>
            {cards.map((a) => (
              <div key={a._id} className="card">
                <div className="card-company">{a.company}</div>
                {a.role && <div className="card-role">{a.role}</div>}
                <TrustBadge state={a.trustState} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
