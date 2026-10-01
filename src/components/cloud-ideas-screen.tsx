"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Notice } from "@/components/notice";
import { readableError } from "@/lib/errors";

const lanes = ["Projects", "Showcases", "Writing"] as const;
type Lane = typeof lanes[number];
type View = "notebook" | "archived";
type Panel = { ideaId: Id<"ideas">; kind: "brainstorm" | "activate" };
type Message = { text: string; undo?: Id<"ideas"> };

const field = (data: FormData, name: string) => String(data.get(name) || "").trim();
// A callback ref runs when the element mounts: focus lands in a form the moment it opens.
const focusOnMount = (node: HTMLElement | null) => node?.focus();
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

export function CloudIdeasScreen() {
  const [view, setView] = useState<View>("notebook");
  const { results, status, loadMore } = usePaginatedQuery(api.ideas.listPage, { view }, { initialNumItems: 12 });
  const createIdea = useMutation(api.ideas.create);
  const updateNotes = useMutation(api.ideas.updateNotes);
  const activateIdea = useMutation(api.ideas.activate);
  const archiveIdea = useMutation(api.ideas.archive);
  const restoreIdea = useMutation(api.ideas.restore);
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState("");

  async function save(action: () => Promise<unknown>, success: Message) {
    setBusy(true); setError(""); setMessage(null);
    try { await action(); setMessage(success); return true; }
    catch (caught) { setError(readableError(caught)); return false; }
    finally { setBusy(false); }
  }

  function close(ideaId: Id<"ideas">) {
    setPanel(null); setError("");
    focusById(`idea-${ideaId}`);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const values = { title: field(data, "title"), lane: field(data, "lane") as Lane, notes: field(data, "notes") };
    if (await save(() => createIdea(values), { text: "Idea saved. It stays in your notebook until you make it active." })) {
      form.reset(); setAdding(false); setView("notebook");
    }
  }

  async function saveNotes(event: FormEvent<HTMLFormElement>, ideaId: Id<"ideas">) {
    event.preventDefault();
    const notes = field(new FormData(event.currentTarget), "notes");
    if (await save(() => updateNotes({ ideaId, notes }), { text: "Brainstorm saved." })) close(ideaId);
  }

  async function activate(event: FormEvent<HTMLFormElement>, ideaId: Id<"ideas">) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { ideaId, title: field(data, "title"), minutes: Number(data.get("minutes")), energy: Number(data.get("energy")), doneWhen: field(data, "doneWhen") };
    if (await save(() => activateIdea(values), { text: "A linked Ready task is now in Work and can appear in Today." })) close(ideaId);
  }

  async function archive(ideaId: Id<"ideas">, title: string) {
    if (await save(() => archiveIdea({ ideaId }), { text: `Archived “${title}”. Its notes are kept.`, undo: ideaId })) focusById("ideas-notice");
  }

  async function restore(ideaId: Id<"ideas">) {
    if (await save(() => restoreIdea({ ideaId }), { text: "Restored to your notebook." })) focusById("ideas-notice");
  }

  const undo = message?.undo;

  return <>
    <div className="heading"><div><p className="eyebrow">Room for possibility</p><h1>Give your ideas somewhere to grow.</h1><p className="muted">Save a thought or paste a scheduled assignment. Make it active only when you choose.</p></div><button onClick={() => { setAdding(true); setPanel(null); setError(""); }}>Capture idea</button></div>
    {message && <Notice id="ideas-notice" onDismiss={() => setMessage(null)} action={undo ? { label: "Undo", onClick: () => void restore(undo) } : undefined}>{message.text}</Notice>}
    {error && <Notice tone="alert" onDismiss={() => setError("")}>{error}</Notice>}
    {adding && <form className="panel stack" onSubmit={create} aria-busy={busy} aria-label="Capture an idea"><h2>Capture an idea</h2><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Idea details</legend>
      <label>Idea title<input ref={focusOnMount} name="title" required maxLength={160} /></label>
      <label>Lane<select name="lane">{lanes.map(lane => <option key={lane}>{lane}</option>)}</select></label>
      <label>Notes or pasted assignment<textarea name="notes" maxLength={10000} /></label>
      <div className="row"><button type="submit">{busy ? "Saving…" : "Save idea"}</button><button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button></div>
    </fieldset></form>}
    <div className="row space" role="group" aria-label="Show ideas">
      <button className="chip" aria-pressed={view === "notebook"} onClick={() => { setView("notebook"); setPanel(null); }}>Notebook</button>
      <button className="chip" aria-pressed={view === "archived"} onClick={() => { setView("archived"); setPanel(null); }}>Archived</button>
    </div>
    {status === "LoadingFirstPage" ? <p role="status" className="panel space">Loading your ideas…</p>
      : results.length === 0 ? <section className="panel empty space">{view === "notebook" ? <><h2>Your notebook is ready.</h2><p className="muted space">Capture an idea without committing your evening to it.</p></> : <p className="muted">Nothing archived. Archiving moves an idea out of the notebook and keeps its notes.</p>}</section>
        : <div className="grid space">{results.map(idea => {
          const open = panel?.ideaId === idea._id ? panel.kind : null;
          return <article className="panel notebook stack" key={idea._id} id={`idea-${idea._id}`} tabIndex={-1} aria-label={idea.title}>
            <span className="badge">{idea.lane}</span><h2>{idea.title}</h2>
            {open === "brainstorm" ? <form className="stack" onSubmit={event => void saveNotes(event, idea._id)} aria-busy={busy}><p className="muted">Who is it for? What makes it distinctive? What is the smallest useful version?</p><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">Brainstorm notes</legend>
              <label>Notes and references<textarea ref={focusOnMount} name="notes" defaultValue={idea.notes} maxLength={10000} /></label>
              <div className="row"><button type="submit">{busy ? "Saving…" : "Save notes"}</button><button type="button" className="secondary" onClick={() => close(idea._id)}>Cancel</button></div>
            </fieldset></form> : <p className="preserve">{idea.notes || "A thought is enough to start."}</p>}
            {open === "activate" && <form className="stack" onSubmit={event => void activate(event, idea._id)} aria-busy={busy}><h3>Give it a first step</h3><p className="muted">This creates one Ready {idea.lane.toLowerCase()} task in Work.</p><fieldset className="auth-fields stack" disabled={busy}><legend className="sr-only">First task</legend>
              <label>Task title<input ref={focusOnMount} name="title" required maxLength={160} defaultValue={`Explore ${idea.title}`.slice(0, 160)} /></label>
              <div className="grid"><label>Minutes<input name="minutes" type="number" min="5" max="240" step="1" required defaultValue={30} /></label><label>Energy<select name="energy" defaultValue="2"><option value="1">Low</option><option value="2">Steady</option><option value="3">High</option></select></label></div>
              <label>Done when<textarea name="doneWhen" required maxLength={1000} /></label>
              <div className="row"><button type="submit">{busy ? "Creating…" : "Make active"}</button><button type="button" className="secondary" onClick={() => close(idea._id)}>Cancel</button></div>
            </fieldset></form>}
            {!open && <div className="row">
              {view === "archived" ? <button className="secondary" disabled={busy} onClick={() => void restore(idea._id)}>Restore</button> : <>
                <button className="secondary" disabled={busy} onClick={() => { setPanel({ ideaId: idea._id, kind: "brainstorm" }); setAdding(false); setError(""); }}>Brainstorm</button>
                {idea.taskId ? <Link href="/work">Linked task in Work →</Link> : <button disabled={busy} onClick={() => { setPanel({ ideaId: idea._id, kind: "activate" }); setAdding(false); setError(""); }}>Make active</button>}
                <button className="secondary" disabled={busy} onClick={() => void archive(idea._id, idea.title)}>Archive</button>
              </>}
            </div>}
          </article>;
        })}</div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="secondary space" disabled={status === "LoadingMore"} onClick={() => loadMore(12)}>{status === "LoadingMore" ? "Loading more…" : "Load more ideas"}</button>}
  </>;
}
