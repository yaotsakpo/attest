import { type FormEvent, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Registry } from "./Registry";
import { Board } from "./Board";
import { TrustGraph } from "./TrustGraph";
import { NeedsYou } from "./NeedsYou";
import { ActivityLog } from "./ActivityLog";
import { InboxBadge } from "./InboxBadge";
import { PolicyPanel } from "./PolicyPanel";
import { VaultDrawer } from "./VaultDrawer";
import { ContinuityDrawer } from "./ContinuityDrawer";
import "./App.css";

function SignIn() {
  const { signIn } = useAuthActions();
  // Passwordless: enter email → get an 8-digit code → enter it. No password to
  // set, forget, or reset. Two steps, tracked by `sent`.
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn("email-code", { email });
      setStep("code");
    } catch {
      setError("Couldn’t send a code to that address. Check it and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn("email-code", { email, code });
    } catch {
      setError("That code didn’t match, or it expired. Request a new one.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      {step === "email" ? (
        <form className="auth-card" onSubmit={sendCode}>
          <h1 className="auth-title">Attest</h1>
          <p className="auth-sub">
            Your agent talks to other agents and people over email, and never
            hands your info to a counterpart it can’t verify.
          </p>
          <input
            name="email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !email}
          >
            {submitting ? "Sending…" : "Email me a sign-in code"}
          </button>
          {error && <p className="auth-error">{error}</p>}
          <p className="auth-sub" style={{ margin: 0 }}>
            No password. We send a one-time code to your email.
          </p>
        </form>
      ) : (
        <form className="auth-card" onSubmit={verifyCode}>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent an 8-digit code to <b>{email}</b>. Enter it to sign in.
          </p>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="00000000"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            className="mono"
            required
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || code.length < 8}
          >
            {submitting ? "Verifying…" : "Sign in"}
          </button>
          {error && <p className="auth-error">{error}</p>}
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}

function Dashboard() {
  const { signOut } = useAuthActions();
  // Two right-side drawers (Agent + Vault), one open at a time. The dashboard
  // grid is always the page behind them.
  const [drawer, setDrawer] = useState<
    "none" | "agent" | "vault" | "continuity"
  >("none");

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1 className="app-title">Attest</h1>
          <span className="app-tagline">the trust layer for your agent</span>
        </div>
        <div className="header-actions">
          <InboxBadge />
          <button
            className={`btn ${drawer === "vault" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setDrawer(drawer === "vault" ? "none" : "vault")}
          >
            Vault
          </button>
          <button
            className={`btn ${drawer === "agent" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setDrawer(drawer === "agent" ? "none" : "agent")}
          >
            Agent
          </button>
          <button
            className={`btn ${drawer === "continuity" ? "btn-primary" : "btn-ghost"}`}
            onClick={() =>
              setDrawer(drawer === "continuity" ? "none" : "continuity")
            }
          >
            Continuity
          </button>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <PolicyPanel
        open={drawer === "agent"}
        onClose={() => setDrawer("none")}
      />
      <VaultDrawer
        open={drawer === "vault"}
        onClose={() => setDrawer("none")}
      />
      <ContinuityDrawer
        open={drawer === "continuity"}
        onClose={() => setDrawer("none")}
      />

      <main>
        <div className="grid2">
          {/* Row 1: conversations — FULL WIDTH across both columns */}
          <div className="span-2">
            <Board />
          </div>
          {/* Row 2: registry ‖ needs-you (held + remember) */}
          <Registry />
          <NeedsYou />
          {/* Row 3: activity log (history) ‖ trust map */}
          <ActivityLog />
          <TrustGraph />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <p className="center">Loading…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Dashboard />
      </Authenticated>
    </>
  );
}
