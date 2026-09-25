"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useWorkspace, updateWorkspace } from "@/lib/local-store";
import { finishSession, ideaSchema, lanes, taskSchema, weekSessions, type Idea } from "@/domain/workspace";
import { AuthProvider } from "@/components/auth-provider";
import { CloudWorkScreen } from "@/components/cloud-work-screen";
import { CloudTodayScreen } from "@/components/cloud-today-screen";
import { WorkspaceSidebar, type WorkspaceSection } from "@/components/workspace-sidebar";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();

export function WorkspaceScreen({ section }: { section: WorkspaceSection }) {
  if (section === "work") return <AuthProvider><CloudWorkScreen /></AuthProvider>;
  if (section === "today") return <AuthProvider><CloudTodayScreen /></AuthProvider>;
  return <LocalWorkspaceScreen section={section} />;
}

function LocalWorkspaceScreen({ section }: { section: Exclude<WorkspaceSection, "today" | "work"> }) {
  const { data: workspace, error } = useWorkspace();
  const [message, setMessage] = useState("");
  const [recapping, setRecapping] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [activatingIdea, setActivatingIdea] = useState<Idea | null>(null);
  const [adding, setAdding] = useState(false);
  const [now] = useState(() => Date.now());
  function act(action: () => void, success = "Saved.") {
    try { action(); setMessage(success); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save. Please try again."); }
  }
  if (!workspace) return <main className="standalone panel" aria-live="polite"><h1>{error ? "Your data needs attention." : "Opening your workspace…"}</h1><p>{error || "Getting your next useful step ready."}</p></main>;
  const w = workspace;
  const weekly = weekSessions(w, now);
  const active = w.activeSession;
  const activeTask = active && w.tasks.find(t => t.id === active.taskId);
  function addIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const d = new FormData(form);
    act(() => {
      const idea = ideaSchema.parse({ id: crypto.randomUUID(), title: text(d, "title"), lane: text(d, "lane"), notes: text(d, "notes") });
      updateWorkspace(current => ({ ...current, ideas: [...current.ideas, idea] })); setAdding(false);
    }, "Idea saved. Activate it when you are ready.");
  }
  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const d = new FormData(event.currentTarget);
    act(() => {
      const task = taskSchema.parse({ id: crypto.randomUUID(), title: text(d, "title"), lane: text(d, "lane"), project: activatingIdea?.title || text(d, "project"), minutes: Number(d.get("minutes")), energy: Number(d.get("energy")), status: "Ready", doneWhen: text(d, "doneWhen"), nextStep: text(d, "doneWhen"), dependencies: [], createdAt: Date.now() });
      updateWorkspace(current => ({ ...current, tasks: [...current.tasks, task], ideas: current.ideas.map(i => i.id === activatingIdea?.id ? { ...i, taskId: task.id } : i) }));
      setAdding(false); setActivatingIdea(null);
    }, "A concrete next step is ready for Today.");
  }
  const taskForm = <form className="panel stack" onSubmit={addTask}><h2>{activatingIdea ? "Give this idea a first step" : "Add a useful next step"}</h2><label>Task title<input name="title" required maxLength={160} defaultValue={activatingIdea ? `Explore ${activatingIdea.title}` : ""} /></label><div className="grid"><label>Lane<select name="lane" defaultValue={activatingIdea?.lane}>{lanes.map(l => <option key={l}>{l}</option>)}</select></label><label>Project or collection<input name="project" maxLength={160} defaultValue={activatingIdea?.title} /></label><label>Minutes<select name="minutes" defaultValue="30">{[15, 30, 60, 90].map(n => <option key={n}>{n}</option>)}</select></label><label>Energy<select name="energy" defaultValue="2"><option value="1">Low</option><option value="2">Steady</option><option value="3">High</option></select></label></div><label>Done when<textarea name="doneWhen" required maxLength={1000} /></label><div className="row"><button type="submit">Add to ready work</button><button type="button" className="secondary" onClick={() => { setAdding(false); setActivatingIdea(null); }}>Cancel</button></div></form>;
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceSidebar section={section} northStar={w.motive} />
    <main id="main" className="main"><header className="topbar"><span className="eyebrow">Personal workspace / {section}</span><div className="row"><span className="badge">Local learning mode</span><Link href="/account">Account</Link></div></header>
    <p className="mode-note">Saved in this browser · Convex connection is the next learning phase.</p>
    {message && <div role="status" className="notice">{message}<button className="text-button" onClick={() => setMessage("")}>Dismiss</button></div>}
    {active && activeTask ? <section className="session stack"><PageHeading eyebrow="Focused session" title={active.smaller ? activeTask.smallerStep || activeTask.title : activeTask.title} sub="One thing deserves your attention right now." />{!recapping ? <div className="focus stack"><span className="badge">{activeTask.lane}</span><h2>Your stopping point</h2><p>{active.smaller ? activeTask.smallerDone : activeTask.doneWhen}</p><div className="rule"><p className="eyebrow">Pick up here</p><p>{activeTask.nextStep}</p></div><div className="row"><button onClick={() => setRecapping(true)}>Finish & reflect <ArrowRight size={16} /></button><button className="secondary" onClick={() => act(() => updateWorkspace(current => ({ ...current, activeSession: null })), "Session cancelled. No credit recorded.")}>Cancel session</button></div></div> : <form className="panel stack" onSubmit={event => {
      event.preventDefault(); const d = new FormData(event.currentTarget);
      act(() => {
        updateWorkspace(current => finishSession(current, { id: active.id, taskId: active.taskId, title: active.smaller ? activeTask.smallerStep || activeTask.title : activeTask.title, lane: activeTask.lane, outcome: text(d, "outcome") as "Finished", note: text(d, "note"), nextStep: text(d, "nextStep"), evidence: text(d, "evidence"), startedAt: active.startedAt, endedAt: Date.now(), smaller: active.smaller }));
        setRecapping(false);
      }, "Session saved. That contribution counts.");
    }}><h2>What moved forward?</h2><label>Outcome<select name="outcome"><option>Finished</option><option>Made progress</option><option>Blocked</option></select></label><label>Your contribution<textarea name="note" required maxLength={4000} /></label><label>Next step or blocker<input name="nextStep" maxLength={2000} /></label><label>Evidence link · optional<input name="evidence" type="url" placeholder="https://…" /></label><div className="row"><button type="submit">Save session</button><button type="button" className="secondary" onClick={() => setRecapping(false)}>Back to session</button></div></form>}</section> : <>
    {section === "ideas" && <><PageHeading eyebrow="Room for possibility" title="Give your ideas somewhere to grow." sub="Saving an idea does not commit your evening." action={<button onClick={() => setAdding(true)}>Capture idea</button>} />{adding && <form className="panel stack" onSubmit={addIdea}><label>Idea title<input name="title" required maxLength={160} /></label><label>Lane<select name="lane">{lanes.map(l => <option key={l}>{l}</option>)}</select></label><label>Notes or pasted assignment<textarea name="notes" maxLength={10000} /></label><div className="row"><button type="submit">Save idea</button><button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button></div></form>}{editingIdea && <form className="panel stack" onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); act(() => { updateWorkspace(current => ({ ...current, ideas: current.ideas.map(i => i.id === editingIdea.id ? { ...i, notes: text(d, "notes") } : i) })); setEditingIdea(null); }, "Brainstorm saved."); }}><h2>{editingIdea.title}</h2><p className="muted">Who is it for? What makes it distinctive? What is the smallest useful version?</p><label>Brainstorm and references<textarea name="notes" defaultValue={editingIdea.notes} maxLength={10000} /></label><div className="row"><button type="submit">Save notes</button><button type="button" className="secondary" onClick={() => setEditingIdea(null)}>Cancel</button></div></form>}{activatingIdea && taskForm}<div className="grid space">{w.ideas.map(i => <article className="panel notebook stack" key={i.id}><span className="badge">{i.lane}</span><h2>{i.title}</h2><p className="preserve">{i.notes || "A thought is enough to start."}</p><div className="row"><button className="secondary" onClick={() => setEditingIdea(i)}>Brainstorm</button>{i.taskId ? <span className="muted">Linked to active work</span> : <button onClick={() => setActivatingIdea(i)}>Make active</button>}</div></article>)}</div></>}
    {section === "proof" && <><PageHeading eyebrow="Your body of work" title="Make the progress visible." sub="Evidence saved during a session stays connected to its story." /><div className="grid">{w.sessions.filter(s => s.evidence).map(s => <article className="panel stack" key={s.id}><span className="badge">{s.lane}</span><h2>{s.title}</h2><p className="preserve">{s.note}</p><a href={s.evidence} target="_blank" rel="noreferrer">Open evidence ↗</a><span className="small">Captured {new Date(s.endedAt).toLocaleDateString()}</span></article>)}</div>{!w.sessions.some(s => s.evidence) && <Empty title="Your first proof belongs here." text="Add a demo, screenshot, or writing link when you finish a session." />}</>}
    {section === "journey" && <><PageHeading eyebrow="Becoming a design engineer" title="Look at what is taking shape." sub="Your own contributions, without invented progress." /><div className="grid"><section className="panel"><p className="eyebrow">This week</p><p className="big-number">{weekly.length} / {w.weeklyTarget}</p><p>meaningful sessions</p><progress value={Math.min(weekly.length, w.weeklyTarget)} max={w.weeklyTarget} aria-label="Weekly session progress" /></section><section className="panel"><h2>Balance across your practice</h2>{lanes.map(l => <div className="list-row" key={l}><span>{l}</span><span>{w.sessions.filter(s => s.lane === l).length} sessions</span></div>)}</section></div><section className="panel space"><h2>Your recent steps</h2>{w.sessions.slice().reverse().map(s => <article key={s.id} className="list-row"><div><h3>{s.title}</h3><p className="preserve">{s.note}</p><p className="small">{s.lane} · {new Date(s.endedAt).toLocaleDateString()}</p></div><span className="badge">{s.outcome}</span></article>)}{!w.sessions.length && <p className="muted space">Finish your first session to start your history.</p>}</section></>}
    {section === "settings" && <><PageHeading eyebrow="Make it yours" title="A rhythm you can return to." sub="Your ambition stays steady. Your capacity can change." /><form className="panel stack" onSubmit={event => { event.preventDefault(); const d = new FormData(event.currentTarget); act(() => updateWorkspace(current => ({ ...current, motive: text(d, "motive") })), "Your north star is updated."); }}><label>Your motive<textarea name="motive" required maxLength={1000} defaultValue={w.motive} /></label><p className="muted">Learning baseline: {w.weeklyTarget} sessions/week · {w.timezone}. Historical commitments and editable targets arrive in phase 4.</p><div><button type="submit">Save motive</button></div></form><section className="panel space"><h2>Keep a copy of your work</h2><p className="muted space">Download a versioned backup of this browser workspace. Restore is planned for phase 4.</p><button className="secondary space" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(w, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "form-workspace-v1.json"; anchor.click(); URL.revokeObjectURL(url); }}>Export workspace</button></section></>}
    </>}
    </main>
  </div>;
}
function PageHeading({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub: string; action?: React.ReactNode }) {
  return <div className="heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{sub}</p></div>{action}</div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <section className="panel empty"><h2>{title}</h2><p className="muted space">{text}</p></section>; }
