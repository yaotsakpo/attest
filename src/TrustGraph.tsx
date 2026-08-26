import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

// The one signature motion object: an ambient node-graph where each observed
// domain is a node sized by earned trust, connected to a central "your agent"
// hub. When a domain's trust updates (new authenticated email), its node
// pulses. Reads live registry data — the graph IS the network, not decoration.
// Dark-terminal aesthetic; respects reduced-motion; pauses when offscreen.

type Node = {
  domain: string;
  score: number;
  grade: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
};

const COLORS: Record<string, string> = {
  A: "#4aa651",
  B: "#4aa651",
  C: "#e49e22",
  D: "#e49e22",
  F: "#ff6568",
};

export function TrustGraph() {
  const domains = useQuery(api.registry.listDomains);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const rafRef = useRef<number>(0);

  // Sync node set with live registry data; pulse on score change.
  useEffect(() => {
    if (!domains) return;
    const map = nodesRef.current;
    const seen = new Set<string>();
    for (const d of domains) {
      seen.add(d.domain);
      const grade = gradeFor(d.trustScore, d.verifiedCount, d.unverifiedCount);
      const existing = map.get(d.domain);
      if (existing) {
        if (existing.score !== d.trustScore) existing.pulse = 1;
        existing.score = d.trustScore;
        existing.grade = grade;
        existing.r = 5 + d.trustScore * 12;
      } else {
        // fan nodes to the RIGHT of the hub, in a tightening spiral so a
        // single node still sits near the center rather than at the edge.
        const idx = map.size;
        const angle = -0.6 + idx * 1.1; // spread rightward
        const ring = 0.16 + (idx % 3) * 0.07;
        map.set(d.domain, {
          domain: d.domain,
          score: d.trustScore,
          grade,
          x: 0.42 + Math.cos(angle) * ring * 1.4,
          y: 0.5 + Math.sin(angle) * ring,
          vx: 0,
          vy: 0,
          r: 6 + d.trustScore * 10,
          pulse: 1,
        });
      }
    }
    for (const key of [...map.keys()]) if (!seen.has(key)) map.delete(key);
  }, [domains]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const hub = () => ({ x: w * 0.42, y: h * 0.5 });

    function frame() {
      ctx!.clearRect(0, 0, w, h);
      const c = hub();
      const nodes = [...nodesRef.current.values()];

      // arcs from hub to each node
      for (const n of nodes) {
        const nx = n.x * w;
        const ny = n.y * h;
        const col = COLORS[n.grade] ?? "#9a9aa4";
        ctx!.strokeStyle = col;
        ctx!.globalAlpha = 0.12 + n.pulse * 0.5;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(c.x, c.y);
        ctx!.lineTo(nx, ny);
        ctx!.stroke();
        if (!reduce && n.pulse > 0.01) n.pulse *= 0.94;
      }
      ctx!.globalAlpha = 1;

      // hub — only drawn once the agent has observed something, so the empty
      // state's centered message doesn't collide with the hub label.
      if (nodes.length > 0) {
        ctx!.fillStyle = "#cdd6f4";
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "#7f849c";
        ctx!.font = "11px 'Spline Sans Mono', monospace";
        ctx!.textAlign = "center";
        ctx!.fillText("your agent", c.x, c.y + 22);
      }

      // nodes
      for (const n of nodes) {
        const nx = n.x * w;
        const ny = n.y * h;
        const col = COLORS[n.grade] ?? "#9a9aa4";
        if (n.pulse > 0.02) {
          ctx!.globalAlpha = n.pulse * 0.35;
          ctx!.fillStyle = col;
          ctx!.beginPath();
          ctx!.arc(nx, ny, n.r + n.pulse * 14, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }
        ctx!.fillStyle = col;
        ctx!.beginPath();
        ctx!.arc(nx, ny, n.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = "#9a9aa4";
        ctx!.font = "10px 'Spline Sans Mono', monospace";
        ctx!.textAlign = "center";
        ctx!.fillText(n.domain, nx, ny + n.r + 12);
      }

      if (!reduce) rafRef.current = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const count = domains?.length ?? 0;
  const empty = count === 0;
  // Height scales with how full the map is: compact when sparse (so one node
  // doesn't float in a void), taller as more domains are observed.
  const height = Math.min(240, 120 + count * 24);
  return (
    <div className="term" style={{ marginBottom: "var(--space-2xl)" }}>
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
      <div className="graph-wrap" style={{ height }}>
        <canvas ref={canvasRef} className="graph-canvas" aria-hidden="true" />
        {empty && (
          <p className="graph-empty">
            The map fills as your agent observes authenticated email.
          </p>
        )}
      </div>
    </div>
  );
}
