import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../convex/_generated/api";

// Trust-map on react-force-graph-2d. Dense constellation aesthetic (like
// emmanueltsakpo.click): faint white ambient nodes for atmosphere + the REAL
// trust nodes (your agent + observed domains) highlighted in emerald with
// labels. Monochrome white/gray + one emerald accent. Click a node → detail
// popover. Native drag / pan / zoom.

const EMERALD = "110, 231, 183"; // #6ee7b7 (portfolio accent)
const RED = "248, 113, 113"; // #f87171 — held / withheld (danger, used sparingly)

type GNode = {
  id: string;
  kind: "hub" | "hubnode" | "domain" | "ambient"; // hub = the agent; hubnode = an ATS hub
  label?: string;
  score?: number;
  grade?: string;
  verified?: number;
  total?: number;
  isHub?: boolean;
  companyKind?: "hub" | "company" | "direct";
  viaHub?: string | null;
  inheritedTrust?: boolean;
  hubCompanyCount?: number;
  held?: boolean;
  askedSensitive?: boolean;
  heldSubject?: string | null;
  reason?: string | null;
  val: number;
  bright: number;
};
type Selected = {
  domain: string;
  score: number;
  grade: string;
  verified: number;
  total: number;
  held: boolean;
  askedSensitive: boolean;
  heldSubject: string | null;
  reason: string | null;
  isAts: boolean;
  hubCompanyCount: number;
  viaHub: string | null;
  inheritedTrust: boolean;
} | null;

// deterministic pseudo-random so ambient layout is stable across renders
function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function TrustGraph() {
  const tg = useQuery(api.registry.trustGraph);
  const decisions = useQuery(api.registry.domainsWithDecisions);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Selected>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight || 300 }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const graph = useMemo(() => {
    const nodes: GNode[] = [];
    const links: {
      source: string;
      target: string;
      real: boolean;
      held?: boolean;
      hubEdge?: boolean;
    }[] = [];

    // ambient constellation (atmosphere) — faint white nodes, loosely linked
    const AMB = 46;
    for (let i = 0; i < AMB; i++) {
      nodes.push({
        id: `amb${i}`,
        kind: "ambient",
        val: 0.4 + seeded(i) * 1.2,
        bright: 0.12 + seeded(i + 99) * 0.28,
      });
    }
    for (let i = 0; i < AMB; i++) {
      const t = Math.floor(seeded(i + 7) * AMB);
      if (t !== i) links.push({ source: `amb${i}`, target: `amb${t}`, real: false });
    }

    const g = tg;
    if (g && g.nodes.length > 0) {
      // gate story per domain (held / sensitive), keyed by domain
      const dec = new Map(
        (decisions ?? []).map((d) => [d.domain, d]),
      );

      nodes.push({ id: "__agent__", kind: "hub", label: "your agent", val: 8, bright: 1 });
      links.push({ source: "__agent__", target: "amb0", real: false });

      for (const nd of g.nodes) {
        const story = dec.get(nd.id);
        const held = !!story?.held;
        // kind mapping: hub → its own tier; company (behind a hub) → tethered to
        // its hub; direct → straight off the agent.
        const kind: GNode["kind"] =
          nd.kind === "hub" ? "hubnode" : "domain";
        nodes.push({
          id: nd.id,
          kind,
          label: nd.id,
          score: nd.trustScore,
          grade: nd.grade,
          verified: nd.verifiedCount,
          total: nd.verifiedCount + nd.unverifiedCount,
          isHub: nd.kind === "hub",
          companyKind: nd.kind, // "hub" | "company" | "direct"
          viaHub: nd.viaHub,
          inheritedTrust: nd.inheritedTrust,
          hubCompanyCount: nd.hubCompanyCount,
          held,
          askedSensitive: !!story?.askedSensitive,
          heldSubject: story?.heldSubject ?? null,
          reason: story?.reason ?? null,
          val:
            nd.kind === "hub"
              ? 6 + Math.min(nd.hubCompanyCount, 4) * 1.2
              : 3 + nd.trustScore * 6,
          bright: nd.kind === "company" && nd.inheritedTrust ? 0.7 : 0.5 + nd.trustScore * 0.5,
        });
        // agent connects to hubs + direct domains (top-level)
        if (nd.connectsToAgent) {
          links.push({
            source: "__agent__",
            target: nd.id,
            real: true,
            held,
            hubEdge: nd.kind === "hub",
          });
        }
      }
      // hub → company edges
      for (const e of g.edges) {
        links.push({ source: e.source, target: e.target, real: true, hubEdge: true });
      }
    }
    return { nodes, links };
  }, [tg, decisions]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-90);
    fg.d3Force("link")?.distance((l: any) =>
      !l.real ? 40 : l.held ? 130 : l.hubEdge ? 55 : 75,
    );
  }, [graph, expanded]);

  const count = tg?.nodes.length ?? 0;

  const drawNode = (node: any, ctx: CanvasRenderingContext2D) => {
    const n = node as GNode & { x: number; y: number };
    if (n.kind === "ambient") {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.val, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${n.bright})`;
      ctx.fill();
      return;
    }
    const isAgent = n.kind === "hub";
    const isAts = n.kind === "hubnode";
    const held = n.kind === "domain" && n.held;
    // companies reached via a trusted hub read emerald (inherited trust) even
    // though their OWN grade is unproven — the graph shows the vouch.
    const trusted = isAgent || isAts || n.inheritedTrust || (!held && (n.score ?? 0) >= 0.55);
    const color = held ? RED : EMERALD;

    ctx.shadowColor = isAgent ? "rgba(255,255,255,0.9)" : `rgb(${color})`;
    ctx.shadowBlur = isAgent ? 16 : held ? 6 : 8 + n.bright * 10;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.val, 0, Math.PI * 2);
    if (isAgent) {
      ctx.fillStyle = "#f3f4f6";
    } else if (isAts) {
      // ATS hub: a hollow emerald ring (intermediary, distinct from companies)
      ctx.fillStyle = "rgba(11,13,18,1)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${EMERALD}, 0.95)`;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = held
        ? `rgba(${RED}, 0.85)`
        : trusted
          ? `rgba(${EMERALD}, ${0.55 + n.bright * 0.45})`
          : `rgba(156,163,175,${0.4 + n.bright * 0.3})`;
    }
    if (!isAts) ctx.fill();
    ctx.shadowBlur = 0;
    // a held sender that asked for sensitive info gets a warning ring
    if (held && n.askedSensitive) {
      ctx.strokeStyle = `rgba(${RED}, 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.val + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // label
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isAgent ? "rgba(243,244,246,0.95)" : "rgba(156,163,175,0.9)";
    ctx.fillText(n.label ?? "", n.x, n.y + n.val + 4);

    // sub-label (score / HELD / via-hub / hub company-count)
    ctx.font = `700 10px "JetBrains Mono", monospace`;
    if (isAts) {
      ctx.fillStyle = `rgba(${EMERALD}, 0.9)`;
      ctx.fillText(`ATS · ${n.hubCompanyCount ?? 0} cos`, n.x, n.y + n.val + 18);
    } else if (n.kind === "domain") {
      if (held) {
        ctx.fillStyle = `rgba(${RED}, 0.95)`;
        ctx.fillText("HELD", n.x, n.y + n.val + 18);
      } else if (n.inheritedTrust && n.viaHub) {
        ctx.fillStyle = `rgba(${EMERALD}, 0.85)`;
        ctx.fillText(`via ${n.viaHub}`, n.x, n.y + n.val + 18);
      } else {
        ctx.fillStyle = `rgba(${EMERALD}, ${0.7 + n.bright * 0.3})`;
        ctx.fillText(`${Math.round((n.score ?? 0) * 100)}`, n.x, n.y + n.val + 18);
      }
    }
  };

  const onClick = (node: any) => {
    const n = node as GNode;
    if (n.kind === "domain" || n.kind === "hubnode") {
      setSelected({
        domain: n.label ?? n.id,
        score: n.score ?? 0,
        grade: n.grade ?? "F",
        verified: n.verified ?? 0,
        total: n.total ?? 0,
        held: !!n.held,
        askedSensitive: !!n.askedSensitive,
        heldSubject: n.heldSubject ?? null,
        reason: n.reason ?? null,
        isAts: n.kind === "hubnode",
        hubCompanyCount: n.hubCompanyCount ?? 0,
        viaHub: n.viaHub ?? null,
        inheritedTrust: !!n.inheritedTrust,
      });
    } else {
      setSelected(null);
    }
  };

  const Graph = ({ w, h }: { w: number; h: number }) => (
    <ForceGraph2D
      ref={fgRef}
      width={w}
      height={h}
      graphData={graph}
      backgroundColor="rgba(0,0,0,0)"
      cooldownTicks={120}
      d3VelocityDecay={0.35}
      linkColor={(l: any) =>
        !l.real
          ? "rgba(255,255,255,0.06)"
          : l.held
            ? `rgba(${RED}, 0.35)`
            : `rgba(${EMERALD}, 0.35)`
      }
      linkWidth={(l: any) => (l.real ? 1.2 : 0.6)}
      linkDirectionalParticles={(l: any) => (l.real && !l.held ? 2 : 0)}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={() => `rgba(${EMERALD}, 0.9)`}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
        const n = node as GNode & { x: number; y: number };
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(n.val, 6), 0, Math.PI * 2);
        ctx.fill();
      }}
      onNodeClick={onClick}
      onBackgroundClick={() => setSelected(null)}
    />
  );

  const bar = (close: boolean) => (
    <div className="term-bar">
      <span className="term-lights">
        <span className="term-light tl-r" />
        <span className="term-light tl-y" />
        <span className="term-light tl-g" />
      </span>
      <span className="term-path">agent@jobcopilot ~ trust-map</span>
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
      <div className="node-detail-domain">{selected.domain}</div>
      <div className="node-detail-row">
        <span className={`grade grade-${selected.grade}`}>{selected.grade}</span>
        <span className="mono">
          {Math.round(selected.score * 100)} / 100 · {selected.verified}/
          {selected.total} authenticated
        </span>
      </div>
      {selected.held ? (
        <>
          <div className="node-detail-verdict">
            {selected.askedSensitive
              ? "⚠ Held — this sender asked for sensitive info"
              : "⚠ Held for your approval"}
          </div>
          {selected.heldSubject && (
            <div className="node-detail-subject mono">“{selected.heldSubject}”</div>
          )}
          <div className="node-detail-line">
            {selected.reason ??
              "The agent couldn’t verify this sender, so it released nothing and held the message for you."}
          </div>
        </>
      ) : selected.isAts ? (
        <div className="node-detail-line">
          Recruiting hub (ATS). {selected.hubCompanyCount} compan
          {selected.hubCompanyCount === 1 ? "y recruits" : "ies recruit"} through
          it. Because this hub is verified, the agent trusts the companies it
          vouches for.
        </div>
      ) : selected.inheritedTrust && selected.viaHub ? (
        <div className="node-detail-line">
          Verified <span className="mono">via {selected.viaHub}</span> — this
          company recruits through a hub the agent already trusts, so its mail is
          trusted even before it sends direct.
        </div>
      ) : (
        <div className="node-detail-line">
          Verified sender — the agent answers on your behalf automatically.
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="term">
        {bar(false)}
        <div className="graph-webgl" ref={wrapRef}>
          {count === 0 ? (
            <p className="graph-empty">
              The map fills as your agent observes authenticated email.
            </p>
          ) : (
            <>
              <Graph w={size.w} h={size.h} />
              <span className="graph-hint-inline">click a node · drag · scroll</span>
              {detail}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="graph-overlay" onClick={() => setExpanded(false)}>
          <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
            {bar(true)}
            <ModalBody graph={graph} drawNode={drawNode} onClick={onClick} setSelected={setSelected} detail={detail} />
            <div className="graph-hint">click a node for detail · drag · scroll to zoom · esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}

// Fullscreen graph body with its own ref/sizing (separate from the inline one).
function ModalBody({ graph, drawNode, onClick, setSelected, detail }: any) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fg = useRef<any>(null);
  const [s, setS] = useState({ w: 900, h: 560 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    fg.current?.d3Force("charge")?.strength(-80);
    fg.current?.d3Force("link")?.distance((l: any) => (l.real ? 90 : 50));
  }, []);
  const EM = "110, 231, 183";
  return (
    <div className="graph-modal-body" ref={ref}>
      <ForceGraph2D
        ref={fg}
        width={s.w}
        height={s.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={140}
        linkColor={(l: any) =>
          !l.real
            ? "rgba(255,255,255,0.06)"
            : l.held
              ? "rgba(248,113,113,0.35)"
              : `rgba(${EM}, 0.3)`
        }
        linkWidth={(l: any) => (l.real ? 1.2 : 0.6)}
        linkDirectionalParticles={(l: any) => (l.real && !l.held ? 2 : 0)}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => `rgba(${EM}, 0.9)`}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(node.val, 6), 0, Math.PI * 2);
          ctx.fill();
        }}
        onNodeClick={onClick}
        onBackgroundClick={() => setSelected(null)}
      />
      {detail}
    </div>
  );
}
