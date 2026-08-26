import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

type SortKey = "score" | "domain" | "sightings" | "lastSeen";

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// The trust registry — the hero. Dense, sortable, factual: grade box, monospace
// domain/score/last-seen, semantic color only on the grade, hairline rows.
export function Registry() {
  const domains = useQuery(api.registry.listDomains);
  const [sort, setSort] = useState<SortKey>("score");
  const [desc, setDesc] = useState(true);
  const now = Date.now();

  function th(key: SortKey, label: string, extra = "") {
    const active = sort === key;
    return (
      <th
        className={`sortable ${active ? "sorted" : ""} ${extra}`}
        onClick={() => {
          if (active) setDesc(!desc);
          else {
            setSort(key);
            setDesc(true);
          }
        }}
      >
        {label}
        {active && <span className="arrow">{desc ? "↓" : "↑"}</span>}
      </th>
    );
  }

  const rows = (domains ?? []).slice().sort((a, b) => {
    let d = 0;
    if (sort === "score") d = a.trustScore - b.trustScore;
    else if (sort === "domain") d = a.domain.localeCompare(b.domain);
    else if (sort === "sightings")
      d =
        a.verifiedCount +
        a.unverifiedCount -
        (b.verifiedCount + b.unverifiedCount);
    else d = a.lastSeen - b.lastSeen;
    return desc ? -d : d;
  });

  return (
    <section className="section">
      <div className="section-head">
        <span className="section-label">[ registry ]</span>
        <h2 className="section-title">Domains my agent trusts</h2>
        <span className="section-note">
          Earned from observed authenticated email, not search ranking.
        </span>
      </div>

      <div className="term">
        <div className="term-bar">
          <span className="term-lights">
            <span className="term-light tl-r" />
            <span className="term-light tl-y" />
            <span className="term-light tl-g" />
          </span>
          <span className="term-path">$ GET /registry/domains</span>
          <span className="term-tag">live</span>
        </div>
        <div className="term-body table-scroll">
        <table className="data registry-cols">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>Grade</th>
              {th("domain", "Domain")}
              {th("score", "Score", "num")}
              {th("sightings", "Verified / Total", "num")}
              {th("lastSeen", "Last seen", "num")}
            </tr>
          </thead>
          <tbody>
            {domains === undefined ? (
              <tr>
                <td className="empty" colSpan={6}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="empty" colSpan={6}>
                  No domains observed yet. Each sender that emails your agent
                  earns a trust grade here.
                </td>
              </tr>
            ) : (
              rows.map((d, i) => {
                const total = d.verifiedCount + d.unverifiedCount;
                const g = gradeFor(
                  d.trustScore,
                  d.verifiedCount,
                  d.unverifiedCount,
                );
                const fresh = now - d.lastSeen < 4000;
                return (
                  <tr key={d._id} className={fresh ? "fresh" : ""}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      <span className={`grade grade-${g}`}>{g}</span>
                    </td>
                    <td className="m">{d.domain}</td>
                    <td className="num">
                      <span className="score-cell">
                        <span className="score-bar">
                          <span
                            className={`score-fill fill-${g}`}
                            style={{ width: `${Math.round(d.trustScore * 100)}%` }}
                          />
                        </span>
                        {(d.trustScore * 100).toFixed(0)}
                      </span>
                    </td>
                    <td className="num">
                      {d.verifiedCount} / {total}
                    </td>
                    <td className="num dim">{timeAgo(d.lastSeen, now)}</td>
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
