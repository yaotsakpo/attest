import { type FormEvent, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Board } from "./Board";
import { Registry } from "./Registry";
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

    // Tell the user the real requirement BEFORE a round-trip.
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await signIn("password", { email, password, flow });
    } catch (err) {
      // Convex Auth throws "Invalid password" for the default length rule, and
      // a generic error for bad credentials on sign-in. Translate honestly.
      const msg = err instanceof Error ? err.message : "";
      if (/invalid password/i.test(msg)) {
        setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      } else if (flow === "signIn") {
        setError("Wrong email or password.");
      } else {
        setError("Couldn’t create your account. That email may already be in use.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Job Copilot</h1>
        <p className="auth-sub">
          The copilot that watches your job search and learns who to trust.
        </p>
        <input name="email" type="email" placeholder="you@email.com" required />
        <input
          name="password"
          type="password"
          placeholder={`password (min ${MIN_PASSWORD} characters)`}
          minLength={MIN_PASSWORD}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting
            ? "…"
            : flow === "signUp"
              ? "Create account"
              : "Sign in"}
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
  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1 className="app-title">Job Copilot</h1>
          <p className="app-tagline">
            An agent learning which domains to trust, from your real job search.
          </p>
        </div>
        <button className="link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Registry />
        <Board />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <p className="muted center">Loading…</p>
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
