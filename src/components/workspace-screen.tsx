"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useWorkspace, updateWorkspace } from "@/lib/local-store";
import { finishSession, lanes, weekSessions } from "@/domain/workspace";
import { AuthProvider } from "@/components/auth-provider";
import { CloudWorkScreen } from "@/components/cloud-work-screen";
import { CloudTodayScreen } from "@/components/cloud-today-screen";
import { CloudIdeasScreen } from "@/components/cloud-ideas-screen";
import { WorkspaceSidebar, type WorkspaceSection } from "@/components/workspace-sidebar";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();

export function WorkspaceScreen({ section }: { section: WorkspaceSection }) {
  if (section === "work") return <AuthProvider><CloudWorkScreen /></AuthProvider>;
  if (section === "today") return <AuthProvider><CloudTodayScreen /></AuthProvider>;
  if (section === "ideas") return <AuthProvider><CloudIdeasScreen /></AuthProvider>;
  return <LocalWorkspaceScreen section={section} />;
}

function LocalWorkspaceScreen({ section }: { section: Exclude<WorkspaceSection, "today" | "work" | "ideas"> }) {
  const { data: workspace, error } = useWorkspace();
  const [message, setMessage] = useState("");
  const [recapping, setRecapping] = useState(false);
  const [now] = useState(() => Date.now());
  function act(action: () => void, success = "Saved.") {
    try { action(); setMessage(success); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save. Please try again."); }
  }
  if (!workspace) return <main className="standalone panel" aria-live="polite"><h1>{error ? "Your data needs attention." : "Opening your workspace…"}</h1><p>{error || "Getting your next useful step ready."}</p></main>;
  const w = workspace;
  const weekly = weekSessions(w, now);
  const active = w.activeSession;
  const activeTask = active && w.tasks.find(t => t.id === active.taskId);
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
