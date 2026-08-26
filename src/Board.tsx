import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

const PER_COLUMN = 5;

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

// The pipeline — evidence the registry is built from. Cards animate in as email
// lands and advance forward-only.
export function Board() {
  const apps = useQuery(api.board.myApplications);

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ pipeline ]</span>
        <h2 className="section-title">My applications</h2>
        <span className="section-note">
          Each card is a real recruiter thread the registry learned from.
        </span>
      </div>
      {apps === undefined ? (
        <div className="board">
          {STAGES.map((stage) => (
            <div key={stage.key} className="column">
              <div className="column-title">
                <span>{stage.label}</span>
              </div>
              <div className="card card-skeleton">
                <span className="skeleton" />
                <span className="skeleton" style={{ width: "45%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="board-empty">
          No applications yet. When a recruiter emails your agent, a card appears
          here on its own.
        </div>
      ) : (
        <div className="board">
          {STAGES.map((stage) => (
            <Column
              key={stage.key}
              label={stage.label}
              cards={apps.filter((a) => a.stage === stage.key)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// One pipeline column — paginated: shows PER_COLUMN cards, "+N more" reveals the
// rest in batches, so a stage with 200 applications doesn't blow out the board.
function Column({
  label,
  cards,
}: {
  label: string;
  cards: Doc<"applications">[];
}) {
  const [shown, setShown] = useState(PER_COLUMN);
  const visible = cards.slice(0, shown);
  const remaining = cards.length - shown;
  return (
    <div className="column">
      <div className="column-title">
        <span>{label}</span>
        <span>{cards.length || ""}</span>
      </div>
      {visible.map((a) => (
        <div key={a._id} className="card">
          <div className="card-company">{a.company}</div>
          <div className="card-meta">
            <Status state={a.trustState} />
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <button
          className="column-more"
          onClick={() => setShown(shown + PER_COLUMN)}
        >
          +{remaining} more
        </button>
      )}
    </div>
  );
}
