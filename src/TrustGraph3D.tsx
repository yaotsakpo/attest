import { useEffect, useRef } from "react";

// A real 3D trust graph on a plain canvas (no library): the agent at the centre,
// counterparts placed on a sphere around it, rotated (yaw + pitch) and projected
// to 2D every frame. Node size/brightness/glow track real Z-depth, so near nodes
// come forward and far recede — the 3D feel, matching the landing hero. Fully
// interactive: hover pauses rotation + brightens, drag orbits, click hits the
// nearest projected node. Labels stay visible. Scales to many nodes because it's
// a straightforward projection + painter's-order draw with depth-faded edges.

const EMERALD = "110, 231, 183";
const RED = "248, 113, 113";

export type GNode = {
  id: string;
  label: string;
  kind: "agent" | "hub" | "company" | "direct";
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
};
export type GLink = { source: string; target: string; kind: string };

type Placed = GNode & { bx: number; by: number; bz: number; radius: number };

function placeOnSphere(nodes: GNode[]): Placed[] {
  const others = nodes.filter((n) => n.kind !== "agent");
  const golden = Math.PI * (3 - Math.sqrt(5));
  const placed: Placed[] = [];
  const agent = nodes.find((n) => n.kind === "agent");
  if (agent) placed.push({ ...agent, bx: 0, by: 0, bz: 0, radius: 6 });
  const M = others.length;
  others.forEach((n, i) => {
    const y = M === 1 ? 0 : 1 - (i / (M - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const radius =
      n.kind === "hub"
        ? 4.5 + Math.min(n.hubCompanyCount, 4) * 0.6
        : 3 + n.score * 2;
    placed.push({
      ...n,
      bx: Math.cos(theta) * rr,
      by: y,
      bz: Math.sin(theta) * rr,
      radius,
    });
  });
  return placed;
}

export function TrustGraph3D({
  nodes,
  links,
  width,
  height,
  onSelect,
}: {
  nodes: GNode[];
  links: GLink[];
  width: number;
  height: number;
  onSelect: (n: GNode | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({
    yaw: 0.2,
    pitch: 0.35,
    autoYaw: true,
    dragging: false,
    lastX: 0,
    lastY: 0,
    hoverId: null as string | null,
    proj: new Map<string, { x: number; y: number; z: number; r: number }>(),
  });

  const placedRef = useRef<Placed[]>([]);
  const idxRef = useRef<Map<string, Placed>>(new Map());
  const keyRef = useRef<string>("");
  const nodesKey = nodes
    .map((n) => n.id)
    .sort()
    .join("|");
  if (keyRef.current !== nodesKey) {
    keyRef.current = nodesKey;
    placedRef.current = placeOnSphere(nodes);
    idxRef.current = new Map(placedRef.current.map((p) => [p.id, p]));
  } else {
    const byId = idxRef.current;
    for (const n of nodes) {
      const p = byId.get(n.id);
      if (p) Object.assign(p, n);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const st = state.current;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const scale = Math.min(width, height) * 0.32;

    function frame() {
      const placed = placedRef.current;
      const cx = width / 2;
      const cy = height / 2;
      if (st.autoYaw && !st.dragging && !reduce) st.yaw += 0.0016;

      const cosY = Math.cos(st.yaw);
      const sinY = Math.sin(st.yaw);
      const cosX = Math.cos(st.pitch);
      const sinX = Math.sin(st.pitch);

      const proj = st.proj;
      proj.clear();
      const drawList: Array<{
        p: Placed;
        sx: number;
        sy: number;
        depth: number;
        rr: number;
      }> = [];
      for (const p of placed) {
        let X = p.bx * cosY - p.bz * sinY;
        let Z = p.bx * sinY + p.bz * cosY;
        let Y = p.by;
        const Y2 = Y * cosX - Z * sinX;
        const Z2 = Y * sinX + Z * cosX;
        Y = Y2;
        Z = Z2;
        const depth = (Z + 1) / 2;
        const persp = 0.82 + depth * 0.36;
        const sx = cx + X * scale;
        const sy = cy + Y * scale;
        const rr = p.radius * persp;
        proj.set(p.id, { x: sx, y: sy, z: depth, r: rr });
        drawList.push({ p, sx, sy, depth, rr });
      }

      ctx!.clearRect(0, 0, width, height);

      // edges — straight lines, depth-faded by the nearer endpoint. (Straight is
      // fine: with per-node depth, near edges are brighter and far ones recede,
      // so the eye separates them by depth rather than needing curves.)
      ctx!.lineWidth = 0.8;
      for (const l of links) {
        const a = proj.get(
          typeof l.source === "string" ? l.source : (l.source as any).id,
        );
        const b = proj.get(
          typeof l.target === "string" ? l.target : (l.target as any).id,
        );
        if (!a || !b) continue;
        const d = Math.max(a.z, b.z);
        ctx!.strokeStyle =
          l.kind === "held"
            ? `rgba(${RED}, ${0.1 + d * 0.18})`
            : `rgba(148, 163, 184, ${0.07 + d * 0.17})`;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      // nodes: far first so near ones overpaint
      drawList.sort((p, q) => p.depth - q.depth);
      for (const item of drawList) {
        const { p, sx, sy, depth, rr } = item;
        const isAgent = p.kind === "agent";
        const isHub = p.kind === "hub";
        const earned = !p.held && p.score >= 0.55 && p.verified > 0;
        const inherited = !p.held && !earned && p.inheritedTrust;
        const hovered = st.hoverId === p.id;

        let rgb: string;
        let baseA: number;
        if (isAgent) {
          rgb = "243,244,246";
          baseA = 1;
        } else if (p.held) {
          rgb = RED;
          baseA = 0.85;
        } else if (isHub || earned) {
          rgb = EMERALD;
          baseA = 0.9;
        } else if (inherited) {
          rgb = EMERALD;
          baseA = 0.55;
        } else {
          rgb = "203,213,225";
          baseA = 0.6;
        }
        const a = Math.min(1, baseA * (0.5 + depth * 0.5) + (hovered ? 0.2 : 0));
        const blur = (isAgent ? 16 : isHub || earned ? 13 : 6) * (0.5 + depth * 0.7);

        const grad = ctx!.createRadialGradient(
          sx - rr * 0.3,
          sy - rr * 0.3,
          rr * 0.1,
          sx,
          sy,
          rr,
        );
        grad.addColorStop(0, `rgba(${rgb}, ${Math.min(1, a + 0.2)})`);
        grad.addColorStop(0.6, `rgba(${rgb}, ${a})`);
        grad.addColorStop(1, `rgba(${rgb}, ${a * 0.25})`);

        ctx!.shadowColor = `rgba(${rgb}, ${a * 0.8})`;
        ctx!.shadowBlur = blur + (hovered ? 6 : 0);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;

        if (p.held && p.askedSensitive) {
          ctx!.strokeStyle = `rgba(${RED}, ${0.5 + depth * 0.4})`;
          ctx!.lineWidth = 1.4;
          ctx!.beginPath();
          ctx!.arc(sx, sy, rr + 4, 0, Math.PI * 2);
          ctx!.stroke();
        }

        // LABEL DECLUTTERING (rank + level-of-detail, the standard approach):
        // as the graph grows, always-on labels collide. So we label by
        // importance — the agent, hubs, and held nodes are always labelled
        // (high rank); ordinary counterparts show their label only when they're
        // near the FRONT of the sphere (depth) or hovered. Small graphs still
        // show everything (the front threshold relaxes when there are few
        // nodes); large ones stay legible.
        const total = drawList.length;
        const important = isAgent || isHub || p.held;
        // with few nodes, label all; with many, only near-front company nodes
        const frontThreshold = total <= 12 ? 0 : total <= 24 ? 0.5 : 0.68;
        const showLabel = important || hovered || depth >= frontThreshold;

        if (showLabel) {
          const labelA = hovered ? 0.95 : important ? 0.55 + depth * 0.4 : 0.3 + depth * 0.55;
          ctx!.font = `10px "JetBrains Mono", monospace`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "top";
          ctx!.fillStyle = isAgent
            ? `rgba(243,244,246, ${labelA})`
            : `rgba(148,163,184, ${labelA})`;
          ctx!.fillText(isAgent ? "your agent" : p.label, sx, sy + rr + 3);

          const sub = isHub
            ? `ATS · ${p.hubCompanyCount}`
            : p.held
              ? "HELD"
              : inherited && p.viaHub
                ? `via ${p.viaHub}`
                : p.kind === "direct"
                  ? `${Math.round(p.score * 100)}`
                  : "";
          if (sub) {
            ctx!.font = `700 9px "JetBrains Mono", monospace`;
            ctx!.fillStyle = p.held
              ? `rgba(${RED}, ${labelA})`
              : `rgba(${EMERALD}, ${labelA})`;
            ctx!.fillText(sub, sx, sy + rr + 15);
          }
        }
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, links]);

  function hitTest(mx: number, my: number): string | null {
    let best: string | null = null;
    let bestZ = -1;
    for (const [id, pr] of state.current.proj) {
      const dx = mx - pr.x;
      const dy = my - pr.y;
      const hitR = Math.max(pr.r, 8);
      if (dx * dx + dy * dy <= hitR * hitR && pr.z > bestZ) {
        best = id;
        bestZ = pr.z;
      }
    }
    return best;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        cursor: state.current.dragging ? "grabbing" : "grab",
      }}
      onMouseDown={(e) => {
        const st = state.current;
        st.dragging = true;
        st.lastX = e.clientX;
        st.lastY = e.clientY;
      }}
      onMouseMove={(e) => {
        const st = state.current;
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        if (st.dragging) {
          st.yaw += (e.clientX - st.lastX) * 0.008;
          st.pitch += (e.clientY - st.lastY) * 0.008;
          st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch));
          st.lastX = e.clientX;
          st.lastY = e.clientY;
        } else {
          st.hoverId = hitTest(e.clientX - rect.left, e.clientY - rect.top);
          st.autoYaw = st.hoverId === null;
        }
      }}
      onMouseUp={() => {
        state.current.dragging = false;
      }}
      onMouseLeave={() => {
        const st = state.current;
        st.dragging = false;
        st.hoverId = null;
        st.autoYaw = true;
      }}
      onClick={(e) => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
        if (!id) {
          onSelect(null);
          return;
        }
        const n = nodes.find((x) => x.id === id);
        onSelect(n && n.kind !== "agent" ? n : null);
      }}
    />
  );
}
