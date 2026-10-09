"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { firstName } from "@/lib/ritual";
import { Notice } from "@/components/notice";
import { AuthSkeleton } from "@/components/skeleton";
import { api } from "../../convex/_generated/api";

// Sign in, create an account (confirmed by email), continue with Google, and reset a
// forgotten password. Emailed links come back here: ?verified=1 after confirming an
// email, ?token=… to choose a new password, and ?error=… when a link has expired.

type Mode = "sign-in" | "sign-up" | "check-email" | "forgot" | "forgot-sent" | "reset";
const verifiedReturn = "/account?verified=1";

export function AccountScreen() {
  return <Suspense fallback={<AuthSkeleton />}><Account /></Suspense>;
}

function Account() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token"), linkError = params.get("error"), verified = params.get("verified") === "1";
  const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const options = useQuery(api.auth.signInOptions);
  const [mode, setMode] = useState<Mode>(token ? "reset" : linkError && !verified ? "forgot" : "sign-in");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError
    ? verified ? "That confirmation link has expired or was already used. Sign in and we'll send a new one." : "That reset link has expired or was already used. Ask for a new one below."
    : "");
  const [note, setNote] = useState("");
  // Guards against a second submit before React re-renders the disabled fieldset.
  const pending = useRef(false);

  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setNote("");
    try { await work(); }
    catch { setError("Could not reach the account service. Check your connection and try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  function go(next: Mode) {
    if (pending.current) return;
    setMode(next); setError(""); setNote("");
    // Leave a used link's address behind, so a reload doesn't reuse it.
    if (token || linkError) router.replace("/account");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const typed = String(values.get("email") || email).trim();
    const password = String(values.get("password") || "");
    const name = String(values.get("name") || "").trim();
    if (mode === "sign-up" && !name) { setError("Enter your name."); return; }
    void run(async () => {
      setEmail(typed);
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({ name, email: typed, password, callbackURL: verifiedReturn });
        if (result.error) setError("Could not create the account. Try signing in if you already registered, or try again later.");
        // No session yet means the email must be confirmed first; local development can skip that.
        else { form.reset(); if (!result.data?.token) setMode("check-email"); }
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email: typed, password, callbackURL: verifiedReturn });
        if (result.error?.status === 403) { setMode("check-email"); setNote("Confirm your email first. We've just sent a new link."); }
        else if (result.error) setError("Could not sign in. Check your email and password, then try again.");
        else form.reset();
      } else if (mode === "forgot") {
        // The answer is the same whether or not the email has an account.
        await authClient.requestPasswordReset({ email: typed, redirectTo: "/account" });
        setMode("forgot-sent");
      } else if (mode === "reset" && token) {
        if (password !== String(values.get("confirm") || "")) { setError("The two passwords don't match."); return; }
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) { setMode("forgot"); setError("That reset link has expired or was already used. Ask for a new one below."); }
        else { form.reset(); setMode("sign-in"); setNote("Password changed. Sign in with your new password."); }
        router.replace("/account");
      }
    });
  }

  const resend = () => void run(async () => {
    const result = await authClient.sendVerificationEmail({ email, callbackURL: verifiedReturn });
    if (result.error) setError("Could not send a new link. Try again in a minute.");
    else setNote("A new link is on its way.");
  });

  const google = () => void run(async () => {
    const result = await authClient.signIn.social({ provider: "google", callbackURL: "/today", errorCallbackURL: "/account?error=google" });
    if (result.error) setError("Could not start Google sign-in. Please try again.");
  });

  async function signOut() {
    await run(async () => {
      const result = await authClient.signOut();
      if (result.error) setError("Could not sign out. Please try again.");
    });
  }

  if (isPending) return <AuthSkeleton />;
  if (sessionError) return <section className="auth">
    <div role="alert" className="notice"><span>Could not check your session.</span></div>
    <button onClick={() => void refetch()}>Try again</button>
  </section>;

  if (session) {
    const status = isLoading || (isAuthenticated && user === undefined)
      ? "Confirming your identity with Convex…"
      : isAuthenticated && user
        ? `Convex identity confirmed for ${firstName(user.name) || user.name}.`
        : "Your account session exists, but Convex has not confirmed it. Reload to retry.";
    return <SignedIn name={firstName(session.user.name)} email={session.user.email} confirmedEmail={verified && !linkError} status={status} confirmed={Boolean(isAuthenticated && user)} busy={busy} error={error} onDismiss={() => setError("")} onSignOut={() => void signOut()} />;
  }

  if (mode === "check-email" || mode === "forgot-sent") return <Message
    title={<>Check your <em>email.</em></>}
    lede={mode === "check-email"
      ? <>We sent a link to <b>{email || "your email"}</b>. Open it to confirm your address, and you&apos;ll be signed in.</>
      : <>If <b>{email}</b> has an account, a link to choose a new password is on its way. It works for one hour.</>}
    note={note} error={error} onDismiss={() => setError("")}
    actions={<>
      {mode === "check-email" && <button type="button" className="secondary" disabled={busy || !email} onClick={resend}>{busy ? "Sending…" : "Send the link again"}</button>}
      <p className="auth-switch"><button type="button" className="text-button" onClick={() => go("sign-in")}>Back to sign in</button></p>
    </>} />;

  return <AuthForm mode={mode} busy={busy} error={error} note={note} google={Boolean(options?.google) && (mode === "sign-in" || mode === "sign-up")}
    onDismiss={() => setError("")} onSubmit={submit} onMode={go} onGoogle={google} />;
}

/** Signed in: who you are, whether Convex has confirmed it, and the way back to Today. */
export function SignedIn({ name, email, confirmedEmail, status, confirmed, busy, error, onDismiss, onSignOut }: {
  name: string; email: string; confirmedEmail?: boolean; status: string; confirmed: boolean; busy: boolean; error: string; onDismiss: () => void; onSignOut: () => void;
}) {
  return <section className="auth" aria-labelledby="account-heading">
    <h1 id="account-heading" className="auth-title">{name ? <>Hello, <em>{name}.</em></> : <>You’re <em>in.</em></>}</h1>
    <p className="text-2 auth-lede">{email}</p>
    {confirmedEmail && <p role="status" className="account-status confirmed">Email confirmed. Welcome to Becoming.</p>}
    <p role="status" className={`account-status${confirmed ? " confirmed" : ""}`}>{status}</p>
    {error && <Notice tone="alert" onDismiss={onDismiss}>{error}</Notice>}
    <Link className="button-link auth-submit" href="/today">Open Today →</Link>
    <p className="auth-switch"><button type="button" className="text-button" disabled={busy} onClick={onSignOut}>{busy ? "Signing out…" : "Sign out"}</button></p>
  </section>;
}

/** A short message screen: "Check your email". */
function Message({ title, lede, note, error, onDismiss, actions }: { title: ReactNode; lede: ReactNode; note: string; error: string; onDismiss: () => void; actions: ReactNode }) {
  return <section className="auth" aria-labelledby="account-heading">
    <h1 id="account-heading" className="auth-title">{title}</h1>
    <p className="text-2 auth-lede">{lede}</p>
    {note && <p role="status" className="account-status confirmed">{note}</p>}
    {error && <Notice tone="alert" onDismiss={onDismiss}>{error}</Notice>}
    {actions}
  </section>;
}

const copy: Record<"sign-in" | "sign-up" | "forgot" | "reset", { title: ReactNode; lede: string; button: string }> = {
  "sign-in": { title: <>Welcome <em>back.</em></>, lede: "Pick up where you left off.", button: "Sign in" },
  "sign-up": { title: <>Begin <em>here.</em></>, lede: "One private account for your work, ideas and progress.", button: "Create account" },
  "forgot": { title: <>Forgot your <em>password?</em></>, lede: "Enter your email and we'll send a link to choose a new one.", button: "Send the link" },
  "reset": { title: <>Choose a new <em>password.</em></>, lede: "12 characters or more. You'll sign in with it next.", button: "Save the new password" },
};

/** Sign in, create an account, ask for a reset link, or set a new password. */
export function AuthForm({ mode, busy, error, note, google, onDismiss, onSubmit, onMode, onGoogle }: {
  mode: Mode; busy: boolean; error: string; note: string; google: boolean; onDismiss: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onMode: (mode: Mode) => void; onGoogle: () => void;
}) {
  const view = mode === "sign-up" || mode === "forgot" || mode === "reset" ? mode : "sign-in";
  const signUp = view === "sign-up", reset = view === "reset";
  return <section className="auth" aria-labelledby="account-heading">
    <h1 id="account-heading" className="auth-title">{copy[view].title}</h1>
    <p className="text-2 auth-lede">{copy[view].lede}</p>
    {google && <>
      <button type="button" className="secondary auth-google" disabled={busy} onClick={onGoogle}><GoogleMark />Continue with Google</button>
      <p className="auth-or" aria-hidden="true"><span>or with email</span></p>
    </>}
    <form className="auth-form" onSubmit={onSubmit} aria-busy={busy}>
      <fieldset className="auth-fields auth-fieldset" disabled={busy}>
        <legend className="sr-only">{signUp ? "Create account details" : reset ? "New password" : view === "forgot" ? "Email for the reset link" : "Sign-in details"}</legend>
        {signUp && <label>Name<input name="name" autoComplete="name" required maxLength={100} /></label>}
        {!reset && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
        {view !== "forgot" && <label>
          <span className="auth-label-row"><span>{reset ? "New password" : "Password"}{(signUp || reset) && <span className="muted" id="password-help"> · 12 characters or more</span>}</span>
            {view === "sign-in" && <button type="button" className="text-button auth-forgot" onClick={() => onMode("forgot")}>Forgot password?</button>}</span>
          <input name="password" type="password" autoComplete={signUp || reset ? "new-password" : "current-password"} required minLength={signUp || reset ? 12 : undefined} maxLength={128} aria-describedby={signUp || reset ? "password-help" : undefined} />
        </label>}
        {reset && <label>Type it again<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>}
        <button type="submit" className="auth-submit">{busy ? "Please wait…" : copy[view].button}</button>
      </fieldset>
      {note && <p role="status" className="account-status confirmed">{note}</p>}
      {error && <Notice tone="alert" onDismiss={onDismiss}>{error}</Notice>}
    </form>
    <p className="auth-switch">
      {view === "sign-in" && <>New to Becoming? <button type="button" className="text-button" onClick={() => onMode("sign-up")}>Create an account</button></>}
      {view === "sign-up" && <>Already have an account? <button type="button" className="text-button" onClick={() => onMode("sign-in")}>Sign in</button></>}
      {(view === "forgot" || reset) && <button type="button" className="text-button" onClick={() => onMode("sign-in")}>Back to sign in</button>}
    </p>
  </section>;
}

/** Google's "G", drawn inline (no image request). */
function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}
