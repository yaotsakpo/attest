import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./DemoTour.css";

// A "Load demo data" button that seeds the dashboard through the real pipeline,
// then runs a guided spotlight tour: it highlights each panel in sequence with
// an explanatory tooltip so a judge (or the demo video) understands what Attest
// is showing. Targets are DOM nodes carrying a data-tour="<key>" attribute.

type Step = {
  target: string; // data-tour key
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: "board",
    title: "Conversations",
    body: "Every counterpart your agent emails with. These came from real inbound emails run through the pipeline — each one authenticated (or not) and graded on arrival.",
  },
  {
    target: "registry",
    title: "The trust registry",
    body: "A live grade (A–F) for every sending domain, earned from authenticated mail — not SEO, not an allowlist. This is the app's spine, exposed to agents at /registry/domains.",
  },
  {
    target: "needs-you",
    title: "Held for you",
    body: "Anything the agent couldn't stand behind waits here: an SSN request, a $5,000 wire from an unverified sender. Approve once and it can become a standing rule.",
  },
  {
    target: "activity",
    title: "The decision log",
    body: "Every gate decision, in order: what authenticated, what held, and why. This is the audit trail — the agent never acts without a recorded reason.",
  },
  {
    target: "graph",
    title: "The trust graph",
    body: "Verified hubs (greenhouse.io, lever.co) vouch for the companies that reach through them, so a company inherits trust the first time it appears — even before it sends aligned mail itself.",
  },
];

export function DemoTour() {
  const seed = useAction(api.demo.seed);
  const [seeding, setSeeding] = useState(false);
  const [tour, setTour] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [seeded, setSeeded] = useState(false);

  async function loadDemo() {
    if (seeding) return;
    setSeeding(true);
    try {
      await seed({});
      setSeeded(true);
      // give the reactive queries a beat to paint the seeded panels, then tour
      setTimeout(() => {
        setStepIdx(0);
        setTour(true);
      }, 700);
    } catch (e) {
      console.error("demo seed failed", e);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <button
        className="btn btn-primary demo-btn"
        onClick={loadDemo}
        disabled={seeding}
      >
        {seeding ? "Loading…" : seeded ? "Replay demo" : "Load demo data"}
      </button>
      {seeded && !tour && (
        <button
          className="btn btn-ghost demo-tour-btn"
          onClick={() => {
            setStepIdx(0);
            setTour(true);
          }}
        >
          Take the tour
        </button>
      )}
      {tour && (
        <TourOverlay
          step={STEPS[stepIdx]}
          index={stepIdx}
          total={STEPS.length}
          onNext={() =>
            stepIdx < STEPS.length - 1
              ? setStepIdx(stepIdx + 1)
              : setTour(false)
          }
          onBack={() => setStepIdx(Math.max(0, stepIdx - 1))}
          onClose={() => setTour(false)}
        />
      )}
    </>
  );
}

function TourOverlay({
  step,
  index,
  total,
  onNext,
  onBack,
  onClose,
}: {
  step: Step;
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  // locate the target, scroll it into view, measure it
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    );
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // measure after the scroll settles
    const measure = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      if (e.key === "ArrowLeft") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onBack]);

  const pad = 8;
  const spot = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // place the tooltip below the spotlight, or above if there's no room
  const tipTop =
    spot && spot.top + spot.height + 16 + 180 < window.innerHeight
      ? spot.top + spot.height + 16
      : spot
        ? Math.max(16, spot.top - 200)
        : window.innerHeight / 2;
  const tipLeft = spot
    ? Math.min(
        Math.max(16, spot.left),
        window.innerWidth - 360,
      )
    : window.innerWidth / 2 - 170;

  return (
    <div className="tour-root" role="dialog" aria-modal="true">
      {/* four dark panels around the spotlight (so the target stays bright) */}
      {spot ? (
        <>
          <div
            className="tour-mask"
            style={{ inset: `0 0 auto 0`, height: Math.max(0, spot.top) }}
          />
          <div
            className="tour-mask"
            style={{
              top: spot.top,
              left: 0,
              width: Math.max(0, spot.left),
              height: spot.height,
            }}
          />
          <div
            className="tour-mask"
            style={{
              top: spot.top,
              left: spot.left + spot.width,
              right: 0,
              height: spot.height,
            }}
          />
          <div
            className="tour-mask"
            style={{
              top: spot.top + spot.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="tour-ring"
            style={{
              left: spot.left,
              top: spot.top,
              width: spot.width,
              height: spot.height,
            }}
          />
        </>
      ) : (
        <div className="tour-mask" style={{ inset: 0 }} />
      )}

      <div
        className="tour-tip"
        ref={tipRef}
        style={{ top: tipTop, left: tipLeft }}
      >
        <div className="tour-tip-head">
          <span className="tour-step-count">
            {index + 1} / {total}
          </span>
          <button className="tour-x" onClick={onClose} aria-label="Close tour">
            ✕
          </button>
        </div>
        <h3 className="tour-tip-title">{step.title}</h3>
        <p className="tour-tip-body">{step.body}</p>
        <div className="tour-tip-actions">
          {index > 0 && (
            <button className="btn btn-ghost tour-nav" onClick={onBack}>
              Back
            </button>
          )}
          <button className="btn btn-primary tour-nav" onClick={onNext}>
            {index < total - 1 ? "Next" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
