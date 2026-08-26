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

function Status({ state }: { state: string }) {
  const cls =
    state === "verified"
      ? "status-verified"
      : state === "mixed"
        ? "status-mixed"
        : "status-unverified";
  const label =
    state === "verified"
      ? "verified"
      : state === "mixed"
        ? "mixed"
        : "couldn’t verify";
  return (
    <span className={`status ${cls}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

// The pipeline — evidence that feeds the registry. Cards animate in as email
// lands and advance forward-only. Secondary to the registry above.
export function Board() {
  const apps = useQuery(api.board.myApplications);

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">My Pipeline</h2>
        <span className="section-note">
          Every card here is the evidence the registry is built from.
        </span>
      </div>
      {apps === undefined ? (
        <p className="muted">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="muted">
          No applications yet. When a recruiter emails your inbox, a card appears
          here on its own.
        </p>
      ) : (
        <div className="board">
          {STAGES.map((stage) => {
            const cards = apps.filter((a) => a.stage === stage.key);
            return (
              <div key={stage.key} className="column">
                <div className="column-title">
                  <span>{stage.label}</span>
                  <span>{cards.length || ""}</span>
                </div>
                {cards.map((a) => (
                  <div key={a._id} className="card">
                    <div className="card-company">{a.company}</div>
                    <div className="card-meta">
                      <Status state={a.trustState} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
