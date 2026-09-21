"use client";

import { useRef, useState, type FormEvent } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { api } from "../../convex/_generated/api";

export function AccountScreen() {
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    const name = String(values.get("name") || "").trim();
    if (mode === "sign-up" && !name) { setError("Enter your name."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(mode === "sign-in" ? "Could not sign in. Check your email and password, then try again." : "Could not create the account. Try signing in if you already registered, or try again later.");
      } else {
        form.reset();
      }
    } catch {
      setError("Could not reach the account service. Check your connection and try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function signOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) setError("Could not sign out. Please try again.");
    } catch {
      setError("Could not reach the account service. Your session may still be active; try signing out again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (isPending) return <p role="status">Checking your session…</p>;
  if (sessionError) return <div className="stack"><p role="alert">Could not check your session.</p><button onClick={() => void refetch()}>Try again</button></div>;

  if (session) return <section className="stack" aria-label="Your account">
    <h2>Signed in</h2>
    <p className="preserve">{session.user.email}</p>
    <p role="status">{isLoading || (isAuthenticated && user === undefined)
      ? "Confirming your identity with Convex…"
      : isAuthenticated && user
        ? `Convex identity confirmed for ${user.name}.`
        : "Your account session exists, but Convex has not confirmed it. Reload to retry."}</p>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={signOut}>{busy ? "Signing out…" : "Sign out"}</button>
  </section>;

  return <section className="stack" aria-label="Sign in or create an account">
    <h2>{mode === "sign-up" ? "Create your account" : "Welcome back"}</h2>
    <form className="stack" onSubmit={submit} aria-busy={busy}>
      <fieldset className="auth-fields stack" disabled={busy}>
        <legend className="sr-only">{mode === "sign-up" ? "Create account details" : "Sign-in details"}</legend>
        {mode === "sign-up" && <label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={mode === "sign-up" ? 12 : undefined} maxLength={128} aria-describedby={mode === "sign-up" ? "password-help" : undefined} /></label>
        {mode === "sign-up" && <p id="password-help" className="small muted">Use 12–128 characters. A longer passphrase works well.</p>}
        <button type="submit">{busy ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
    <button className="secondary" disabled={busy} onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }}>
      {mode === "sign-in" ? "New here? Create an account" : "Already registered? Sign in"}
    </button>
  </section>;
}
