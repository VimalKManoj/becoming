"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

function readableError(error: unknown) {
  if (!(error instanceof Error)) return "Could not save. Please try again.";
  return error.message.match(/Uncaught ConvexError: ([^\n]+)/)?.[1] || error.message.split("\n")[0] || "Could not save. Please try again.";
}

export function CloudTodayScreen() {
  const { data: session, isPending: sessionPending, error: sessionError, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (sessionPending || (session && isLoading)) return <Shell><p role="status">Opening your private workspace…</p></Shell>;
  if (sessionError) return <Shell><div className="stack"><p role="alert">Could not check your session.</p><button onClick={() => void refetch()}>Try again</button></div></Shell>;
  if (!session) return <Shell><section className="panel empty stack"><h1>Sign in to plan today.</h1><p className="muted">Your work and focus sessions belong to your Becoming account.</p><Link className="button-link" href="/account">Open account</Link></section></Shell>;
  if (!isAuthenticated) return <Shell><div className="stack"><p role="status">Confirming your account with Convex…</p><Link href="/account">Check account status</Link></div></Shell>;
  return <Shell><Today /></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceSidebar section="today" northStar="Build a body of work that shows thoughtful design engineering." />
    <main id="main" className="main">
      <header className="topbar"><span className="eyebrow">Personal workspace / today</span><div className="row"><span className="badge">Cloud workspace</span><Link href="/account">Account</Link></div></header>
      <p className="mode-note">Tasks and sessions are saved privately in Convex. Time and energy choices last only while this screen is open.</p>
      {children}
    </main>
  </div>;
}

function Today() {
  const [minutes, setMinutes] = useState(60);
  const [energy, setEnergy] = useState(2);
  const [chosen, setChosen] = useState<string | null>(null);
  const [recapping, setRecapping] = useState(false);
  const [outcome, setOutcome] = useState<"Finished" | "Made progress" | "Blocked">("Finished");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const overview = useQuery(api.tasks.todayOverview, { minutes, energy });
  const startSession = useMutation(api.tasks.startSession);
  const cancelSession = useMutation(api.tasks.cancelSession);
  const recordSession = useMutation(api.tasks.recordSession);

  if (overview === undefined) return <p role="status" className="panel">Finding your next useful step…</p>;
  const active = overview.active;
  const focus = overview.choices.find(choice => choice.taskId === chosen) || overview.choices[0];

  async function start(taskId: Id<"tasks">, smaller: boolean) {
    setBusy(true); setError(""); setMessage("");
    try { await startSession({ taskId, smaller }); setMessage("Session started. It will be here when you return."); }
    catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!active) return;
    setBusy(true); setError(""); setMessage("");
    try { await cancelSession({ activeSessionId: active._id }); setRecapping(false); setMessage("Session cancelled. No contribution was recorded."); }
    catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  async function recap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await recordSession({
        activeSessionId: active._id, outcome,
        contribution: String(data.get("contribution") || "").trim(),
        nextStep: String(data.get("nextStep") || "").trim(),
        evidence: String(data.get("evidence") || "").trim(),
      });
      setRecapping(false); setChosen(null); setOutcome("Finished");
      setMessage("Session saved. Your contribution is recorded in Convex.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  return <>
    {message && <div role="status" className="notice">{message}<button className="text-button" onClick={() => setMessage("")}>Dismiss</button></div>}
    {error && <div role="alert" className="notice">{error}<button className="text-button" onClick={() => setError("")}>Dismiss</button></div>}
    {active ? <section className="session stack">
      <div className="heading"><div><p className="eyebrow">Focused session</p><h1>{active.title}</h1><p className="muted">{active.taskTitle} · {active.minutes} min · {active.lane}</p></div></div>
      {!recapping ? <div className="focus stack"><h2>Your stopping point</h2><p>{active.doneWhen}</p>{active.nextStep && <div className="rule"><p className="eyebrow">Pick up here</p><p>{active.nextStep}</p></div>}<div className="row"><button disabled={busy} onClick={() => setRecapping(true)}>Finish &amp; reflect <ArrowRight size={16} /></button><button className="secondary" disabled={busy} onClick={() => void cancel()}>Cancel session</button></div></div>
        : <form className="panel stack" onSubmit={recap} aria-busy={busy}><h2>What moved forward?</h2><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Session recap</legend>
          <label>Outcome<select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}><option>Finished</option><option>Made progress</option><option>Blocked</option></select></label>
          <label>Your contribution<textarea name="contribution" required maxLength={4000} /></label>
          <label>Next step or blocker<input name="nextStep" required={outcome !== "Finished"} maxLength={2000} /></label>
          <label>Evidence link · optional<input name="evidence" type="url" placeholder="https://…" /></label>
          <div className="row"><button type="submit">{busy ? "Saving…" : "Save session"}</button><button type="button" className="secondary" onClick={() => setRecapping(false)}>Back to session</button></div>
        </fieldset></form>}
    </section> : <>
      <div className="heading"><div><p className="eyebrow">Make room for your practice</p><h1>A little progress, well chosen.</h1><p className="muted">Choose a useful focus from your private Work tasks.</p></div></div>
      <div className="capacity"><div><p className="muted">How much time do you have?</p><div className="row">{[15, 30, 60, 90].map(value => <button key={value} className="chip" aria-pressed={value === minutes} onClick={() => { setMinutes(value); setChosen(null); }}>{value} min</button>)}</div></div><label>Your energy<select value={energy} onChange={event => { setEnergy(Number(event.target.value)); setChosen(null); }}><option value={1}>Low · keep it light</option><option value={2}>Steady · ready to focus</option><option value={3}>High · room to explore</option></select></label></div>
      {focus ? <><section className="focus"><div className="row between"><span className="eyebrow">{chosen ? "Your chosen focus" : "Recommended for tonight"}</span><span className="badge">{focus.lane}</span></div><h2 className="focus-title">{focus.title}</h2><p className="muted">{focus.taskTitle} · {focus.minutes} minutes</p><div className="rule"><p className="eyebrow">Why this fits</p><p>{chosen ? "You selected this focus for your next session." : focus.reason}</p></div><p className="eyebrow">Done when</p><p>{focus.doneWhen}</p><button className="space" disabled={busy} onClick={() => void start(focus.taskId, focus.smaller)}>Start this session <ArrowRight size={16} /></button></section>
        {overview.choices.length > 1 && <><h3 className="space">Another way to move forward</h3><div className="grid space">{overview.choices.filter(choice => choice.taskId !== focus.taskId).map(choice => <article className="panel stack" key={choice.taskId}><span className="eyebrow">{choice.lane} · {choice.minutes} min</span><h3>{choice.title}</h3><button className="secondary" onClick={() => setChosen(choice.taskId)}>Choose this</button></article>)}</div></>}
      </> : <section className="panel empty"><h2>A little room to begin.</h2><p>No ready cloud task fits this capacity. Adjust your time and energy, or define a smaller step in Work.</p><Link href="/work">Open your work →</Link></section>}
    </>}
  </>;
}
