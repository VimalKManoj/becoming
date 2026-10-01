"use client";

import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Notice } from "@/components/notice";
import { readableError } from "@/lib/errors";

const lanes = ["Projects", "Showcases", "Writing"] as const;
type Lane = typeof lanes[number];
const views = [
  { id: "active", label: "Active", empty: "Nothing active yet. Add a task, or make an idea active." },
  { id: "blocked", label: "Blocked", empty: "Nothing is blocked." },
  { id: "done", label: "Done", empty: "No finished tasks yet." },
  { id: "archived", label: "Archived", empty: "Nothing archived. Archiving hides a task without deleting its history." },
] as const;
type View = typeof views[number]["id"];
type Task = FunctionReturnType<typeof api.tasks.listPage>["page"][number];
type Panel = { taskId: Id<"tasks">; kind: "edit" | "unblock" | "reopen" };
type Message = { text: string; undo?: { taskId: Id<"tasks">; title: string } };

const formText = (data: FormData, name: string) => String(data.get(name) || "").trim();
// A callback ref runs when the element mounts: focus lands in a form the moment it opens.
const focusOnMount = (node: HTMLElement | null) => node?.focus();
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

export function CloudWorkScreen() {
  const [view, setView] = useState<View>("active");
  const { results, status, loadMore } = usePaginatedQuery(api.tasks.listPage, { view }, { initialNumItems: 24 });
  const createTask = useMutation(api.tasks.create);
  const updateTask = useMutation(api.tasks.update);
  const unblockTask = useMutation(api.tasks.unblock);
  const reopenTask = useMutation(api.tasks.reopen);
  const archiveTask = useMutation(api.tasks.archive);
  const restoreTask = useMutation(api.tasks.restore);
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState("");
  const current = views.find(item => item.id === view)!;
  // Work already in motion comes first within each lane; otherwise newest first.
  const ordered = [...results].sort((a, b) => Number(b.status === "In progress") - Number(a.status === "In progress"));

  async function save(action: () => Promise<unknown>, success: Message) {
    setBusy(true); setError(""); setMessage(null);
    try { await action(); setMessage(success); return true; }
    catch (caught) { setError(readableError(caught)); return false; }
    finally { setBusy(false); }
  }

  function close(taskId: Id<"tasks">) {
    setPanel(null); setError("");
    focusById(`task-${taskId}`);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = taskValues(new FormData(form));
    if (await save(() => createTask(values), { text: "Task added. It's Ready and can appear in Today." })) {
      form.reset(); setAdding(false); setView("active");
    }
  }

  async function update(event: FormEvent<HTMLFormElement>, task: Task) {
    event.preventDefault();
    const values = taskValues(new FormData(event.currentTarget));
    if (await save(() => updateTask({ taskId: task._id, ...values }), { text: "Task changes saved." })) close(task._id);
  }

  // Unblocking and reopening both ask for the step that moves the task forward again.
  async function moveOn(event: FormEvent<HTMLFormElement>, task: Task, kind: "unblock" | "reopen") {
    event.preventDefault();
    const nextStep = formText(new FormData(event.currentTarget), "nextStep");
    const saved = kind === "unblock"
      ? await save(() => unblockTask({ taskId: task._id, nextStep }), { text: `“${task.title}” is Ready again and can appear in Today.` })
      : await save(() => reopenTask({ taskId: task._id, nextStep }), { text: `“${task.title}” is back in progress.` });
    if (saved) { setPanel(null); focusById("work-notice"); }
  }

  async function archive(task: Task) {
    if (await save(() => archiveTask({ taskId: task._id }), { text: `Archived “${task.title}”. Its history is kept.`, undo: { taskId: task._id, title: task.title } })) focusById("work-notice");
  }

  async function restore(taskId: Id<"tasks">, title: string) {
    if (await save(() => restoreTask({ taskId }), { text: `Restored “${title}”.` })) focusById("work-notice");
  }

  const undo = message?.undo;

  return <>
    <div className="heading"><div><p className="eyebrow">Your commitments</p><h1>Small steps. Substantial work.</h1><p className="muted">Plan, unblock and finish the work you’ve chosen.</p></div><button onClick={() => { setAdding(true); setPanel(null); setError(""); }}>Add task</button></div>
    {message && <Notice id="work-notice" onDismiss={() => setMessage(null)} action={undo ? { label: "Undo", onClick: () => void restore(undo.taskId, undo.title) } : undefined}>{message.text}</Notice>}
    {error && <Notice tone="alert" onDismiss={() => setError("")}>{error}</Notice>}
    {adding && <TaskForm title="Add a useful next step" busy={busy} onSubmit={create} onCancel={() => { setAdding(false); setError(""); }} />}
    <div className="row space" role="group" aria-label="Show tasks">{views.map(item => <button key={item.id} className="chip" aria-pressed={view === item.id} onClick={() => { setView(item.id); setPanel(null); }}>{item.label}</button>)}</div>
    {status === "LoadingFirstPage" ? <p role="status" className="panel space">Loading your tasks…</p>
      : results.length === 0 ? <section className="panel empty space"><p className="muted">{current.empty}</p></section>
        : <div className="lanes space">{lanes.map(lane => {
          const laneTasks = ordered.filter(task => task.lane === lane);
          return <section className="lane" key={lane}><h2>{lane}</h2>
            {laneTasks.length === 0 && <p className="small muted space">Nothing here.</p>}
            {laneTasks.map(task => {
              const open = panel?.taskId === task._id ? panel.kind : null;
              return <article className="panel stack space" key={task._id} id={`task-${task._id}`} tabIndex={-1} aria-label={task.title}>
                {open === "edit" ? <TaskForm title={`Edit “${task.title}”`} busy={busy} task={task} onSubmit={event => void update(event, task)} onCancel={() => close(task._id)} /> : <>
                  <span className="badge">{task.status === "Archived" ? `Archived · was ${task.archivedFrom ?? "Ready"}` : task.status}</span>
                  <h3>{task.title}</h3><p className="muted">{task.minutes} min · Energy {task.energy}/3</p><p>{task.doneWhen}</p>
                  {task.nextStep && <p className="small">{task.status === "Blocked" ? "Blocked by" : "Next"}: {task.nextStep}</p>}
                  {task.smallerStep && <div className="rule"><p className="eyebrow">Smaller step · {task.smallerMinutes} min</p><p>{task.smallerStep}</p><p className="small">Done when: {task.smallerDone}</p></div>}
                  {open === "unblock" || open === "reopen"
                    ? <NextStepForm kind={open} busy={busy} onSubmit={event => void moveOn(event, task, open)} onCancel={() => close(task._id)} />
                    : <div className="row">
                      {task.status === "Blocked" && <button disabled={busy} onClick={() => setPanel({ taskId: task._id, kind: "unblock" })}>Unblock</button>}
                      {task.status === "Done" && <button disabled={busy} onClick={() => setPanel({ taskId: task._id, kind: "reopen" })}>Reopen</button>}
                      {task.status !== "Done" && task.status !== "Archived" && <button className="secondary" disabled={busy} onClick={() => { setPanel({ taskId: task._id, kind: "edit" }); setAdding(false); setError(""); }}>Edit task</button>}
                      {task.status === "Archived"
                        ? <button className="secondary" disabled={busy} onClick={() => void restore(task._id, task.title)}>Restore</button>
                        : <button className="secondary" disabled={busy} onClick={() => void archive(task)}>Archive</button>}
                    </div>}
                </>}
              </article>;
            })}
          </section>;
        })}</div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button className="secondary space" disabled={status === "LoadingMore"} onClick={() => loadMore(24)}>{status === "LoadingMore" ? "Loading more…" : "Load more tasks"}</button>}
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
  return <form className="panel stack" onSubmit={onSubmit} aria-busy={busy} aria-label={title}>
    <h2>{title}</h2>
    <fieldset className="auth-fields stack" disabled={busy}>
      <legend className="sr-only">Task details</legend>
      <label>Task title<input ref={focusOnMount} name="title" required maxLength={160} defaultValue={task?.title} /></label>
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

function NextStepForm({ kind, busy, onSubmit, onCancel }: { kind: "unblock" | "reopen"; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="stack" onSubmit={onSubmit} aria-busy={busy}>
    <fieldset className="auth-fields stack" disabled={busy}>
      <legend className="sr-only">{kind === "unblock" ? "Unblock this task" : "Reopen this task"}</legend>
      <label>{kind === "unblock" ? "What's the next step now that it's unblocked?" : "What's the next step?"}<textarea ref={focusOnMount} name="nextStep" required maxLength={2000} /></label>
      <div className="row"><button type="submit">{busy ? "Saving…" : kind === "unblock" ? "Mark as ready" : "Reopen task"}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
