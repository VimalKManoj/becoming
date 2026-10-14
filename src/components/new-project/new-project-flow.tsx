"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useTaskMove } from "@/components/tasks/use-task-move";
import { readableError } from "@/lib/errors";
import { docCode, kinds, templates, type Kind } from "./templates";

// Work → New project: the owner's Setup design (four steps, a live preview beside them),
// plus what the design left open: a milestone chip opens its editor (rename it, say when it's
// reached, give it tasks and notes), and each phase has optional details (what it does,
// done when, the docs that feed it, notes). Nothing is saved until Create project, which
// makes the whole project in one go (newProject.create).

type Task = { key: string; title: string; minutes: number };
type Ms = { key: string; title: string; doneWhen: string; notes: string; tasks: Task[] };
type Phase = { key: string; name: string; goal: string; doneWhen: string; notes: string; docCodes: string[]; ms: Ms[] };
type Doc = { code: string; title: string; on: boolean };
type Origin = "scratch" | "idea" | "plan";

const MINUTES = [15, 30, 45, 60, 90];
const LABELS = ["Name it", "Docs", "Plan", "First evening"];
const pad = (i: number) => String(i).padStart(2, "0");
const letter = (j: number) => String.fromCharCode(65 + j);
let counter = 0;
const newKey = () => `k${++counter}`;

function fresh(kind: Kind): { docs: Doc[]; phases: Phase[] } {
  const t = templates[kind];
  return {
    docs: t.docs.map(([code, title, on]) => ({ code, title, on })),
    phases: t.phases.map(([name, milestones], i) => ({
      key: newKey(), name, goal: "", doneWhen: "", notes: "", docCodes: [],
      ms: milestones.map((title, j) => ({ key: newKey(), title, doneWhen: "", notes: "", tasks: i === 0 && j === 0 ? t.tasks.map(([tt, minutes]) => ({ key: newKey(), title: tt, minutes })) : [] })),
    })),
  };
}

/** The page scrolls as one (the shell's main area); a new step starts at its top. */
const toTop = () => document.getElementById("main")?.scrollTo({ top: 0 });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const X = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>;

type Props = { ideaId?: string | null; onCancel: () => void; onOpenProject: (projectId: Id<"projects">) => void };

export function NewProjectFlow({ ideaId, onCancel, onOpenProject }: Props) {
  const ideas = useQuery(api.newProject.ideas);
  const create = useMutation(api.newProject.create);
  const moves = useTaskMove();

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [origin, setOrigin] = useState<Origin>(ideaId ? "idea" : "scratch");
  const [chosenIdea, setChosenIdea] = useState<string>(ideaId ?? "");
  const [kind, setKind] = useState<Kind>("software");
  const [plan, setPlan] = useState(() => fresh("software"));
  const [selected, setSelected] = useState<{ ms: string; fresh: boolean } | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [newDoc, setNewDoc] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ projectId: Id<"projects">; firstTaskId: Id<"tasks"> | null } | null>(null);
  // The footer is pinned to the bottom of the screen while the card goes on below it.
  const footEnd = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const end = footEnd.current;
    if (!end) return;
    const watch = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root: document.getElementById("main"), threshold: 1 });
    watch.observe(end);
    return () => watch.disconnect();
  }, [created]);

  const { docs, phases } = plan;
  const picked = docs.filter(d => d.on);
  const setPhases = (next: Phase[]) => setPlan({ docs, phases: next });
  const editPhase = (i: number, patch: Partial<Phase>) => setPhases(phases.map((p, k) => k === i ? { ...p, ...patch } : p));
  const editMs = (i: number, j: number, patch: Partial<Ms>) => editPhase(i, { ms: phases[i].ms.map((m, k) => k === j ? { ...m, ...patch } : m) });

  // The first milestone holds the first evening's tasks.
  const firstAt = phases.findIndex(p => p.ms.length > 0);
  const firstMs = firstAt >= 0 ? { ...phases[firstAt].ms[0], code: `${firstAt}A`, i: firstAt } : null;
  const firstTask = firstMs?.tasks.find(t => t.title.trim()) ?? null;
  const ideaOptions = ideas ?? [];
  const idea = ideaOptions.find(item => item.id === chosenIdea);

  function go(next: number) {
    setError("");
    setStep(next);
    setMaxStep(m => Math.max(m, next));
    toTop();
  }
  function next() {
    if (step === 0 && (!name.trim() || !purpose.trim())) { setError("Give it a name and say why, in one line."); return; }
    if (step < 3) go(step + 1); else void submit();
  }
  function pickKind(next: Kind) {
    if (next === kind) return;
    if (maxStep >= 2 && !window.confirm(`Start from the ${kinds.find(k => k.kind === next)?.label} plan? Your docs and phases so far will be replaced.`)) return;
    setKind(next);
    setPlan(fresh(next));
    setSelected(null);
  }
  function pickIdea(id: string) {
    setChosenIdea(id);
    const found = ideaOptions.find(item => item.id === id);
    if (found && !name.trim()) setName(found.title);
    if (found && !purpose.trim() && found.purpose) setPurpose(found.purpose.slice(0, 2000));
  }
  function addDoc() {
    const title = newDoc.trim();
    if (!title) return;
    setPlan({ docs: [...docs, { code: docCode(title, docs.map(d => d.code)), title, on: true }], phases });
    setNewDoc("");
  }
  function addMilestone(i: number) {
    const ms = { key: newKey(), title: "New milestone", doneWhen: "", notes: "", tasks: [] };
    editPhase(i, { ms: [...phases[i].ms, ms] });
    setSelected({ ms: ms.key, fresh: true });
  }
  const addTask = (i: number, j: number) => editMs(i, j, { tasks: [...phases[i].ms[j].tasks, { key: newKey(), title: "", minutes: 45 }] });

  async function submit() {
    if (!name.trim() || !purpose.trim()) { go(0); setError("Give it a name and say why, in one line."); return; }
    setBusy(true); setError("");
    const codes = picked.map(d => d.code);
    try {
      const result = await create({
        title: name.trim(), purpose: purpose.trim(), lane: kind === "writing" ? "Writing" : "Projects",
        ...(origin === "idea" && chosenIdea ? { ideaId: chosenIdea as Id<"ideas"> } : {}),
        docs: picked.map(d => ({ code: d.code, title: d.title })),
        phases: phases.filter(p => p.name.trim()).map(p => ({
          name: p.name.trim(), ...(p.goal.trim() ? { goal: p.goal.trim() } : {}), ...(p.doneWhen.trim() ? { doneWhen: p.doneWhen.trim() } : {}), ...(p.notes.trim() ? { notes: p.notes } : {}),
          docCodes: p.docCodes.filter(code => codes.includes(code)),
          milestones: p.ms.filter(m => m.title.trim()).map(m => ({
            title: m.title.trim(), ...(m.doneWhen.trim() ? { doneWhen: m.doneWhen.trim() } : {}), ...(m.notes.trim() ? { notes: m.notes } : {}),
            tasks: m.tasks.filter(t => t.title.trim()).map(t => ({ title: t.title.trim(), minutes: t.minutes })),
          })),
        })),
      });
      setCreated(result);
      toTop();
    } catch (caught) {
      setError(readableError(caught, "Could not create the project. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  async function startNow() {
    if (!created?.firstTaskId || !firstTask) return;
    await moves.move({ _id: created.firstTaskId, title: firstTask.title.trim(), status: "Ready" }, "In progress");
    onOpenProject(created.projectId);
  }

  const originNote = origin === "idea" ? "Its research and report come along, so you always know why it started."
    : origin === "plan" ? "After you create it, ask Claude Code to “sync this project from PLAN.md into Becoming”. The plan arrives in your Inbox to approve, and only adds what's missing, so keep or trim the starting plan below."
      : "Nothing comes along. You can add research later.";
  const kindLabel = kinds.find(k => k.kind === kind)?.label ?? "Software";

  const taskRows = (i: number, j: number, ms: Ms, label: (n: number) => string) => ms.tasks.map((t, n) => <div key={t.key} className="task">
    <input className="inp" value={t.title} placeholder="One evening or less" aria-label={label(n + 1)} maxLength={160}
      onChange={event => editMs(i, j, { tasks: ms.tasks.map(x => x.key === t.key ? { ...x, title: event.target.value } : x) })} />
    <button type="button" className="min" aria-label={`Planned minutes, ${t.minutes}. Change`}
      onClick={() => editMs(i, j, { tasks: ms.tasks.map(x => x.key === t.key ? { ...x, minutes: MINUTES[(MINUTES.indexOf(x.minutes) + 1) % MINUTES.length] } : x) })}>{t.minutes} min</button>
    <button type="button" className="xb" aria-label={`Remove ${label(n + 1).toLowerCase()}`} onClick={() => editMs(i, j, { tasks: ms.tasks.filter(x => x.key !== t.key) })}><X /></button>
  </div>);

  let content: ReactNode;
  if (created) {
    content = <div className="created">
      <div className="bloom" aria-hidden="true"><span className="ring" /><span className="ring r2" /><span className="core" /></div>
      <div className="eyebrow mint">Project created</div>
      <h1 className="q" style={{ marginTop: 10 }}>{name.trim()} is <em>taking form.</em></h1>
      {firstTask && firstMs && <div className="first">
        <div className="eyebrow ember">Your first evening</div>
        <div className="t">{firstTask.title.trim()}</div>
        <div className="m">{firstMs.code} {firstMs.title} · {firstTask.minutes} min</div>
      </div>}
      <div className="dbtns">
        {firstTask && created.firstTaskId && <button type="button" className="btn" onClick={() => void startNow()}>Start it now</button>}
        <button type="button" className="ghost" onClick={() => onOpenProject(created.projectId)}>Open the project</button>
      </div>
    </div>;
  } else if (step === 0) {
    content = <div className="in" key="s0">
      <h1 className="q">What are you <em>building?</em></h1>
      <div className="group">
        <label className="lbl" htmlFor="np-name">Name</label>
        <input id="np-name" className="inp big" value={name} onChange={event => setName(event.target.value)} placeholder="Give it a name" maxLength={160} autoFocus />
      </div>
      <div className="group">
        <label className="lbl" htmlFor="np-purpose">In one line, why?</label>
        <input id="np-purpose" className="inp" value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="What it does, for whom" maxLength={2000} />
      </div>
      <div className="group">
        <span className="lbl">It starts from</span>
        <div className="chips" role="group" aria-label="It starts from">
          <button type="button" className={`chip${origin === "scratch" ? " on" : ""}`} aria-pressed={origin === "scratch"} onClick={() => setOrigin("scratch")}>Scratch</button>
          {ideaOptions.length > 0 && <button type="button" className={`chip${origin === "idea" ? " on" : ""}`} aria-pressed={origin === "idea"} onClick={() => setOrigin("idea")}>{idea ? `The idea “${idea.title}”` : "An idea"}</button>}
          <button type="button" className={`chip${origin === "plan" ? " on" : ""}`} aria-pressed={origin === "plan"} onClick={() => setOrigin("plan")}>A plan file</button>
        </div>
        {origin === "idea" && ideaOptions.length > 0 && <select className="inp" style={{ marginTop: 12 }} value={chosenIdea} onChange={event => pickIdea(event.target.value)} aria-label="Which idea">
          <option value="">Choose the idea…</option>
          {ideaOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>}
        <div className="note"><i />{originNote}</div>
      </div>
      <div className="group">
        <span className="lbl">What kind of project?</span>
        <div className="chips" role="group" aria-label="Kind">
          {kinds.map(k => <button key={k.kind} type="button" className={`chip${kind === k.kind ? " on" : ""}`} aria-pressed={kind === k.kind} onClick={() => pickKind(k.kind)}>{k.label}</button>)}
        </div>
      </div>
    </div>;
  } else if (step === 1) {
    content = <div className="in" key="s1">
      <h1 className="q">What will you <em>write first?</em></h1>
      <p className="lede">Pick the docs the plan stands on. They can start empty.</p>
      <div className="group">
        <div className="chips">
          {docs.map(d => <button key={d.code} type="button" className={`chip lilac${d.on ? " on" : ""}`} aria-pressed={d.on}
            onClick={() => setPlan({ docs: docs.map(x => x.code === d.code ? { ...x, on: !x.on } : x), phases })}><span className="cd">{d.code}</span>{d.title}</button>)}
        </div>
        <form className="adddoc" onSubmit={event => { event.preventDefault(); addDoc(); }}>
          <input className="inp" value={newDoc} onChange={event => setNewDoc(event.target.value)} placeholder="Another doc, e.g. Research notes" aria-label="Add another doc" maxLength={120} />
          <button type="submit" className="chip" disabled={!newDoc.trim()}>Add</button>
        </form>
      </div>
    </div>;
  } else if (step === 2) {
    content = <div className="in" key="s2">
      <h1 className="q">How will it <em>unfold?</em></h1>
      <p className="lede">Phases are the big stages; the chips under each are its milestones. Click a milestone to rename it and give it tasks. It&apos;s only a start.</p>
      <button type="button" className="suggest" onClick={() => { if (window.confirm(`Replace the phases with the ${kindLabel} starting plan?`)) { setPhases(fresh(kind).phases); setSelected(null); } }}>↺ Start over from the {kindLabel} plan</button>
      <div className="group" style={{ marginTop: 10 }}>
        {phases.map((p, i) => {
          const open = details.includes(p.key);
          const hasDetails = Boolean(p.goal.trim() || p.doneWhen.trim() || p.notes.trim() || p.docCodes.length);
          const sel = p.ms.findIndex(m => m.key === selected?.ms);
          return <div key={p.key} className="ph">
            <span className="num">{pad(i)}</span>
            <div>
              <input className="inp" value={p.name} onChange={event => editPhase(i, { name: event.target.value })} aria-label={`Phase ${pad(i)} name`} maxLength={120} placeholder="Phase name" />
              <div className="mss">
                {p.ms.map((m, j) => <span key={m.key} className={`ms${j === sel ? " sel" : ""}`}>
                  <button type="button" className="open" aria-expanded={j === sel} onClick={() => setSelected(j === sel ? null : { ms: m.key, fresh: false })}>
                    <b>{i}{letter(j)}</b>{m.title || "Untitled"}{m.tasks.length > 0 && <span className="cnt">· {m.tasks.length}</span>}
                  </button>
                  <button type="button" className="x" aria-label={`Remove milestone ${i}${letter(j)}`} onClick={() => { editPhase(i, { ms: p.ms.filter(x => x.key !== m.key) }); if (j === sel) setSelected(null); }}>×</button>
                </span>)}
                <button type="button" className="msadd" onClick={() => addMilestone(i)}>+ milestone</button>
              </div>
              {sel >= 0 && <MilestoneEditor code={`${i}${letter(sel)}`} ms={p.ms[sel]} fresh={selected?.fresh ?? false}
                onChange={patch => editMs(i, sel, patch)} onAddTask={() => addTask(i, sel)} onDone={() => setSelected(null)}
                tasks={taskRows(i, sel, p.ms[sel], n => `Task ${n} of ${i}${letter(sel)}`)} />}
              <button type="button" className="dtog" aria-expanded={open} onClick={() => setDetails(open ? details.filter(k => k !== p.key) : [...details, p.key])}>
                {open ? "Hide details" : hasDetails ? "Details ✓" : "+ Details"}{!open && <span>what it does, done when, docs, notes</span>}
              </button>
              {open && <div className="phd" role="group" aria-label={`Details of phase ${pad(i)}`}>
                <label className="fl">What this phase does<input className="inp" value={p.goal} onChange={event => editPhase(i, { goal: event.target.value })} placeholder="One line on what it delivers" maxLength={1000} /></label>
                <label className="fl">Done when<input className="inp" value={p.doneWhen} onChange={event => editPhase(i, { doneWhen: event.target.value })} placeholder="What you'll see when this stage is finished" maxLength={1000} /></label>
                <div className="fl">Built from <span>the docs this phase stands on</span>
                  {picked.length ? <div className="chips" role="group" aria-label={`Docs for phase ${pad(i)}`}>
                    {picked.map(d => {
                      const on = p.docCodes.includes(d.code);
                      return <button key={d.code} type="button" className={`chip lilac sm${on ? " on" : ""}`} aria-pressed={on}
                        onClick={() => editPhase(i, { docCodes: on ? p.docCodes.filter(c => c !== d.code) : [...p.docCodes, d.code] })}><span className="cd">{d.code}</span>{d.title}</button>;
                    })}
                  </div> : <span>No docs picked yet; choose them in step 2.</span>}
                </div>
                <label className="fl">Notes<textarea className="inp" value={p.notes} onChange={event => editPhase(i, { notes: event.target.value })} placeholder="Anything worth keeping about this phase" maxLength={10000} /></label>
              </div>}
            </div>
            <button type="button" className="xb" aria-label={`Remove phase ${pad(i)}`} onClick={() => { if (phases.length > 1) setPhases(phases.filter(x => x.key !== p.key)); }}><X /></button>
          </div>;
        })}
        <button type="button" className="addline" onClick={() => setPhases([...phases, { key: newKey(), name: "New phase", goal: "", doneWhen: "", notes: "", docCodes: [], ms: [{ key: newKey(), title: "New milestone", doneWhen: "", notes: "", tasks: [] }] }])}>+ Add phase</button>
      </div>
    </div>;
  } else {
    content = <div className="in" key="s3">
      <h1 className="q">What&apos;s the <em>first evening?</em></h1>
      <p className="lede">Plan only the first milestone. Each task is one evening or less. The rest you&apos;ll plan as you get there.</p>
      {firstMs ? <>
        <div className="msname"><b>{firstMs.code}</b>{firstMs.title || "First milestone"}</div>
        {taskRows(firstMs.i, 0, firstMs, n => `Task ${n}`)}
        <button type="button" className="addline" onClick={() => addTask(firstMs.i, 0)}>+ Add task</button>
      </> : <div className="note"><i />Add a milestone in the plan first, then its tasks here.</div>}
    </div>;
  }

  return <div className="np r-rise-6">
    <div className="top">
      <button type="button" className="back" onClick={onCancel}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>Work</button>
      <span className="ttl">New project</span>
    </div>

    <nav className="steps" aria-label="Steps">
      {LABELS.map((label, i) => <button key={label} type="button" className={`st${created || i < step ? " done" : i === step ? " cur" : ""}`} aria-current={!created && i === step ? "step" : undefined}
        disabled={Boolean(created) || i > maxStep} onClick={() => go(i)}>
        <span className="bar"><span /></span>
        <span className="lb"><b>{i + 1}</b><span>{label}</span></span>
      </button>)}
    </nav>

    <div className="body">
      <section className="card" aria-live="polite">
        <div className="scroll">
          {content}
          {error && <p className="err" role="alert">{error}</p>}
        </div>
        {!created && <div className={`foot${stuck ? " stuck" : ""}`}>
          {step > 0 && <button type="button" className="textbtn" onClick={() => go(step - 1)}>← Back</button>}
          <span className="sp" />
          <button type="button" className="btn" disabled={busy} onClick={next}>{step === 3 ? (busy ? "Creating…" : "Create project") : "Continue"}</button>
        </div>}
        {!created && <div ref={footEnd} className="foot-end" aria-hidden="true" />}
      </section>

      <aside className="pv" aria-label="Preview">
        <div className="pvhead">
          <span className={`porb${name.trim() ? "" : " off"}`} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className={`pvn${name.trim() ? "" : " empty"}`}>{name.trim() || "Untitled"}</div>
            {purpose.trim() && <div className="pvp">{purpose.trim()}</div>}
          </div>
        </div>
        <div className="pg">
          <div className="k">Docs</div>
          {step >= 1 || created ? (picked.length ? <div className="pdocs">{picked.map(d => <span key={d.code} className="pd">{d.code}</span>)}</div> : <div className="empty-line">None picked</div>)
            : <div className="empty-line">Picked in step 2</div>}
        </div>
        <div className="pg">
          <div className="k">Plan</div>
          {step >= 2 || created ? <div className="prows">{phases.map((p, i) => {
            const tasks = p.ms.reduce((n, m) => n + m.tasks.filter(t => t.title.trim()).length, 0);
            return <div key={p.key} className="prow"><span className="n">{pad(i)}</span><span className="t">{p.name || "Untitled"}</span><span className="c">{plural(p.ms.length, "milestone")}{tasks ? ` · ${plural(tasks, "task")}` : ""}</span></div>;
          })}</div> : <div className="empty-line">Shaped in step 3</div>}
        </div>
        <div className="pg">
          <div className="k">First evening</div>
          {(step >= 3 || created) && firstTask && firstMs ? <div className="pfirst"><div className="t">{firstTask.title.trim()}</div><div className="m">{firstMs.code} {firstMs.title} · {firstTask.minutes} min</div></div>
            : <div className="empty-line">{step >= 3 ? "Add a task to the first milestone" : "Chosen in step 4"}</div>}
        </div>
      </aside>
    </div>
  </div>;
}

/** A milestone chip's editor: its name (ready to type when it's new), done-when, tasks and notes. */
function MilestoneEditor({ code, ms, fresh, onChange, onAddTask, onDone, tasks }: { code: string; ms: Ms; fresh: boolean; onChange: (patch: Partial<Ms>) => void; onAddTask: () => void; onDone: () => void; tasks: ReactNode }) {
  return <div className="mse" role="group" aria-label={`Milestone ${code}`}>
    <label className="fl">Milestone {code}
      <input className="inp" value={ms.title} onChange={event => onChange({ title: event.target.value })} autoFocus={fresh} onFocus={event => { if (fresh) event.currentTarget.select(); }} maxLength={160} placeholder="The outcome, e.g. Accounts work" />
    </label>
    <label className="fl">Done when <span>optional</span>
      <input className="inp" value={ms.doneWhen} onChange={event => onChange({ doneWhen: event.target.value })} placeholder="What you'll see when it's reached" maxLength={1000} />
    </label>
    <div className="fl">Tasks <span>each one evening or less</span>
      {tasks}
      <button type="button" className="addline sm" onClick={onAddTask}>+ Add task</button>
    </div>
    <label className="fl">Notes <span>optional</span>
      <textarea className="inp" value={ms.notes} onChange={event => onChange({ notes: event.target.value })} placeholder="Anything worth keeping about this milestone" maxLength={10000} />
    </label>
    <div className="mse-foot"><button type="button" className="textbtn" onClick={onDone}>Done</button></div>
  </div>;
}
