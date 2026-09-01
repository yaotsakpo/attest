import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  GlyphAuthority,
  GlyphContinuity,
  GlyphReputation,
  GlyphSensitive,
  GlyphPolicy,
  GlyphDefault,
} from "./GlyphIcons";
import "./Landing.css";

/**
 * Scroll-reveal: adds `is-in` when the element first enters the viewport, so
 * CSS can fade/slide it up once. One-shot (unobserves after reveal). Degrades
 * to always-visible if IntersectionObserver is missing.
 */
function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLElement>}
      className={`lp-reveal ${shown ? "is-in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * The signed-out front door. A high-design, dark/emerald landing that explains
 * Attest before asking for anything, with a single primary action (Sign in)
 * that hands off to the auth screen. No form here — landing sells, auth screen
 * collects. Mature-dev split.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="lp">
      <div className="lp-aurora" aria-hidden="true">
        <span className="lp-aurora-blob" />
        <span className="lp-aurora-blob" />
        <span className="lp-aurora-blob" />
        <span className="lp-aurora-blob" />
      </div>
      <LandingNav onSignIn={onSignIn} />
      <Hero onSignIn={onSignIn} />
      <Mechanisms />
      <Flow />
      <Papers />
      <Sponsors />
      <CTA onSignIn={onSignIn} />
      <LandingFooter />
    </div>
  );
}

function LandingNav({ onSignIn }: { onSignIn: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav className={`lp-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="lp-nav-inner">
        <div className="lp-brand">
          <img
            className="lp-logo-img"
            src="/brand/attest-wordmark.png"
            alt="Attest"
            width={2076}
            height={398}
          />
        </div>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#research">Research</a>
          <button className="btn btn-primary lp-nav-cta" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      </div>
    </nav>
  );
}

function Hero({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="lp-hero">
      <NodeSphere />
      <div className="lp-hero-copy">
        <h1 className="lp-h1">
          A recruiter emailed your agent for your salary.
          <br />
          A stranger emailed for your SSN.
          <br />
          <span className="lp-h1-accent">
            Attest is why it said yes to one and no to the other.
          </span>
        </h1>
        <p className="lp-lede">
          Your AI agent is starting to run your inbox — applying to jobs,
          replying to recruiters, paying small invoices, sharing your details.
          The moment it acts for you, one question decides everything: who is it
          allowed to trust, and what can it do on your behalf? Attest answers it
          per message, deterministically, with no LLM in the decision path — so
          it auto-handles the verified ones and holds the rest for you.
        </p>
        <div className="lp-cta-row">
          <button className="btn btn-primary lp-cta-primary" onClick={onSignIn}>
            Sign in
          </button>
          <a className="lp-cta-secondary" href="#how">
            See how it works
            <span className="lp-arrow" aria-hidden="true">
              ↓
            </span>
          </a>
        </div>
        <div className="lp-proof">
          <span>Backed by 3 published papers</span>
          <span className="lp-proof-sep" />
          <span>151 tests</span>
          <span className="lp-proof-sep" />
          <span>No LLM in the gate</span>
        </div>
      </div>
    </header>
  );
}

/**
 * Full-bleed hero backdrop: a network of nodes distributed on a sphere
 * (Fibonacci lattice), slowly rotating in 3D and projected to 2D on a canvas.
 * Near neighbors are joined by hairline edges, forming the rotating web. Node
 * size and brightness track depth (z), so the sphere reads as volumetric.
 * Brand palette only: gray nodes, emerald on the nearest/brightest few and on
 * the edge glow. Sits behind the hero copy, dimmed by a vignette in CSS.
 * Honors prefers-reduced-motion (renders one static frame, no loop).
 */
function NodeSphere() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // node count scales with viewport so mobile stays light
    let w = 0;
    let h = 0;
    let N = 0;
    type P = { x: number; y: number; z: number };
    let base: P[] = [];
    let edges: Array<[number, number]> = [];
    const EDGE_DIST = 0.62; // unit-sphere chord threshold for connecting

    function buildSphere() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      N = Math.max(48, Math.min(96, Math.round((w * h) / 14000)));
      base = [];
      // Fibonacci sphere: even distribution of N points on a unit sphere
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2; // 1 .. -1
        const r = Math.sqrt(1 - y * y);
        const theta = golden * i;
        base.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
      }
      // precompute edges between near neighbors (on the static lattice)
      edges = [];
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = base[i].x - base[j].x;
          const dy = base[i].y - base[j].y;
          const dz = base[i].z - base[j].z;
          if (dx * dx + dy * dy + dz * dz < EDGE_DIST * EDGE_DIST) {
            edges.push([i, j]);
          }
        }
      }
    }

    let raf = 0;
    function frame(t: number) {
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.46;
      const ay = t * 0.00013; // slow yaw
      const ax = 0.32 + Math.sin(t * 0.00007) * 0.12; // gentle pitch drift

      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);

      // rotate + project each point
      const pts = new Array(N);
      for (let i = 0; i < N; i++) {
        const p = base[i];
        // yaw around Y
        let X = p.x * cosY - p.z * sinY;
        let Z = p.x * sinY + p.z * cosY;
        let Y = p.y;
        // pitch around X
        const Y2 = Y * cosX - Z * sinX;
        const Z2 = Y * sinX + Z * cosX;
        Y = Y2;
        Z = Z2;
        const depth = (Z + 1) / 2; // 0 (far) .. 1 (near)
        pts[i] = {
          sx: cx + X * radius,
          sy: cy + Y * radius,
          depth,
        };
      }

      ctx!.clearRect(0, 0, w, h);

      // edges — opacity/width by nearest endpoint depth
      for (const [a, b] of edges) {
        const pa = pts[a];
        const pb = pts[b];
        const d = Math.max(pa.depth, pb.depth);
        const alpha = 0.04 + d * 0.16;
        ctx!.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
        ctx!.lineWidth = 0.6 + d * 0.5;
        ctx!.beginPath();
        ctx!.moveTo(pa.sx, pa.sy);
        ctx!.lineTo(pb.sx, pb.sy);
        ctx!.stroke();
      }

      // nodes — size + brightness by depth; a few nearest glow emerald
      // rank by depth to pick the brightest handful for the accent
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const r = 0.8 + p.depth * p.depth * 3.2;
        const accent = p.depth > 0.82; // only the very nearest go emerald
        if (accent) {
          ctx!.fillStyle = `rgba(52, 211, 153, ${0.35 + p.depth * 0.5})`;
          ctx!.shadowColor = "rgba(52, 211, 153, 0.6)";
          ctx!.shadowBlur = 8 * p.depth;
        } else {
          ctx!.fillStyle = `rgba(203, 213, 225, ${0.12 + p.depth * 0.5})`;
          ctx!.shadowBlur = 0;
        }
        ctx!.beginPath();
        ctx!.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }

      if (!reduce) raf = requestAnimationFrame(frame);
    }

    buildSphere();
    if (reduce) {
      frame(6000); // one static, pleasantly-rotated frame
    } else {
      raf = requestAnimationFrame(frame);
    }
    const onResize = () => buildSphere();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="lp-sphere" aria-hidden="true">
      <canvas ref={ref} className="lp-sphere-canvas" />
    </div>
  );
}

const MECHANISMS = [
  {
    tag: "01 / authority",
    title: "Trust the channel, not the words",
    body: "A message that claims to be from a company means nothing. A message that authenticated as that domain is evidence. Attest derives authority from the authenticated channel, so a spoofed instruction fails no matter how convincing the text.",
    verdict: "verified",
    Icon: GlyphAuthority,
  },
  {
    tag: "02 / continuity",
    title: "Is it still you?",
    body: "Authentication proves who a message came from at arrival, not that a trusted counterpart hasn't been taken over since. A forward-secret rotating proof rides each message. A takeover that lacks the seed fails, and the agent holds everything from that counterpart.",
    verdict: "held",
    Icon: GlyphContinuity,
  },
  {
    tag: "03 / reputation",
    title: "Earned once, useful everywhere",
    body: "A proven takeover carries self-contained evidence, so it propagates and protects other agents before their next contact. A missing proof is an omission with no evidence, so it stays local and never smears an honest agent network-wide.",
    verdict: "verified",
    Icon: GlyphReputation,
  },
  {
    tag: "04 / identity",
    title: "An accountable name, not a permission",
    body: "Each agent can declare who it acts for and what it does, as a set of capabilities anyone can see. It is zero-authority by design: the declaration is shown and logged, never used to grant access. You declare your own agent's identity, and you see the identity every counterpart declares.",
    verdict: "verified",
    Icon: GlyphPolicy,
  },
];

function Mechanisms() {
  return (
    <section className="lp-section" id="how">
      <div className="lp-section-head">
        <span className="lp-kicker">how it works</span>
        <h2 className="lp-h2">Four mechanisms, one principle</h2>
        <p className="lp-section-sub">
          Each one is a published paper wired into the codebase and tested, not
          merely argued.
        </p>
      </div>
      <div className="lp-mech-grid">
        {MECHANISMS.map((m, i) => (
          <Reveal delay={i * 90} key={m.tag}>
            <article className="lp-mech">
              <m.Icon className="lp-mech-icon" />
              <div className="lp-mech-main">
                <span className="lp-mech-tag">{m.tag}</span>
                <h3 className="lp-mech-title">{m.title}</h3>
                <p className="lp-mech-body">{m.body}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FLOW = [
  {
    n: "1",
    label: "continuity",
    desc: "takeover of a trusted peer? hold",
    Icon: GlyphContinuity,
  },
  {
    n: "2",
    label: "reputation",
    desc: "proven-compromised anywhere? hold",
    Icon: GlyphReputation,
  },
  {
    n: "3",
    label: "sensitive",
    desc: "SSN / bank request? always hold",
    Icon: GlyphSensitive,
  },
  {
    n: "4",
    label: "policy",
    desc: "your rules: allow / hold / deny",
    Icon: GlyphPolicy,
  },
  {
    n: "5",
    label: "default",
    desc: "unmatched? hold for you",
    Icon: GlyphDefault,
  },
];

function Flow() {
  return (
    <section className="lp-section lp-flow-section">
      <div className="lp-section-head">
        <span className="lp-kicker">the gate</span>
        <h2 className="lp-h2">Every message runs the gate, in order</h2>
        <p className="lp-section-sub">
          First match wins. Anything unmatched holds. An unauthorized payment
          always holds, and a remembered payment stays capped at the amount you
          approved.
        </p>
      </div>
      <div className="lp-gate-layout">
        <div className="lp-gate">
          <span className="lp-gate-rail" aria-hidden="true">
            <span className="lp-gate-pulse" />
          </span>
          {FLOW.map((f, i) => (
            <Reveal as="div" delay={i * 90} className="lp-gate-row" key={f.n}>
              <span className="lp-gate-node">{f.n}</span>
              <div className="lp-gate-text">
                <span className="lp-gate-label">
                  <f.Icon className="lp-gate-icon" />
                  {f.label}
                </span>
                <span className="lp-gate-desc">{f.desc}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <GateTerminal />
      </div>
    </section>
  );
}

// Scenarios the gate resolves, replayed in the terminal. Each is a real path
// through the priority order: a line of input, the check that fires, the
// verdict. Kept honest to the product (allow / hold, never "fake").
const GATE_SCENARIOS: Array<{ lines: Array<[string, string]> }> = [
  {
    lines: [
      ["in", "greenhouse.io  →  interview invite"],
      ["run", "auth: DMARC pass · continuity ok"],
      ["ok", "verdict: ALLOW  ·  auto-reply sent"],
    ],
  },
  {
    lines: [
      ["in", "unknown@payroll-verify.co  →  “confirm your SSN”"],
      ["run", "gate: sensitive-info request"],
      ["hold", "verdict: HOLD  ·  waiting for you"],
    ],
  },
  {
    lines: [
      ["in", "vendor@acme.com  →  wire $5,000"],
      ["run", "policy: over your $200 limit"],
      ["hold", "verdict: HOLD  ·  payment capped"],
    ],
  },
  {
    lines: [
      ["in", "partner@known.co  →  reply (rotating proof absent)"],
      ["run", "continuity: takeover suspected"],
      ["hold", "verdict: HOLD  ·  worse than a stranger"],
    ],
  },
  {
    lines: [
      ["in", "lever.co  →  recruiter follow-up"],
      ["run", "reputation: verified · remembered rule"],
      ["ok", "verdict: ALLOW  ·  handled itself"],
    ],
  },
];

/**
 * A live terminal that replays gate decisions: it types each scenario line by
 * line, holds, clears, and advances to the next, looping. Pure state + timers,
 * no deps. Reduced-motion shows the full latest scenario without typing.
 */
function GateTerminal() {
  const [scenario, setScenario] = useState(0);
  const [shownLines, setShownLines] = useState(0);
  const [typed, setTyped] = useState("");
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduce) {
      setShownLines(GATE_SCENARIOS[scenario].lines.length);
      return;
    }
    const lines = GATE_SCENARIOS[scenario].lines;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (shownLines < lines.length) {
      // type the current line character by character
      const full = lines[shownLines][1];
      if (typed.length < full.length) {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setTyped(full.slice(0, typed.length + 1));
          }, 18),
        );
      } else {
        // line done: commit it, move to next after a beat
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              setShownLines((n) => n + 1);
              setTyped("");
            }
          }, 260),
        );
      }
    } else {
      // scenario complete: hold, then clear and advance
      timers.push(
        setTimeout(() => {
          if (!cancelled) {
            setShownLines(0);
            setTyped("");
            setScenario((s) => (s + 1) % GATE_SCENARIOS.length);
          }
        }, 2200),
      );
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [scenario, shownLines, typed, reduce]);

  const lines = GATE_SCENARIOS[scenario].lines;
  return (
    <div className="lp-term" aria-hidden="true">
      <div className="lp-term-bar">
        <span className="lp-term-dot" />
        <span className="lp-term-dot" />
        <span className="lp-term-dot" />
        <span className="lp-term-title">attest · gate</span>
      </div>
      <div className="lp-term-body">
        {lines.slice(0, shownLines).map((l, i) => (
          <TermLine key={`${scenario}-${i}`} kind={l[0]} text={l[1]} />
        ))}
        {shownLines < lines.length && (
          <TermLine
            kind={lines[shownLines][0]}
            text={typed}
            cursor
          />
        )}
      </div>
    </div>
  );
}

function TermLine({
  kind,
  text,
  cursor,
}: {
  kind: string;
  text: string;
  cursor?: boolean;
}) {
  const prefix =
    kind === "in" ? "›" : kind === "run" ? "·" : kind === "ok" ? "✓" : "!";
  return (
    <div className={`lp-term-line lp-term-${kind}`}>
      <span className="lp-term-prefix">{prefix}</span>
      <span className="lp-term-text">
        {text}
        {cursor && <span className="lp-term-cursor" />}
      </span>
    </div>
  );
}

const PAPERS = [
  {
    axis: "Authority",
    title: "Context References Over Payloads",
    doi: "10.5281/zenodo.21860668",
  },
  {
    axis: "Continuity",
    title: "Agent-Identity Continuity",
    doi: "10.5281/zenodo.22119416",
  },
  {
    axis: "Reputation",
    title: "Transferable and Local Evidence in Agent Reputation",
    doi: "10.5281/zenodo.22133570",
  },
];

function Papers() {
  return (
    <section className="lp-section" id="research">
      <div className="lp-section-head">
        <span className="lp-kicker">research</span>
        <h2 className="lp-h2">Falsifiable, because it runs</h2>
        <p className="lp-section-sub">
          Attest is the working implementation of three published papers. Each
          is falsifiable because the mechanism it describes is wired into this
          codebase and tested.
        </p>
      </div>
      <div className="lp-papers">
        {PAPERS.map((p, i) => (
          <Reveal as="div" delay={i * 90} key={p.doi}>
            <a
              className="lp-paper"
              href={`https://doi.org/${p.doi}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="lp-paper-axis">{p.axis}</span>
              <span className="lp-paper-title">{p.title}</span>
              <span className="lp-paper-doi">
                doi.org/{p.doi}
                <span className="lp-paper-ext" aria-hidden="true">
                  ↗
                </span>
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const SPONSORS = [
  { name: "Convex", role: "backend, live queries, auth, hosting" },
  { name: "AgentMail", role: "the agent's real email inbox" },
  { name: "Firecrawl", role: "enrich each counterpart domain" },
  { name: "OpenAI", role: "typed extraction from raw mail" },
];

function Sponsors() {
  return (
    <section className="lp-section lp-sponsors-section">
      <span className="lp-kicker lp-kicker-center">built on</span>
      <div className="lp-sponsors">
        {SPONSORS.map((s) => (
          <div className="lp-sponsor" key={s.name}>
            <span className="lp-sponsor-name">{s.name}</span>
            <span className="lp-sponsor-role">{s.role}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="lp-cta-band">
      <h2 className="lp-cta-h2">Give your agent a spine.</h2>
      <p className="lp-cta-sub">
        One inbox. A trust score for every counterpart, earned from
        authenticated mail. A gate it can't be talked out of.
      </p>
      <button className="btn btn-primary lp-cta-band-btn" onClick={onSignIn}>
        Sign in to Attest
      </button>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-brand">
        <img
          className="lp-logo-img"
          src="/brand/attest-wordmark.png"
          alt="Attest"
          width={2076}
          height={398}
        />
      </div>
      <span className="lp-footer-note">
        built for the Convex All Gas Hackathon
      </span>
    </footer>
  );
}
