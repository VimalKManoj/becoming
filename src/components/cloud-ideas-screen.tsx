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
const field = (data: FormData, name: string) => String(data.get(name) || "").trim();

function readableError(error: unknown) {
  if (!(error instanceof Error)) return "Could not save. Please try again.";
  return error.message.match(/Uncaught ConvexError: ([^\n]+)/)?.[1] || error.message.split("\n")[0] || "Could not save. Please try again.";
}

export function CloudIdeasScreen() {
  const { data: session, isPending: sessionPending, error: sessionError, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (sessionPending || (session && isLoading)) return <Shell><p role="status">Opening your private ideas…</p></Shell>;
  if (sessionError) return <Shell><div className="stack"><p role="alert">Could not check your session.</p><button onClick={() => void refetch()}>Try again</button></div></Shell>;
  if (!session) return <Shell><section className="panel empty stack"><h1>Sign in to keep your ideas.</h1><p className="muted">Your notebook belongs to your Becoming account.</p><Link className="button-link" href="/account">Open account</Link></section></Shell>;
  if (!isAuthenticated) return <Shell><div className="stack"><p role="status">Confirming your account with Convex…</p><Link href="/account">Check account status</Link></div></Shell>;
  return <Shell><Ideas /></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceSidebar section="ideas" northStar="Build a body of work that shows thoughtful design engineering." />
    <main id="main" className="main">
      <header className="topbar"><span className="eyebrow">Personal workspace / ideas</span><div className="row"><span className="badge">Cloud workspace</span><Link href="/account">Account</Link></div></header>
      <p className="mode-note">Ideas are private in Convex. Capturing one does not add a task to Today.</p>
      {children}
    </main>
  </div>;
}

function Ideas() {
  const { results, status, loadMore } = usePaginatedQuery(api.ideas.listPage, {}, { initialNumItems: 12 });
  const createIdea = useMutation(api.ideas.create);
  const updateNotes = useMutation(api.ideas.updateNotes);
  const activateIdea = useMutation(api.ideas.activate);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"ideas"> | null>(null);
  const [activatingId, setActivatingId] = useState<Id<"ideas"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editing = results.find(idea => idea._id === editingId);
  const activating = results.find(idea => idea._id === activatingId);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(""); setMessage("");
    try {
      await createIdea({ title: field(data, "title"), lane: field(data, "lane") as Lane, notes: field(data, "notes") });
      form.reset(); setAdding(false); setMessage("Idea saved. It stays in your notebook until you make it active.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await updateNotes({ ideaId: editingId, notes: field(data, "notes") });
      setEditingId(null); setMessage("Brainstorm saved.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activatingId) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try {
      await activateIdea({
        ideaId: activatingId,
        title: field(data, "title"),
        minutes: Number(data.get("minutes")),
        energy: Number(data.get("energy")),
        doneWhen: field(data, "doneWhen"),
      });
      setActivatingId(null); setMessage("A linked Ready task is now in Work and can appear in Today.");
    } catch (caught) { setError(readableError(caught)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="heading"><div><p className="eyebrow">Room for possibility</p><h1>Give your ideas somewhere to grow.</h1><p className="muted">Save a thought or paste a scheduled assignment. Make it active only when you choose.</p></div><button onClick={() => { setAdding(true); setEditingId(null); setActivatingId(null); setError(""); }}>Capture idea</button></div>
    {message && <div role="status" className="notice">{message}<button className="text-button" onClick={() => setMessage("")}>Dismiss</button></div>}
    {error && <div role="alert" className="notice">{error}<button className="text-button" onClick={() => setError("")}>Dismiss</button></div>}
    {adding && <form className="panel stack" onSubmit={create} aria-busy={busy}><h2>Capture an idea</h2><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Idea details</legend>
      <label>Idea title<input name="title" required maxLength={160} /></label>
      <label>Lane<select name="lane">{lanes.map(lane => <option key={lane}>{lane}</option>)}</select></label>
      <label>Notes or pasted assignment<textarea name="notes" maxLength={10000} /></label>
      <div className="row"><button type="submit">{busy ? "Saving…" : "Save idea"}</button><button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button></div>
    </fieldset></form>}
    {editing && <form className="panel stack" key={editing._id} onSubmit={saveNotes} aria-busy={busy}><h2>Brainstorm: {editing.title}</h2><p className="muted">Who is it for? What makes it distinctive? What is the smallest useful version?</p><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Brainstorm notes</legend>
      <label>Notes and references<textarea name="notes" defaultValue={editing.notes} maxLength={10000} /></label>
      <div className="row"><button type="submit">{busy ? "Saving…" : "Save notes"}</button><button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button></div>
    </fieldset></form>}
    {activating && !activating.taskId && <form className="panel stack" key={activating._id} onSubmit={activate} aria-busy={busy}><h2>Give {activating.title} a first step</h2><p className="muted">This creates one Ready {activating.lane.toLowerCase()} task in Work.</p><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">First task</legend>
      <label>Task title<input name="title" required maxLength={160} defaultValue={`Explore ${activating.title}`} /></label>
      <div className="grid"><label>Minutes<input name="minutes" type="number" min="5" max="240" step="1" required defaultValue={30} /></label><label>Energy<select name="energy" defaultValue="2"><option value="1">Low</option><option value="2">Steady</option><option value="3">High</option></select></label></div>
      <label>Done when<textarea name="doneWhen" required maxLength={1000} /></label>
      <div className="row"><button type="submit">{busy ? "Creating…" : "Make active"}</button><button type="button" className="secondary" onClick={() => setActivatingId(null)}>Cancel</button></div>
    </fieldset></form>}
    {status === "LoadingFirstPage" ? <p role="status" className="panel">Loading your ideas…</p> : results.length === 0 ? <section className="panel empty"><h2>Your notebook is ready.</h2><p className="muted space">Capture an idea without committing your evening to it.</p></section> : <div className="grid space">{results.map(idea => <article className="panel notebook stack" key={idea._id}>
      <span className="badge">{idea.lane}</span><h2>{idea.title}</h2><p className="preserve">{idea.notes || "A thought is enough to start."}</p>
      <div className="row"><button className="secondary" onClick={() => { setEditingId(idea._id); setActivatingId(null); setAdding(false); setError(""); }}>Brainstorm</button>{idea.taskId ? <Link href="/work">Linked task in Work →</Link> : <button onClick={() => { setActivatingId(idea._id); setEditingId(null); setAdding(false); setError(""); }}>Make active</button>}</div>
    </article>)}</div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="secondary space" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>{status === "LoadingMore" ? "Loading more…" : "Load more ideas"}</button>}
  </>;
}
