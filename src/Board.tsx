import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { ExpandablePanel } from "./ExpandablePanel";

const PER_COLUMN = 5;

// Generic conversation states (was job stages) — the agent's threads with any
// counterpart, not just recruiters. Existing stage keys are reused/relabelled
// so no backend change is needed.
const STAGES = [
  { key: "applied", label: "New" },
  { key: "screen", label: "Active" },
  { key: "technical", label: "In progress" },
  { key: "onsite", label: "Needs you" },
  { key: "offer", label: "Resolved" },
  { key: "rejected", label: "Closed" },
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
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ threads ]</span>
        <h2 className="section-title">My conversations</h2>
        <span className="section-note">
          Every conversation your agent is handling with another agent or person.
          Each one taught the registry who to trust.
        </span>
      </div>
      <ExpandablePanel
        path="agent@jobcopilot ~ conversations"
        expanded={expanded}
        onToggle={setExpanded}
        tag={
          apps ? (
            <span className="term-tag">{apps.length} threads</span>
          ) : undefined
        }
      >
        {apps === undefined ? (
          <div className="board">
            {STAGES.map((stage) => (
              <div key={stage.key} className="column">
                <div className="column-title">
                  <span>{stage.label}</span>
                </div>
                <div className="column-cards">
                  <div className="card card-skeleton">
                    <span className="skeleton" />
                    <span className="skeleton" style={{ width: "45%" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="board-empty">
            No conversations yet. When someone emails your agent, a thread
            appears here on its own.
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
      </ExpandablePanel>
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
      <div className="column-cards">
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
    </div>
  );
}
