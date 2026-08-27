import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../convex/_generated/api";
import { useDialog } from "./useDialog";

// Stable, interactive trust-transfer graph. Built the correct react-force-graph
// way (per research): graphData is memoized with reused node objects so the sim
// never restarts on re-render; ALL interaction (pan/zoom/drag/click) is the
// library's built-in — no hand-rolled mouse handlers; nodes freeze on
// onEngineStop so nothing drifts. One persistent instance (fullscreen toggles a
// CSS class, does NOT mount a second graph).

const EMERALD = "110, 231, 183";
const RED = "248, 113, 113";
const GRAY = "156, 163, 175";

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
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeCacheRef = useRef<Map<string, TNode>>(new Map());
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<TNode | null>(null);

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
        val: 8,
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
        val:
          kind === "hub"
            ? 7 + Math.min(nd.hubCompanyCount, 4)
            : 4 + nd.trustScore * 5,
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

  // freeze nodes when the sim settles so nothing drifts, then fit to view
  const onEngineStop = useCallback(() => {
    for (const n of graphData.nodes) {
      n.fx = n.x;
      n.fy = n.y;
    }
    fgRef.current?.zoomToFit(400, 55);
  }, [graphData]);

  // when data changes, unfreeze so new nodes can settle, then it re-freezes
  useEffect(() => {
    for (const n of graphData.nodes) {
      // only unfreeze nodes with no position yet (new); keep settled ones fixed
      if (n.x === undefined) {
        n.fx = undefined;
        n.fy = undefined;
      }
    }
    fgRef.current?.d3ReheatSimulation?.();
  }, [graphData]);

  const onNodeClick = useCallback((node: any) => {
    setSelected(node.kind === "agent" ? null : (node as TNode));
  }, []);

  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
      const n = node as TNode;
      if (n.x === undefined || n.y === undefined) return;
      const isAgent = n.kind === "agent";
      const isHub = n.kind === "hub";
      // Trust EARNED on the node's own authenticated record (solid emerald) is
      // distinct from trust INHERITED because a hub vouches for it (muted, outline
      // only). A vouched-for company with an F own-grade must NOT look identical
      // to a directly-verified node — the color should match its panel.
      const earned = !n.held && n.score >= 0.55 && n.verified > 0;
      const inheritedOnly = !n.held && !earned && n.inheritedTrust;
      const col = n.held ? RED : EMERALD;
      const r = n.val;

      ctx.shadowColor = isAgent ? "rgba(255,255,255,0.9)" : `rgb(${col})`;
      ctx.shadowBlur = isAgent ? 14 : n.held ? 5 : 9;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (isAgent) {
        ctx.fillStyle = "#f3f4f6";
        ctx.fill();
      } else if (isHub) {
        ctx.fillStyle = "#0b0d12";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${EMERALD}, 0.95)`;
        ctx.stroke();
      } else if (inheritedOnly) {
        // Trusted only because a hub vouches: dark fill + emerald outline, so it
        // reads as "vouched for, not verified on its own".
        ctx.fillStyle = "#0b0d12";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = `rgba(${EMERALD}, 0.7)`;
        ctx.stroke();
      } else {
        ctx.fillStyle = n.held
          ? `rgba(${RED}, 0.85)`
          : earned
            ? `rgba(${EMERALD}, 0.85)`
            : `rgba(${GRAY}, 0.6)`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (n.held && n.askedSensitive) {
        ctx.strokeStyle = `rgba(${RED}, 0.9)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      const font = 11 / scale;
      ctx.font = `${font}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isAgent ? "rgba(243,244,246,0.95)" : "rgba(156,163,175,0.9)";
      ctx.fillText(n.label, n.x, n.y + r + 3 / scale);

      const sub =
        isHub
          ? `ATS · ${n.hubCompanyCount} cos`
          : n.held
            ? "HELD"
            : n.inheritedTrust && n.viaHub
              ? `via ${n.viaHub}`
              : n.kind === "direct"
                ? `${Math.round(n.score * 100)}`
                : "";
      if (sub) {
        ctx.font = `700 ${10 / scale}px "JetBrains Mono", monospace`;
        // inherited-only nodes get a MUTED emerald label, matching their muted
        // outline — distinct from the solid emerald of directly-earned trust.
        ctx.fillStyle = n.held
          ? `rgba(${RED}, 0.95)`
          : inheritedOnly
            ? `rgba(${EMERALD}, 0.55)`
            : `rgba(${EMERALD}, 0.9)`;
        ctx.fillText(sub, n.x, n.y + r + 3 / scale + font + 1);
      }
    },
    [],
  );

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

  const graphEl = (w: number, h: number) => (
    <ForceGraph2D
      ref={fgRef}
      width={w}
      height={h}
      graphData={graphData}
      backgroundColor="rgba(0,0,0,0)"
      cooldownTicks={100}
      cooldownTime={4000}
      warmupTicks={20}
      d3AlphaDecay={0.05}
      d3VelocityDecay={0.45}
      d3AlphaMin={0.01}
      onEngineStop={onEngineStop}
      linkColor={(l: any) =>
        l.kind === "held"
          ? `rgba(${RED}, 0.3)`
          : l.kind === "hub"
            ? `rgba(${EMERALD}, 0.25)`
            : `rgba(${EMERALD}, 0.35)`
      }
      linkWidth={1}
      linkDirectionalParticles={(l: any) => (l.kind === "held" ? 0 : 2)}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={() => `rgba(${EMERALD}, 0.9)`}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        if (node.x === undefined) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(node.val, 7), 0, Math.PI * 2);
        ctx.fill();
      }}
      onNodeClick={onNodeClick}
      onBackgroundClick={() => setSelected(null)}
    />
  );

  return (
    <section className="section">
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
              {graphEl(size.w, size.h)}
              <span className="graph-hint-inline">click a node · drag · scroll</span>
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
              graphData={graphData}
              drawNode={drawNode}
              onNodeClick={onNodeClick}
              onBg={() => setSelected(null)}
              detail={detail}
              onEngineStop={onEngineStop}
              fgRef={fgRef}
            />
            <div className="graph-hint">
              click a node for detail · drag · scroll to zoom · esc to close
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Fullscreen graph — its own sizing, but shares the SAME graphData (same node
// objects), so it doesn't restart the physics from scratch.
function ExpandedGraph({
  graphData,
  drawNode,
  onNodeClick,
  onBg,
  detail,
  onEngineStop,
  fgRef,
}: any) {
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
  const EM = "110, 231, 183",
    RD = "248, 113, 113";
  return (
    <div className="graph-modal-body" ref={ref}>
      <ForceGraph2D
        ref={fgRef}
        width={s.w}
        height={s.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={100}
        cooldownTime={4000}
        warmupTicks={20}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.45}
        d3AlphaMin={0.01}
        onEngineStop={onEngineStop}
        linkColor={(l: any) =>
          l.kind === "held"
            ? `rgba(${RD}, 0.3)`
            : `rgba(${EM}, 0.3)`
        }
        linkWidth={1}
        linkDirectionalParticles={(l: any) => (l.kind === "held" ? 0 : 2)}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor={() => `rgba(${EM}, 0.9)`}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          if (node.x === undefined) return;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(node.val, 7), 0, Math.PI * 2);
          ctx.fill();
        }}
        onNodeClick={onNodeClick}
        onBackgroundClick={onBg}
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
