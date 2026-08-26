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

const MIN_PASSWORD = 8;

function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setSubmitting(true);
    try {
      await signIn("password", { email, password, flow });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/invalid password/i.test(msg))
        setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      else if (flow === "signIn") setError("Wrong email or password.");
      else
        setError("Couldn’t create your account. That email may already be in use.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Warden</h1>
        <p className="auth-sub">
          Your agent talks to other agents and people over email, and never hands
          your info to a counterpart it can’t verify.
        </p>
        <input name="email" type="email" placeholder="you@email.com" required />
        <input
          name="password"
          type="password"
          placeholder={`password (min ${MIN_PASSWORD} characters)`}
          minLength={MIN_PASSWORD}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "…" : flow === "signUp" ? "Create account" : "Sign in"}
        </button>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="button"
          className="link"
          onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}
        >
          {flow === "signUp"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </form>
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
          <h1 className="app-title">Warden</h1>
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
