import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

// A real force-directed trust graph (react-force-graph / d3-force). The central
// "your agent" hub links to every domain it has observed; each domain node is
// sized by its trust score and colored by grade (emerald / amber / red).
// Labels are always drawn, so it reads as data, not decoration.

const EMERALD = "#34d399";
const AMBER = "#f59e0b";
const RED = "#f87171";
const INDIGO = "#6366f1";
const INK2 = "#9ca3af";

function gradeColor(g: string): string {
  if (g === "A" || g === "B") return EMERALD;
  if (g === "C" || g === "D") return AMBER;
  return RED;
}

type GNode = {
  id: string;
  label: string;
  kind: "hub" | "domain";
  score: number;
  grade: string;
  val: number;
  color: string;
};
type GLink = { source: string; target: string; color: string };

export function TrustGraph() {
  const domains = useQuery(api.registry.listDomains);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 600, h: 300 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight || 300 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    const nodes: GNode[] = [
      {
        id: "__hub__",
        label: "your agent",
        kind: "hub",
        score: 1,
        grade: "A",
        val: 6,
        color: INDIGO,
      },
    ];
    const links: GLink[] = [];
    for (const d of domains ?? []) {
      const g = gradeFor(d.trustScore, d.verifiedCount, d.unverifiedCount);
      const color = gradeColor(g);
      nodes.push({
        id: d.domain,
        label: d.domain,
        kind: "domain",
        score: d.trustScore,
        grade: g,
        val: 2 + d.trustScore * 6,
        color,
      });
      links.push({ source: "__hub__", target: d.domain, color });
    }
    return { nodes, links };
  }, [domains]);

  // gentle spread + freeze once settled (keeps it readable, not jittering)
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-140);
    fg.d3Force("link")?.distance(70);
  }, [graph]);

  const count = domains?.length ?? 0;

  return (
    <div className="term">
      <div className="term-bar">
        <span className="term-lights">
          <span className="term-light tl-r" />
          <span className="term-light tl-y" />
          <span className="term-light tl-g" />
        </span>
        <span className="term-path">agent@jobcopilot ~ trust-map</span>
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
          <ForceGraph2D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graph}
            backgroundColor="rgba(0,0,0,0)"
            cooldownTicks={80}
            d3VelocityDecay={0.3}
            linkColor={(l: any) => l.color}
            linkWidth={1.2}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2.2}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={(l: any) => l.color}
            enableNodeDrag={false}
            nodeCanvasObject={(node: any, ctx, scale) => {
              const n = node as GNode & { x: number; y: number };
              const r = n.val;
              // glow
              ctx.shadowColor = n.color;
              ctx.shadowBlur = 14;
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
              ctx.fillStyle = n.color;
              ctx.fill();
              ctx.shadowBlur = 0;
              // label
              const font = 11 / scale;
              ctx.font = `${font}px "JetBrains Mono", monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = n.kind === "hub" ? "#f3f4f6" : INK2;
              ctx.fillText(n.label, n.x, n.y + r + 3 / scale);
              // score on domain nodes
              if (n.kind === "domain") {
                ctx.fillStyle = n.color;
                ctx.font = `700 ${font}px "JetBrains Mono", monospace`;
                ctx.fillText(
                  `${Math.round(n.score * 100)}`,
                  n.x,
                  n.y + r + 3 / scale + font + 2 / scale,
                );
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
