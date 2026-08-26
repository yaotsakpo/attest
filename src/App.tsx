import { type FormEvent, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Registry } from "./Registry";
import { Board } from "./Board";
import { Vault } from "./Vault";
import { TrustGraph } from "./TrustGraph";
import { Activity } from "./Activity";
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
        <h1 className="auth-title">Job Copilot</h1>
        <p className="auth-sub">
          An agent that answers recruiters for you, and won’t hand your info to a
          sender it can’t verify.
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
  const [view, setView] = useState<"home" | "vault">("home");

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1 className="app-title">Job Copilot</h1>
          <span className="app-tagline">trust registry for your agent</span>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${view === "home" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("home")}
          >
            Dashboard
          </button>
          <button
            className={`btn ${view === "vault" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView("vault")}
          >
            Vault
          </button>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        {view === "home" ? (
          <div className="tiles">
            <div className="tiles-col">
              <Registry />
              <Board />
            </div>
            <div className="tiles-col">
              <Activity />
              <TrustGraph />
            </div>
          </div>
        ) : (
          <Vault />
        )}
      </main>
    </div>
  );
}

export default function App() {
  // DEV-ONLY preview: `?preview` renders the dashboard shell without auth so the
  // layout can be screenshotted during development. Never reachable in prod
  // (import.meta.env.DEV is false in the build) and gated on the query param.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("preview")) {
    return <Dashboard />;
  }
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
