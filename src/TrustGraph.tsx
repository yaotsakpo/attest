import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

// A real force-directed trust graph (react-force-graph / d3-force).
// Monochrome brand palette: emerald + white + gray on #0b0d12. Trust is encoded
// by node SIZE and BRIGHTNESS (bigger/brighter = more trusted) rather than hue,
// the convention elegant data tools use. Categorical red/F meaning lives in the
// registry table where it belongs. Expandable to fullscreen; pan + zoom.

const EMERALD = "52, 211, 153"; // rgb of #34d399
const HUB = "#f3f4f6";

type GNode = {
  id: string;
  label: string;
  kind: "hub" | "domain";
  score: number;
  grade: string;
  val: number;
  bright: number; // 0.35..1 → node/label opacity from trust
};
type GLink = { source: string; target: string };

export function TrustGraph() {
  const domains = useQuery(api.registry.listDomains);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight || 300 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // lock background scroll while the fullscreen overlay is open
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
    const nodes: GNode[] = [
      {
        id: "__hub__",
        label: "your agent",
        kind: "hub",
        score: 1,
        grade: "A",
        val: 6,
        bright: 1,
      },
    ];
    const links: GLink[] = [];
    for (const d of domains ?? []) {
      const g = gradeFor(d.trustScore, d.verifiedCount, d.unverifiedCount);
      nodes.push({
        id: d.domain,
        label: d.domain,
        kind: "domain",
        score: d.trustScore,
        grade: g,
        val: 2 + d.trustScore * 6, // size = trust
        bright: 0.35 + d.trustScore * 0.65, // brightness = trust
      });
      links.push({ source: "__hub__", target: d.domain });
    }
    return { nodes, links };
  }, [domains]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-160);
    fg.d3Force("link")?.distance(80);
  }, [graph, expanded]);

  const count = domains?.length ?? 0;

  const draw = (node: any, ctx: CanvasRenderingContext2D, scale: number) => {
    const n = node as GNode & { x: number; y: number };
    const r = n.val;
    const isHub = n.kind === "hub";
    const fill = isHub ? HUB : `rgba(${EMERALD}, ${n.bright})`;
    // glow
    ctx.shadowColor = isHub ? HUB : `rgb(${EMERALD})`;
    ctx.shadowBlur = 16 * n.bright;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    // label
    const font = 11 / scale;
    ctx.font = `${font}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isHub ? "#f3f4f6" : `rgba(156,163,175,${0.5 + n.bright * 0.5})`;
    ctx.fillText(n.label, n.x, n.y + r + 3 / scale);
    if (n.kind === "domain") {
      ctx.fillStyle = `rgba(${EMERALD}, ${n.bright})`;
      ctx.font = `700 ${font}px "JetBrains Mono", monospace`;
      ctx.fillText(
        `${Math.round(n.score * 100)}`,
        n.x,
        n.y + r + 3 / scale + font + 2 / scale,
      );
    }
  };

  const Graph = ({ w, h }: { w: number; h: number }) => (
    <ForceGraph2D
      ref={fgRef}
      width={w}
      height={h}
      graphData={graph}
      backgroundColor="rgba(0,0,0,0)"
      cooldownTicks={90}
      d3VelocityDecay={0.3}
      linkColor={() => `rgba(${EMERALD}, 0.25)`}
      linkWidth={1}
      linkDirectionalParticles={2}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={() => `rgba(${EMERALD}, 0.9)`}
      enableNodeDrag={true}
      enableZoomInteraction={true}
      enablePanInteraction={true}
      nodeCanvasObject={draw}
    />
  );

  return (
    <>
      <div className="term">
        <div className="term-bar">
          <span className="term-lights">
            <span className="term-light tl-r" />
            <span className="term-light tl-y" />
            <span className="term-light tl-g" />
          </span>
          <span className="term-path">agent@jobcopilot ~ trust-map</span>
          <button
            className="term-expand"
            onClick={() => setExpanded(true)}
            aria-label="Expand trust map"
            title="Expand"
          >
            ⤢ expand
          </button>
          <span className="term-tag">
            {count} node{count === 1 ? "" : "s"}
          </span>
        </div>
        <div className="graph-webgl" ref={wrapRef}>
          {count === 0 ? (
            <p className="graph-empty">
              The map fills as your agent observes authenticated email.
            </p>
          ) : (
            <>
              <Graph w={size.w} h={size.h} />
              <span className="graph-hint-inline">drag · scroll to zoom</span>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="graph-overlay" onClick={() => setExpanded(false)}>
          <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
            <div className="term-bar">
              <span className="term-lights">
                <span className="term-light tl-r" />
                <span className="term-light tl-y" />
                <span className="term-light tl-g" />
              </span>
              <span className="term-path">agent@jobcopilot ~ trust-map</span>
              <button className="term-expand" onClick={() => setExpanded(false)}>
                ✕ close
              </button>
            </div>
            <div className="graph-modal-body">
              <FullGraph draw={draw} graph={graph} fgRef={fgRef} />
            </div>
            <div className="graph-hint">drag to move · scroll to zoom · drag nodes · esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}

// Fullscreen graph fills its modal body via its own ResizeObserver.
function FullGraph({ draw, graph, fgRef }: any) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState({ w: 900, h: 600 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const EM = "52, 211, 153";
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      <ForceGraph2D
        ref={fgRef}
        width={s.w}
        height={s.h}
        graphData={graph}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        linkColor={() => `rgba(${EM}, 0.25)`}
        linkWidth={1}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => `rgba(${EM}, 0.9)`}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        nodeCanvasObject={draw}
      />
    </div>
  );
}
