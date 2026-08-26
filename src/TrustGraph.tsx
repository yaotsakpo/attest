import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { gradeFor } from "./grade";

// Ambient constellation trust-map, styled after emmanueltsakpo.click: a dense
// field of faint white background particles with proximity-links (atmosphere),
// with the REAL trust nodes (your agent + observed domains) rendered brighter
// in emerald with labels on top. Monochrome white/gray + one emerald accent.
// Drag to pan, scroll to zoom; expandable to fullscreen.

const EMERALD = "110, 231, 183"; // #6ee7b7, the portfolio accent

type Ambient = { x: number; y: number; vx: number; vy: number; r: number; o: number };
type Real = {
  domain: string;
  label: string;
  kind: "hub" | "domain";
  score: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  bright: number;
};

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amb: Ambient[],
  real: Real[],
  pan: { x: number; y: number; z: number },
  linkDist: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(pan.z, pan.z);

  // faint ambient mesh: links between nearby background particles
  ctx.lineWidth = 1;
  for (let i = 0; i < amb.length; i++) {
    for (let j = i + 1; j < amb.length; j++) {
      const dx = amb[i].x - amb[j].x;
      const dy = amb[i].y - amb[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < linkDist * linkDist) {
        const a = (1 - Math.sqrt(d2) / linkDist) * 0.08;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.moveTo(amb[i].x, amb[i].y);
        ctx.lineTo(amb[j].x, amb[j].y);
        ctx.stroke();
      }
    }
  }
  // ambient nodes
  for (const p of amb) {
    ctx.fillStyle = `rgba(255,255,255,${p.o})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // links from hub to each real domain (emerald, brighter)
  const hub = real.find((n) => n.kind === "hub");
  if (hub) {
    for (const n of real) {
      if (n.kind === "hub") continue;
      const grad = ctx.createLinearGradient(hub.x, hub.y, n.x, n.y);
      grad.addColorStop(0, `rgba(${EMERALD}, 0.05)`);
      grad.addColorStop(1, `rgba(${EMERALD}, ${0.15 + n.bright * 0.2})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(hub.x, hub.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    }
  }

  // real nodes on top
  for (const n of real) {
    const isHub = n.kind === "hub";
    ctx.shadowColor = isHub ? "rgba(255,255,255,0.9)" : `rgba(${EMERALD},1)`;
    ctx.shadowBlur = isHub ? 18 : 10 + n.bright * 10;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = isHub ? "#f3f4f6" : `rgba(${EMERALD}, ${0.55 + n.bright * 0.45})`;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isHub ? "rgba(243,244,246,0.9)" : "rgba(156,163,175,0.85)";
    ctx.fillText(n.label, n.x, n.y + n.r + 4);
    if (!isHub) {
      ctx.fillStyle = `rgba(${EMERALD}, ${0.6 + n.bright * 0.4})`;
      ctx.font = `700 11px "JetBrains Mono", monospace`;
      ctx.fillText(`${Math.round(n.score * 100)}`, n.x, n.y + n.r + 18);
    }
  }
  ctx.restore();
}

export function TrustGraph() {
  const domains = useQuery(api.registry.listDomains);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<{ domain: string; trustScore: number; v: number; u: number }[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    dataRef.current = (domains ?? []).map((d) => ({
      domain: d.domain,
      trustScore: d.trustScore,
      v: d.verifiedCount,
      u: d.unverifiedCount,
    }));
  }, [domains]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let amb: Ambient[] = [];
    const real: Real[] = [];
    const pan = { x: 0, y: 0, z: 1 };

    function resize() {
      w = wrap!.clientWidth;
      h = wrap!.clientHeight || 300;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // ambient density ∝ area
      const target = Math.round((w * h) / 5200);
      amb = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 0.6 + Math.random() * 1.6,
        o: 0.15 + Math.random() * 0.4,
      }));
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function syncReal() {
      const data = dataRef.current;
      // no hub until the agent has observed something (keeps empty-state clean)
      if (data.length === 0) {
        real.length = 0;
        return;
      }
      if (!real.find((n) => n.kind === "hub")) {
        real.push({ domain: "__hub__", label: "your agent", kind: "hub", score: 1, x: w / 2, y: h / 2, vx: 0, vy: 0, r: 9, bright: 1 });
      }
      const hub = real.find((n) => n.kind === "hub")!;
      hub.x += (w / 2 - hub.x) * 0.05;
      hub.y += (h / 2 - hub.y) * 0.05;
      // add/update domain nodes
      data.forEach((d, i) => {
        const g = gradeFor(d.trustScore, d.v, d.u);
        void g;
        let n = real.find((x) => x.domain === d.domain);
        const ang = (i / Math.max(1, data.length)) * Math.PI * 2 - Math.PI / 2;
        const ring = Math.min(w, h) * 0.3;
        if (!n) {
          n = {
            domain: d.domain, label: d.domain, kind: "domain", score: d.trustScore,
            x: w / 2 + Math.cos(ang) * ring, y: h / 2 + Math.sin(ang) * ring,
            vx: 0, vy: 0, r: 5 + d.trustScore * 8, bright: d.trustScore,
          };
          real.push(n);
        } else {
          n.score = d.trustScore;
          n.r = 5 + d.trustScore * 8;
          n.bright = d.trustScore;
          // gentle pull toward its ring slot
          const tx = w / 2 + Math.cos(ang) * ring;
          const ty = h / 2 + Math.sin(ang) * ring;
          n.x += (tx - n.x) * 0.02;
          n.y += (ty - n.y) * 0.02;
        }
      });
      // drop removed
      for (let i = real.length - 1; i >= 0; i--) {
        if (real[i].kind === "domain" && !data.find((d) => d.domain === real[i].domain)) real.splice(i, 1);
      }
    }

    let raf = 0;
    function frame() {
      // drift ambient
      for (const p of amb) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }
      syncReal();
      draw(ctx, w, h, amb, real, pan, 110);
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    frame();

    // interaction: drag to pan, scroll to zoom
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      pan.x += e.clientX - lx; pan.y += e.clientY - ly; lx = e.clientX; ly = e.clientY;
      if (reduce) draw(ctx, w, h, amb, real, pan, 110);
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.08 : 0.92;
      pan.z = Math.max(0.4, Math.min(4, pan.z * f));
      if (reduce) draw(ctx, w, h, amb, real, pan, 110);
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [expanded]);

  const count = domains?.length ?? 0;

  const bar = (closeBtn: boolean) => (
    <div className="term-bar">
      <span className="term-lights">
        <span className="term-light tl-r" />
        <span className="term-light tl-y" />
        <span className="term-light tl-g" />
      </span>
      <span className="term-path">agent@jobcopilot ~ trust-map</span>
      <button className="term-expand" onClick={() => setExpanded(!closeBtn)}>
        {closeBtn ? "✕ close" : "⤢ expand"}
      </button>
      {!closeBtn && (
        <span className="term-tag">
          {count} node{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className="term">
        {bar(false)}
        <div className="graph-webgl" ref={wrapRef}>
          <canvas ref={canvasRef} className="graph-canvas" />
          {count === 0 && (
            <p className="graph-empty">
              The map fills as your agent observes authenticated email.
            </p>
          )}
          {count > 0 && <span className="graph-hint-inline">drag · scroll to zoom</span>}
        </div>
      </div>

      {expanded && (
        <div className="graph-overlay" onClick={() => setExpanded(false)}>
          <div className="graph-modal" onClick={(e) => e.stopPropagation()}>
            {bar(true)}
            <div className="graph-modal-body">
              {/* reuse same canvas engine at modal size via a nested instance */}
              <TrustGraphCanvas />
            </div>
            <div className="graph-hint">drag to move · scroll to zoom · esc to close</div>
          </div>
        </div>
      )}
    </>
  );
}

// A standalone canvas instance for the fullscreen modal (its own sizing loop).
function TrustGraphCanvas() {
  const domains = useQuery(api.registry.listDomains);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<{ domain: string; trustScore: number; v: number; u: number }[]>([]);
  useEffect(() => {
    dataRef.current = (domains ?? []).map((d) => ({ domain: d.domain, trustScore: d.trustScore, v: d.verifiedCount, u: d.unverifiedCount }));
  }, [domains]);
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0; let amb: Ambient[] = []; const real: Real[] = [];
    const pan = { x: 0, y: 0, z: 1 };
    function resize() {
      w = wrap!.clientWidth; h = wrap!.clientHeight || 500;
      canvas!.width = w * dpr; canvas!.height = h * dpr;
      canvas!.style.width = w + "px"; canvas!.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      amb = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18,
        r: 0.6 + Math.random() * 1.6, o: 0.15 + Math.random() * 0.4,
      }));
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);
    function syncReal() {
      const data = dataRef.current;
      if (!real.find((n) => n.kind === "hub")) real.push({ domain: "__hub__", label: "your agent", kind: "hub", score: 1, x: w / 2, y: h / 2, vx: 0, vy: 0, r: 10, bright: 1 });
      const hub = real.find((n) => n.kind === "hub")!;
      hub.x += (w / 2 - hub.x) * 0.05; hub.y += (h / 2 - hub.y) * 0.05;
      data.forEach((d, i) => {
        let n = real.find((x) => x.domain === d.domain);
        const ang = (i / Math.max(1, data.length)) * Math.PI * 2 - Math.PI / 2;
        const ring = Math.min(w, h) * 0.32;
        if (!n) { real.push({ domain: d.domain, label: d.domain, kind: "domain", score: d.trustScore, x: w / 2 + Math.cos(ang) * ring, y: h / 2 + Math.sin(ang) * ring, vx: 0, vy: 0, r: 6 + d.trustScore * 10, bright: d.trustScore }); }
        else { n.score = d.trustScore; n.r = 6 + d.trustScore * 10; n.bright = d.trustScore; const tx = w / 2 + Math.cos(ang) * ring, ty = h / 2 + Math.sin(ang) * ring; n.x += (tx - n.x) * 0.02; n.y += (ty - n.y) * 0.02; }
      });
      for (let i = real.length - 1; i >= 0; i--) if (real[i].kind === "domain" && !data.find((d) => d.domain === real[i].domain)) real.splice(i, 1);
    }
    let raf = 0;
    function frame() {
      for (const p of amb) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      syncReal(); draw(ctx, w, h, amb, real, pan, 130); raf = requestAnimationFrame(frame);
    }
    frame();
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e: MouseEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; };
    const onMove = (e: MouseEvent) => { if (!dragging) return; pan.x += e.clientX - lx; pan.y += e.clientY - ly; lx = e.clientX; ly = e.clientY; };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); pan.z = Math.max(0.4, Math.min(4, pan.z * (e.deltaY < 0 ? 1.08 : 0.92))); };
    canvas.addEventListener("mousedown", onDown); window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("mousedown", onDown); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); canvas.removeEventListener("wheel", onWheel); };
  }, []);
  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
