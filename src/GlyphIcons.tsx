/**
 * Line-art emblem set, in the style of the agent glyph on emmanueltsakpo.click:
 * a thin-stroke figure inside a circular node, emerald accent on the "live"
 * part, gray on structure. One emblem per Attest concept so each mechanism and
 * gate step gets its own identity while sharing a visual family (same 48x48
 * node frame, same stroke weights, sharp terminal feel).
 *
 * All strokes use currentColor / the emerald token so they theme cleanly.
 */

type GlyphProps = { className?: string };

const FRAME = {
  viewBox: "0 0 48 48",
  fill: "none" as const,
  xmlns: "http://www.w3.org/2000/svg",
};

// shared circular node ring every emblem sits in
function Ring() {
  return (
    <circle
      cx="24"
      cy="24"
      r="21"
      stroke="rgba(148,163,184,0.32)"
      strokeWidth="1.2"
    />
  );
}

const stroke = "rgba(243,244,246,0.82)";
const accent = "#34d399";

/* AUTHORITY — a shield with a check: trust derived from the authenticated
   channel, immune to spoofed text. */
export function GlyphAuthority({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <path
        d="M24 13 L32 16 V24 C32 29 28 32 24 34 C20 32 16 29 16 24 V16 Z"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 23.5 L23 26 L28 20.5"
        stroke={accent}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* CONTINUITY — a key mid-rotation: the forward-secret rotating proof that
   catches a later takeover. */
export function GlyphContinuity({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <circle
        cx="20"
        cy="20"
        r="4.5"
        stroke={accent}
        strokeWidth="1.5"
      />
      <path
        d="M23 23 L31 31"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M28 28 L30.5 25.5 M30 30 L32.5 27.5"
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* rotation arrow hint */}
      <path
        d="M15.5 15.5 A5 5 0 0 1 24 16"
        stroke={accent}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* REPUTATION — connected nodes: portable, attestable standing that travels the
   network. */
export function GlyphReputation({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <path
        d="M18 18 L30 22 M18 18 L22 31 M30 22 L22 31"
        stroke={stroke}
        strokeWidth="1.3"
      />
      <circle cx="18" cy="18" r="2.6" fill={accent} />
      <circle
        cx="30"
        cy="22"
        r="2.4"
        stroke={stroke}
        strokeWidth="1.3"
        fill="var(--term-bg, #0e1117)"
      />
      <circle
        cx="22"
        cy="31"
        r="2.4"
        stroke={stroke}
        strokeWidth="1.3"
        fill="var(--term-bg, #0e1117)"
      />
    </svg>
  );
}

/* SENSITIVE — a lock: an SSN / bank request always held. */
export function GlyphSensitive({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <rect
        x="17"
        y="23"
        width="14"
        height="11"
        rx="1.5"
        stroke={stroke}
        strokeWidth="1.4"
      />
      <path
        d="M20 23 V19.5 A4 4 0 0 1 28 19.5 V23"
        stroke={accent}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="28" r="1.5" fill={accent} />
    </svg>
  );
}

/* POLICY — a document with rule lines: the user-owned structured rules. */
export function GlyphPolicy({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <rect
        x="17"
        y="15"
        width="14"
        height="18"
        rx="1.5"
        stroke={stroke}
        strokeWidth="1.4"
      />
      <path d="M20 20 H28" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 24 H28" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M20 28 H25" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/* DEFAULT — a pause/hold bars: anything unmatched holds for you. */
export function GlyphDefault({ className }: GlyphProps) {
  return (
    <svg className={className} {...FRAME}>
      <Ring />
      <rect x="19" y="18" width="3.2" height="12" rx="1" fill={stroke} />
      <rect x="26" y="18" width="3.2" height="12" rx="1" fill={accent} />
    </svg>
  );
}
