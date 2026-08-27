import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useDialog } from "./useDialog";
import { TrustGraph3D } from "./TrustGraph3D";
import type { GNode, GLink } from "./TrustGraph3D";

// The trust-transfer graph. Rendered as a real 3D node-sphere (see
// TrustGraph3D) — the agent at the centre, counterparts placed on a sphere,
// rotated + projected every frame so depth reads dimensionally, matching the
// landing hero. graphData is memoized (stable) and mapped to the 3D component's
// node/link shape; the detail panel + fullscreen modal wrap it.

type Kind = "agent" | "hub" | "company" | "direct";
type TNode = {
  id: string;
  label: string;
  kind: Kind;
  score: number;
  grade: string;
  verified: number;
  total: number;
  held: boolean;
  askedSensitive: boolean;
  heldSubject: string | null;
  reason: string | null;
  viaHub: string | null;
  inheritedTrust: boolean;
  hubCompanyCount: number;
  val: number;
  // mutated by the engine: x,y,vx,vy,fx,fy — never replace these objects
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};
type TLink = { source: string; target: string; kind: "agent" | "hub" | "held" };

export function TrustGraph() {
  const tg = useQuery(api.registry.trustGraph);
  const decisions = useQuery(api.registry.domainsWithDecisions);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeCacheRef = useRef<Map<string, TNode>>(new Map());
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<GNode | null>(null);

  // ---- stable graphData: reuse the SAME node objects across renders ----
  const graphData = useMemo(() => {
    const cache = nodeCacheRef.current;
    const nodes: TNode[] = [];
    const links: TLink[] = [];
    if (!tg) return { nodes, links };

    const dec = new Map((decisions ?? []).map((d) => [d.domain, d]));

    // agent node (persistent)
    let agent = cache.get("__agent__");
    if (!agent) {
      agent = {
        id: "__agent__",
        label: "your agent",
        kind: "agent",
        score: 1,
        grade: "A",
        verified: 0,
        total: 0,
        held: false,
        askedSensitive: false,
        heldSubject: null,
        reason: null,
        viaHub: null,
        inheritedTrust: false,
        hubCompanyCount: 0,
        val: 4,
      };
      cache.set("__agent__", agent);
    }
    nodes.push(agent);

    const seen = new Set<string>(["__agent__"]);
    for (const nd of tg.nodes) {
      const story = dec.get(nd.id);
      const held = !!story?.held;
      const kind: Kind =
        nd.kind === "hub" ? "hub" : nd.kind === "company" ? "company" : "direct";
      let node = cache.get(nd.id);
      if (!node) {
        node = { id: nd.id } as TNode;
        cache.set(nd.id, node);
      }
      // update fields in place (keep x/y/fx/fy the engine wrote)
      Object.assign(node, {
        label: nd.id,
        kind,
        score: nd.trustScore,
        grade: nd.grade,
        verified: nd.verifiedCount,
        total: nd.verifiedCount + nd.unverifiedCount,
        held,
        askedSensitive: !!story?.askedSensitive,
        heldSubject: story?.heldSubject ?? null,
        reason: story?.reason ?? null,
        viaHub: nd.viaHub,
        inheritedTrust: nd.inheritedTrust,
        hubCompanyCount: nd.hubCompanyCount,
        // hero node-sphere scale: small soft dots, not chunky balls. Hubs are
        // slightly larger than companies, everything stays delicate.
        val:
          kind === "hub"
            ? 3 + Math.min(nd.hubCompanyCount, 4) * 0.5
            : 1.6 + nd.trustScore * 1.8,
      });
      nodes.push(node);
      seen.add(nd.id);
      if (nd.connectsToAgent) {
        links.push({
          source: "__agent__",
          target: nd.id,
          kind: held ? "held" : "agent",
        });
      }
    }
    for (const e of tg.edges) {
      links.push({ source: e.source, target: e.target, kind: "hub" });
    }
    // prune cache entries no longer present
    for (const key of [...cache.keys()]) {
      if (key !== "__agent__" && !seen.has(key)) cache.delete(key);
    }
    return { nodes, links };
    // depend on the DATA identity from Convex (stable per reactive tick)
  }, [tg, decisions]);

  // container resize → only width/height change, never graphData
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // fullscreen modal behaves like every other overlay (esc / scroll-lock / focus
  // trap + return) via the shared hook.
  const closeExpanded = useCallback(() => setExpanded(false), []);
  const modalRef = useDialog<HTMLDivElement>(expanded, closeExpanded);


  // map the built graphData to the 3D component's node/link shape
  const g3d = useMemo(() => {
    const nodes: GNode[] = graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      score: n.score,
      grade: n.grade,
      verified: n.verified,
      total: n.total,
      held: n.held,
      askedSensitive: n.askedSensitive,
      heldSubject: n.heldSubject,
      reason: n.reason,
      viaHub: n.viaHub,
      inheritedTrust: n.inheritedTrust,
      hubCompanyCount: n.hubCompanyCount,
    }));
    const links: GLink[] = graphData.links.map((l) => ({
      source: l.source,
      target: l.target,
      kind: l.kind,
    }));
    return { nodes, links };
  }, [graphData]);

  const count = tg?.nodes.length ?? 0;

  const bar = (close: boolean) => (
    <div className="term-bar">
      <span className="term-lights">
        <span className="term-light tl-r" />
        <span className="term-light tl-y" />
        <span className="term-light tl-g" />
      </span>
      <span className="term-path">agent@attest ~ trust-map</span>
      <button className="term-expand" onClick={() => setExpanded(!close)}>
        {close ? "✕ close" : "⤢ expand"}
      </button>
      {!close && (
        <span className="term-tag">
          {count} node{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );

  const detail = selected && (
    <div
      className={`node-detail ${selected.held ? "node-detail-held" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="node-detail-domain">{selected.label}</div>
      <div className="node-detail-row">
        <span className={`grade grade-${selected.grade}`}>{selected.grade}</span>
        <span className="mono">
          {Math.round(selected.score * 100)} / 100 · {selected.verified}/
          {selected.total} authenticated
        </span>
      </div>
      <NodeReputation domain={selected.id} />
      {selected.inheritedTrust && selected.viaHub && selected.verified === 0 && (
        <div className="node-detail-note">
          own record ({selected.grade}) — trusted only via its hub, below
        </div>
      )}
      {selected.held ? (
        <>
          <div className="node-detail-verdict">
            {selected.askedSensitive
              ? "⚠ Held — asked for sensitive info"
              : "⚠ Held for your approval"}
          </div>
          {selected.heldSubject && (
            <div className="node-detail-subject mono">“{selected.heldSubject}”</div>
          )}
          <div className="node-detail-line">
            {selected.reason ??
              "The agent couldn’t verify this sender, so it released nothing."}
          </div>
        </>
      ) : selected.kind === "hub" ? (
        <div className="node-detail-line">
          Recruiting hub (ATS). {selected.hubCompanyCount} compan
          {selected.hubCompanyCount === 1 ? "y recruits" : "ies recruit"} through
          it. Because this hub is verified, the agent trusts the companies it
          vouches for.
        </div>
      ) : selected.inheritedTrust && selected.viaHub ? (
        <div className="node-detail-line">
          Vouched for <span className="mono">via {selected.viaHub}</span> — reaches
          through a hub the agent already trusts, so it inherits that trust
          (not earned on its own record yet).
        </div>
      ) : (
        <div className="node-detail-line">
          Verified sender — the agent answers on your behalf automatically.
        </div>
      )}
    </div>
  );

  return (
    <section className="section" data-tour="graph">
      <div className="section-head">
        <span className="section-label">[ trust map ]</span>
        <h2 className="section-title">Who vouches for whom</h2>
        <span className="section-note">
          Your agent’s live map of trusted counterparts. Verified hubs vouch for
          the companies that reach you through them; held senders sit apart.
        </span>
      </div>
      <div className="term">
        {bar(false)}
        <div className="graph-webgl" ref={containerRef}>
          {count === 0 ? (
            <p className="graph-empty">
              The map fills as your agent observes authenticated email.
            </p>
          ) : (
            <>
              <TrustGraph3D
                nodes={g3d.nodes}
                links={g3d.links}
                width={size.w}
                height={size.h}
                onSelect={setSelected}
              />
              <span className="graph-hint-inline">
                click a node · drag to orbit
              </span>
              {detail}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="graph-overlay" onClick={() => setExpanded(false)}>
          <div
            ref={modalRef}
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-label="trust map"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            {bar(true)}
            <ExpandedGraph
              nodes={g3d.nodes}
              links={g3d.links}
              onSelect={setSelected}
              detail={detail}
            />
            <div className="graph-hint">
              click a node for detail · drag to orbit · esc to close
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Fullscreen 3D graph — same data, its own (larger) sizing.
function ExpandedGraph({
  nodes,
  links,
  onSelect,
  detail,
}: {
  nodes: GNode[];
  links: GLink[];
  onSelect: (n: GNode | null) => void;
  detail: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState({ w: 900, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setS({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="graph-modal-body" ref={ref}>
      <TrustGraph3D
        nodes={nodes}
        links={links}
        width={s.w}
        height={s.h}
        onSelect={onSelect}
      />
      {detail}
    </div>
  );
}

// A counterpart's network-wide reputation standing (attestable events only:
// continuity confirmations / suspected takeovers). Shown in the node panel so
// the third trust axis is visible where you inspect a counterpart.
function NodeReputation({ domain }: { domain: string }) {
  const rep = useQuery(api.reputation.forDomain, { domain });
  if (!rep || rep.standing === "unknown") return null;
  const cls =
    rep.standing === "compromised" ? "rep-bad" : "rep-good";
  return (
    <div className={`node-rep ${cls}`}>
      <span className="node-rep-dot" />
      {rep.standing === "compromised" ? (
        <span>
          flagged — {rep.proven} proven takeover
          {rep.proven === 1 ? "" : "s"} across the network
        </span>
      ) : (
        <span>continuity confirmed {rep.confirmed}× · good standing</span>
      )}
    </div>
  );
}
