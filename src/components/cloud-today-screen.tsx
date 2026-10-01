"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Notice } from "@/components/notice";
import { readableError } from "@/lib/errors";

type Overview = FunctionReturnType<typeof api.tasks.todayOverview>;
type ActiveFocus = NonNullable<Overview["active"]>;
type Outcome = "Finished" | "Made progress" | "Blocked";

const field = (data: FormData, name: string) => String(data.get(name) || "").trim();
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

// Convex returns undefined while a query with new arguments loads. Keeping the last
// answer on screen means the time and energy controls never disappear mid-click
// (which used to drop keyboard focus); `updating` says a fresher answer is coming.
function useSettled<T>(value: T | undefined) {
  const [settled, setSettled] = useState(value);
  if (value !== undefined && value !== settled) setSettled(value);
  return { value: value ?? settled, updating: value === undefined && settled !== undefined };
}

export function CloudTodayScreen() {
  const [minutes, setMinutes] = useState(60);
  const [energy, setEnergy] = useState(2);
  const [chosen, setChosen] = useState<Id<"tasks"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const live = useQuery(api.tasks.todayOverview, { minutes, energy });
  const { value: overview, updating } = useSettled(live);
  const startSession = useMutation(api.tasks.startSession);

  if (overview === undefined) return <p role="status" className="panel">Finding your next useful step…</p>;
  const focus = overview.choices.find(choice => choice.taskId === chosen) ?? overview.choices[0];

  async function start(taskId: Id<"tasks">, smaller: boolean) {
    setBusy(true); setError(""); setMessage("");
    try { await startSession({ taskId, smaller }); setMessage("Session started. It will be here when you return."); }
    catch (caught) { setError(readableError(caught, "Could not start the session. Please try again.")); }
    finally { setBusy(false); }
  }

  function choose(taskId: Id<"tasks">) {
    setChosen(taskId);
    focusById("focus-title");
  }

  return <>
    {message && <Notice onDismiss={() => setMessage("")}>{message}</Notice>}
    {error && <Notice tone="alert" onDismiss={() => setError("")}>{error}</Notice>}
    {overview.active ? <ActiveSession key={overview.active._id} active={overview.active} onMessage={setMessage} onError={setError} /> : <>
      <div className="heading"><div><p className="eyebrow">Make room for your practice</p><h1>A little progress, well chosen.</h1><p className="muted">Choose a useful focus from your Work tasks.</p></div></div>
      <div className="capacity">
        <div role="group" aria-labelledby="time-label"><p id="time-label" className="muted">How much time do you have?</p><div className="row">{[15, 30, 60, 90].map(value => <button key={value} className="chip" aria-pressed={value === minutes} onClick={() => { setMinutes(value); setChosen(null); }}>{value} min</button>)}</div></div>
        <label>Your energy<select value={energy} onChange={event => { setEnergy(Number(event.target.value)); setChosen(null); }}><option value={1}>Low · keep it light</option><option value={2}>Steady · ready to focus</option><option value={3}>High · room to explore</option></select></label>
      </div>
      <p role="status" className="sr-only">{updating ? "Updating your suggestion…" : ""}</p>
      <div aria-busy={updating} className={updating ? "updating" : undefined}>
        {focus ? <><section className="focus"><div className="row between"><span className="eyebrow">{chosen ? "Your chosen focus" : "Recommended for tonight"}</span><span className="badge">{focus.lane}</span></div><h2 id="focus-title" tabIndex={-1} className="focus-title">{focus.title}</h2><p className="muted">{focus.taskTitle} · {focus.minutes} minutes</p><div className="rule"><p className="eyebrow">Why this fits</p><p>{chosen ? "You selected this focus for your next session." : focus.reason}</p></div><p className="eyebrow">Done when</p><p>{focus.doneWhen}</p><button className="space" disabled={busy || updating} onClick={() => void start(focus.taskId, focus.smaller)}>Start this session <ArrowRight size={16} /></button></section>
          {overview.choices.length > 1 && <><h3 className="space">Another way to move forward</h3><div className="grid space">{overview.choices.filter(choice => choice.taskId !== focus.taskId).map(choice => <article className="panel stack" key={choice.taskId}><span className="eyebrow">{choice.lane} · {choice.minutes} min</span><h3>{choice.title}</h3><button className="secondary" onClick={() => choose(choice.taskId)}>Choose this</button></article>)}</div></>}
        </> : <section className="panel empty"><h2>A little room to begin.</h2><p>Nothing ready fits this time and energy. Try another choice, define a smaller step, or unblock a task in Work.</p><Link href="/work">Open your work →</Link></section>}
      </div>
    </>}
  </>;
}

// Keyed by the active session, so each new session starts with a fresh recap.
// The recap stays mounted while hidden, so "Back to session" keeps what you typed.
function ActiveSession({ active, onMessage, onError }: { active: ActiveFocus; onMessage: (text: string) => void; onError: (text: string) => void }) {
  const [recapping, setRecapping] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("Finished");
  const [busy, setBusy] = useState(false);
  const cancelSession = useMutation(api.tasks.cancelSession);
  const recordSession = useMutation(api.tasks.recordSession);
  // Finishing a smaller step leaves its parent task in progress, so it needs a next step too.
  const needsNextStep = outcome !== "Finished" || active.smaller;
  const nextStepLabel = outcome === "Blocked" ? "What's blocking it?"
    : outcome === "Made progress" ? "Next step"
      : active.smaller ? `Next step for ${active.taskTitle}` : "Next step · optional";

  function showRecap(open: boolean) {
    setRecapping(open);
    focusById(open ? "recap-heading" : "finish-button");
  }

  async function cancel() {
    setBusy(true); onError(""); onMessage("");
    try { await cancelSession({ activeSessionId: active._id }); onMessage("Session cancelled. No contribution was recorded."); }
    catch (caught) { onError(readableError(caught, "Could not cancel the session. Please try again.")); }
    finally { setBusy(false); }
  }

  async function recap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); onError(""); onMessage("");
    try {
      await recordSession({ activeSessionId: active._id, outcome, contribution: field(data, "contribution"), nextStep: field(data, "nextStep"), evidence: field(data, "evidence") });
      onMessage("Session saved. Your contribution is in your Journey.");
    } catch (caught) { onError(readableError(caught, "Could not save your session. Your recap is still here; please try again.")); }
    finally { setBusy(false); }
  }

  return <section className="session stack">
    <div className="heading"><div><p className="eyebrow">Focused session</p><h1>{active.title}</h1><p className="muted">{active.taskTitle} · {active.minutes} min · {active.lane}</p></div></div>
    <div className="focus stack" hidden={recapping}>
      <h2>Your stopping point</h2><p>{active.doneWhen}</p>
      {active.nextStep && <div className="rule"><p className="eyebrow">Pick up here</p><p>{active.nextStep}</p></div>}
      <div className="row"><button id="finish-button" disabled={busy} onClick={() => showRecap(true)}>Finish &amp; reflect <ArrowRight size={16} /></button><button className="secondary" disabled={busy} onClick={() => void cancel()}>Cancel session</button></div>
    </div>
    <form className="panel stack" onSubmit={recap} aria-busy={busy} aria-labelledby="recap-heading" hidden={!recapping}>
      <h2 id="recap-heading" tabIndex={-1}>What moved forward?</h2>
      <fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Session recap</legend>
        <label>Outcome<select value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}><option>Finished</option><option>Made progress</option><option>Blocked</option></select></label>
        <label>Your contribution<textarea name="contribution" required maxLength={4000} /></label>
        <label>{nextStepLabel}<input name="nextStep" required={needsNextStep} maxLength={2000} /></label>
        <label>Evidence link · optional<input name="evidence" type="url" placeholder="https://…" maxLength={2000} /></label>
        <div className="row"><button type="submit">{busy ? "Saving…" : "Save session"}</button><button type="button" className="secondary" onClick={() => showRecap(false)}>Back to session</button></div>
      </fieldset>
    </form>
  </section>;
}
