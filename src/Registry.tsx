import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// The agent's own trust map of the internet, earned from observed authenticated
// mail — not SEO. Grows live as email lands. This is the app's spine.
export function Registry() {
  const domains = useQuery(api.registry.listDomains);

  if (domains === undefined) return null;

  return (
    <aside className="registry">
      <h3 className="registry-title">Domains I’ve learned to trust</h3>
      <p className="registry-sub">
        Earned from real authenticated email, not search ranking. An agent can
        query this at <code>/registry/domains</code>.
      </p>
      {domains.length === 0 ? (
        <p className="muted">Nothing observed yet.</p>
      ) : (
        <ul className="registry-list">
          {domains.map((d) => (
            <li key={d._id} className="registry-row">
              <span className="registry-domain">{d.domain}</span>
              <span className="registry-bar">
                <span
                  className="registry-fill"
                  style={{ width: `${Math.round(d.trustScore * 100)}%` }}
                />
              </span>
              <span className="registry-score">
                {(d.trustScore * 100).toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
