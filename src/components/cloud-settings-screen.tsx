"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Notice } from "@/components/notice";
import { readableError } from "@/lib/errors";

// The shared workspace shell handles sign-in; this renders only for a confirmed account.
export function CloudSettingsScreen() {
  const profile = useQuery(api.settings.getProfile);
  const saveMotive = useMutation(api.settings.saveMotive);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const motive = String(new FormData(event.currentTarget).get("motive") || "").trim();
    setBusy(true); setError(""); setMessage("");
    try {
      await saveMotive({ motive });
      setMessage(motive ? "Your north star is saved to your account." : "Your motive is cleared.");
    } catch (caught) { setError(readableError(caught, "Could not save your motive. Please try again.")); }
    finally { setBusy(false); }
  }

  return <>
    <div className="heading"><div><p className="eyebrow">Make it yours</p><h1>A direction you can return to.</h1><p className="muted">Your ambition can stay steady while your daily capacity changes.</p></div></div>
    {message && <Notice onDismiss={() => setMessage("")}>{message}</Notice>}
    {error && <Notice tone="alert" onDismiss={() => setError("")}>{error}</Notice>}
    {profile === undefined ? <p role="status">Loading your settings…</p> : <form key={profile?.motive ?? "new"} className="panel stack" onSubmit={event => void save(event)}>
      <h2>Your north star</h2>
      <label>Your motive<textarea name="motive" maxLength={1000} defaultValue={profile?.motive ?? ""} placeholder="What kind of design engineer are you becoming?" aria-describedby="motive-help" /></label>
      <p id="motive-help" className="muted">This appears in your workspace sidebar and is private to your account. Leave it empty to clear it.</p>
      <div><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save motive"}</button></div>
    </form>}
    <section className="panel stack space"><h2>Rhythm and data controls</h2><p className="muted">Weekly targets, timezone rules, planned pauses, and a complete export need separate design and verification. They are not active settings yet.</p></section>
  </>;
}
