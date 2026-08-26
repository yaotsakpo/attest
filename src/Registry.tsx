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

// The trust registry — the star of the screen. A dense, sortable, factual table
// in the DNA of SSL Labs / crt.sh / Cloudflare Radar: grade box, monospace
// domain + score + last-seen, semantic color only on the grade, hairline rows.
export function Registry() {
  const domains = useQuery(api.registry.listDomains);
  const [sort, setSort] = useState<SortKey>("score");
  const [desc, setDesc] = useState(true);
  const now = Date.now();

  function header(key: SortKey, label: string, extra = "") {
    const active = sort === key;
    return (
      <th
        className={active ? "sorted " + extra : extra}
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
        a.verifiedCount + a.unverifiedCount - (b.verifiedCount + b.unverifiedCount);
    else d = a.lastSeen - b.lastSeen;
    return desc ? -d : d;
  });

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">Trust Registry</h2>
        <span className="section-note">
          Domains ranked by observed authenticated email, not search ranking. An
          agent can query this at <code>GET /registry/domains</code>.
        </span>
      </div>

      <div className="registry-wrap">
        <table className="registry">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th>Grade</th>
              {header("domain", "Domain")}
              {header("score", "Score", "num")}
              {header("sightings", "Verified / Total", "num")}
              {header("lastSeen", "Last seen", "num")}
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
                  No domains observed yet. When email arrives, each sending
                  domain earns a trust score here.
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
                    <td className="domain">{d.domain}</td>
                    <td className="num">{(d.trustScore * 100).toFixed(0)}</td>
                    <td className="num">
                      {d.verifiedCount} / {total}
                    </td>
                    <td className="num seen">{timeAgo(d.lastSeen, now)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
