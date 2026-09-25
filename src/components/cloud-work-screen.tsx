"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

const lanes = ["Projects", "Showcases", "Writing"] as const;
type Lane = typeof lanes[number];

function formText(data: FormData, name: string) {
  return String(data.get(name) || "").trim();
}

function readableError(error: unknown) {
  if (!(error instanceof Error)) return "Could not save the task. Please try again.";
  const convexMessage = error.message.match(/Uncaught ConvexError: ([^\n]+)/)?.[1];
  return convexMessage || error.message.split("\n")[0] || "Could not save the task. Please try again.";
}

export function CloudWorkScreen() {
  const { data: session, isPending: sessionPending, error: sessionError, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (sessionPending || (session && isLoading)) return <CloudWorkShell><p role="status">Opening your private workspace…</p></CloudWorkShell>;
  if (sessionError) return <CloudWorkShell><div className="stack"><p role="alert">Could not check your session.</p><button onClick={() => void refetch()}>Try again</button></div></CloudWorkShell>;
  if (!session) return <CloudWorkShell><section className="panel empty stack"><h1>Sign in to see your work.</h1><p className="muted">Cloud tasks are private to your Becoming account.</p><Link className="button-link" href="/account">Open account</Link></section></CloudWorkShell>;
  if (!isAuthenticated) return <CloudWorkShell><div className="stack"><p role="status">Your account session is active. Confirming it with Convex…</p><Link href="/account">Check account status</Link></div></CloudWorkShell>;

  return <CloudWorkShell><CloudTasks /></CloudWorkShell>;
}

function CloudWorkShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceSidebar section="work" northStar="Build a body of work that shows thoughtful design engineering." />
    <main id="main" className="main">
      <header className="topbar"><span className="eyebrow">Personal workspace / work</span><div className="row"><span className="badge">Cloud workspace</span><Link href="/account">Account</Link></div></header>
      <p className="mode-note">Saved privately in Convex · changes update across signed-in tabs.</p>
      {children}
    </main>
  </div>;
}

function CloudTasks() {
  const { results, status, loadMore } = usePaginatedQuery(api.tasks.listPage, {}, { initialNumItems: 12 });
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tasks"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editing = results.find(task => task._id === editingId);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await createTask(taskValues(data));
      form.reset(); setAdding(false); setMessage("Task saved to your private cloud workspace.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await updateTask({ taskId: editingId, ...taskValues(data) });
      setEditingId(null); setMessage("Task changes saved.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="heading"><div><p className="eyebrow">Your commitments</p><h1>Small steps. Substantial work.</h1><p className="muted">These tasks belong to your signed-in account.</p></div><button onClick={() => { setAdding(true); setEditingId(null); setError(""); }}>Add task</button></div>
    {message && <div role="status" className="notice">{message}<button className="text-button" onClick={() => setMessage("")}>Dismiss</button></div>}
    {error && <div role="alert" className="notice">{error}<button className="text-button" onClick={() => setError("")}>Dismiss</button></div>}
    {adding && <TaskForm title="Add a useful next step" busy={busy} onSubmit={create} onCancel={() => { setAdding(false); setError(""); }} />}
    {editing && <TaskForm key={editing._id} title="Edit this task" busy={busy} task={editing} onSubmit={update} onCancel={() => { setEditingId(null); setError(""); }} />}
    {status === "LoadingFirstPage" ? <p role="status" className="panel">Loading your tasks…</p> : results.length === 0 ? <section className="panel empty"><h2>Your cloud workspace is ready.</h2><p className="muted space">Add the first task you want to move forward.</p></section> : <div className="lanes space">
      {lanes.map(lane => <section className="lane" key={lane}><h2>{lane}</h2>{results.filter(task => task.lane === lane).map(task => <article className="panel stack space" key={task._id}>
        <span className="badge">{task.status}</span><h3>{task.title}</h3><p className="muted">{task.minutes} min · Energy {task.energy}/3</p><p>{task.doneWhen}</p>{task.nextStep && <p className="small">Next: {task.nextStep}</p>}
        {task.smallerStep && <div className="rule"><p className="eyebrow">Smaller step · {task.smallerMinutes} min</p><p>{task.smallerStep}</p><p className="small">Done when: {task.smallerDone}</p></div>}
        <button className="secondary" onClick={() => { setEditingId(task._id); setAdding(false); setError(""); }}>Edit task</button>
      </article>)}</section>)}
    </div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="secondary space" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>{status === "LoadingMore" ? "Loading more…" : "Load more tasks"}</button>}
  </>;
}

function taskValues(data: FormData) {
  const smallerStep = formText(data, "smallerStep");
  const smallerDone = formText(data, "smallerDone");
  const smallerMinutes = formText(data, "smallerMinutes");
  return {
    title: formText(data, "title"),
    lane: formText(data, "lane") as Lane,
    minutes: Number(data.get("minutes")),
    energy: Number(data.get("energy")),
    doneWhen: formText(data, "doneWhen"),
    ...(smallerStep ? { smallerStep } : {}),
    ...(smallerDone ? { smallerDone } : {}),
    ...(smallerMinutes ? { smallerMinutes: Number(smallerMinutes) } : {}),
  };
}

type EditableTask = {
  title: string;
  lane: Lane;
  minutes: number;
  energy: number;
  doneWhen: string;
  smallerStep?: string;
  smallerDone?: string;
  smallerMinutes?: number;
};

function TaskForm({ title, task, busy, onSubmit, onCancel }: { title: string; task?: EditableTask; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="panel stack" onSubmit={onSubmit} aria-busy={busy}>
    <h2>{title}</h2>
    <fieldset className="auth-fields stack" disabled={busy}>
      <legend className="sr-only">Task details</legend>
      <label>Task title<input name="title" required maxLength={160} defaultValue={task?.title} /></label>
      <div className="grid">
        <label>Lane<select name="lane" defaultValue={task?.lane || "Projects"}>{lanes.map(lane => <option key={lane}>{lane}</option>)}</select></label>
        <label>Minutes<input name="minutes" type="number" min="5" max="240" step="5" required defaultValue={task?.minutes || 30} /></label>
        <label>Energy<select name="energy" defaultValue={task?.energy || 2}><option value="1">Low</option><option value="2">Steady</option><option value="3">High</option></select></label>
      </div>
      <label>Done when<textarea name="doneWhen" required maxLength={1000} defaultValue={task?.doneWhen} /></label>
      <fieldset className="auth-fields stack"><legend>Optional smaller step</legend><p className="small muted">Define all three fields if this task needs a useful short session.</p>
        <label>Smaller action<input name="smallerStep" maxLength={1000} defaultValue={task?.smallerStep} /></label>
        <div className="grid"><label>Smaller minutes<input name="smallerMinutes" type="number" min="5" max="240" step="1" defaultValue={task?.smallerMinutes} /></label><label>Smaller step done when<input name="smallerDone" maxLength={1000} defaultValue={task?.smallerDone} /></label></div>
      </fieldset>
      <div className="row"><button type="submit">{busy ? "Saving…" : "Save task"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
