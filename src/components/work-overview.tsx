"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { calendarDays, plural } from "@/components/constellation/model";
import { planSummary, words } from "@/components/project-list";
import type { EditableTask, Lane } from "@/components/task-forms";
import { StatusControl } from "@/components/tasks/status-control";
import { QuickAdd } from "@/components/tasks/quick-add";
import { useFocus } from "@/components/focus/focus-layer";

// Work ("What you're building"): the owner's Work artboard (documents/design/work.dc.html).
// Each active project is one row (where it stands in its plan, a hexagon per phase, what's
// up next), ideas still in genesis sit beside them, and below are only the tasks that belong
// to no project: a project's tasks live on its own page. Every task moves with the same
// status circle (one tap, with Undo); the play button always means a focus session.

type Project = FunctionReturnType<typeof api.projects.list>[number];
type Idea = FunctionReturnType<typeof api.genesis.inProgress>[number];
type Loose = FunctionReturnType<typeof api.tasks.looseOpen>[number];

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** Active if worked on in the last week; otherwise paused. */
const paused = (p: Project, now: number) => p.lastActiveAt === null || now - p.lastActiveAt > 7 * DAY;
function stateLabel(p: Project, now: number) {
  if (p.lastActiveAt === null) return "Active · not started yet";
  const days = calendarDays(p.lastActiveAt, now);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return paused(p, now) ? `Paused · last worked ${when}` : `Active · worked on ${when}`;
}

export type WorkOverviewProps = {
  now: number;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onOpenProject: (projectId: Id<"projects">) => void;
  onNewTask: (defaults?: Partial<EditableTask>) => void;
  onQuickTask: () => void;
  onNewProject: () => void;
  onDone: () => void;
  onArchived: () => void;
  onAllProjects: () => void;
};

export function WorkOverview(props: WorkOverviewProps) {
  const { now } = props;
  const projects = useQuery(api.projects.list, { status: "Active" });
  const ideas = useQuery(api.genesis.inProgress);
  const loose = useQuery(api.tasks.looseOpen);
  const inbox = useQuery(api.inbox.list);
  const [sort, setSort] = useState<"next" | "recent">("next");

  const rows = projects && ideas ? [
    ...projects.map(p => ({ kind: "project" as const, key: String(p._id), p, at: p.lastActiveAt ?? 0, rank: paused(p, now) ? 1 : 0 })),
    ...ideas.map(i => ({ kind: "idea" as const, key: String(i.id), i, at: i.lastAt, rank: 2 })),
  ].sort((a, b) => sort === "recent" ? b.at - a.at : a.rank - b.rank || b.at - a.at) : null;
  const activeCount = projects?.filter(p => !paused(p, now)).length ?? 0;
  const pausedCount = (projects?.length ?? 0) - activeCount;
  const counts = [activeCount && `${activeCount} active`, pausedCount && `${pausedCount} paused`, ideas?.length && `${ideas.length} in genesis`].filter(Boolean).join(" · ");

  const lanes: { lane: Lane; name: string; desc: string; colour: string }[] = [
    { lane: "Showcases", name: "Showcases", desc: "small, finished pieces", colour: "#86E3C3" },
    { lane: "Writing", name: "Writing", desc: "notes and posts", colour: "#C9B8F0" },
    { lane: "Projects", name: "One-offs", desc: "Projects lane, no project", colour: "#FF8A3D" },
  ];
  const sources = [...new Set(inbox?.map(item => item.source) ?? [])];

  return <div className="wo r-rise-6">
    <header className="head">
      <div>
        <div className="eyebrow">Work</div>
        <h1 className="title">What you’re <em>building.</em></h1>
      </div>
      <div className="hbtns">
        <button type="button" className="ghost" onClick={props.onQuickTask}>+ Add task</button>
        <button type="button" className="ghost ember" onClick={props.onNewProject}>+ New project</button>
      </div>
    </header>

    {inbox && inbox.length > 0 && <div className="inbox">
      <span className="av" aria-hidden="true">{sources[0]?.trim()[0]?.toUpperCase() ?? "A"}</span>
      <div className="tx">{sources.join(" and ")} proposed <b>{plural(inbox.length, "change")}</b> through MCP <span>· {inbox.slice(0, 2).map(item => item.title).join(" and ")}{inbox.length > 2 ? " and more" : ""}</span></div>
      <Link className="soft lilac" href="/today">Review in Inbox</Link>
    </div>}

    <section className="sec" aria-labelledby="wo-projects">
      <div className="sechead">
        <div className="sectitle"><h2 id="wo-projects">Projects</h2>{counts && <span>{counts}</span>}</div>
        <div className="sort" role="group" aria-label="Order projects">
          {([["next", "Up next"], ["recent", "Recent"]] as const).map(([key, label]) =>
            <button key={key} type="button" className={sort === key ? "on" : undefined} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}</button>)}
        </div>
      </div>
      {rows === null ? <RowBones /> : rows.map(row => row.kind === "project"
        ? <ProjectRow key={row.key} project={row.p} {...props} />
        : <IdeaRow key={row.key} idea={row.i} />)}
      <button type="button" className="addrow" onClick={props.onNewProject}>+ New project, or turn an idea into one</button>
    </section>

    <section className="sec" aria-labelledby="wo-loose">
      <div className="sechead">
        <div className="sectitle"><h2 id="wo-loose">Not in a project</h2><span>Small pieces, writing and one-offs. Project tasks stay inside their project.</span></div>
      </div>
      <div className="lanes">
        {lanes.map(l => {
          const tasks = (loose ?? []).filter(t => t.lane === l.lane);
          return <section key={l.lane} className="lane" aria-label={l.name}>
            <div className="lhead"><span className="ldot" style={{ background: l.colour }} aria-hidden="true" /><span className="lname">{l.name}</span><span className="ldesc">{l.desc}</span><span className="lcount">{loose ? `${tasks.length} open` : ""}</span></div>
            {tasks.map(t => <LooseTask key={t._id} task={t} onOpen={() => props.onOpenTask(t._id)} />)}
            {loose && tasks.length === 0 && <div className="empty">Nothing loose here. {l.lane === "Projects" ? "Building work lives inside its project." : "Add one when something small comes up."}</div>}
            <QuickAdd lane={l.lane} placeholder={`Add to ${l.name}…`} onMore={title => props.onNewTask({ lane: l.lane, title })} />
          </section>;
        })}
      </div>
      <div className="foot">Finished work moves to <Link href="/journey">Journey</Link>, where it becomes proof.</div>
      <nav className="morelinks" aria-label="More of your work">
        <button type="button" onClick={props.onDone}>Done tasks</button>
        <button type="button" onClick={props.onArchived}>Archived</button>
        <button type="button" onClick={props.onAllProjects}>All projects, done and archived too</button>
        <button type="button" onClick={() => props.onNewTask()}>Add a task with every detail</button>
      </nav>
    </section>
  </div>;
}

/** One active project: where it stands in its plan, and what's up next. */
function ProjectRow({ project: p, now, onOpenTask, onOpenProject, onNewTask }: { project: Project } & WorkOverviewProps) {
  const map = useQuery(api.constellation.get, { projectId: p._id });
  const isPaused = paused(p, now);
  const plan = map ? planSummary(map) : null;

  let whereK = "", whereName = "", hive: { key: string; c: string }[] = [], hiveLbl = "";
  if (plan?.here) {
    whereK = `PHASE ${plan.here.num} OF ${pad(plan.phases.length)}${plan.currentMs ? ` · MILESTONE ${plan.currentMs.code}` : ""}`;
    whereName = `${plan.here.name}${plan.currentMs ? ` › ${plan.currentMs.name}` : ""}`;
    hive = plan.phases.map(g => ({ key: g.key, c: g.state === "done" ? "d" : g.state === "active" ? "a" : "" }));
    hiveLbl = `${plan.phasesDone} of ${plural(plan.phases.length, "phase")}`;
  } else if (plan?.hereMs) {
    whereK = `MILESTONE ${plan.hereMsIndex + 1} OF ${plan.looseMs.length}`;
    whereName = plan.hereMs.name;
    const states = plan.looseMs.map(m => { const d = m.tasks.filter(t => t.state === "done").length; return d === m.tasks.length && d > 0 ? "d" : m.tasks.some(t => t.state !== "ready") ? "a" : ""; });
    hive = plan.looseMs.map((m, i) => ({ key: m.key, c: states[i] }));
    hiveLbl = `${states.filter(s => s === "d").length} of ${plural(plan.looseMs.length, "milestone")}`;
  } else if (plan) {
    whereK = "TASKS";
    whereName = plan.all.length ? "No milestones yet" : "Nothing planned yet";
  }
  const pct = plan ? plan.projectPct : p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
  const next = plan?.upNext[0] ?? null;
  const note = next && plan ? plan.noteOf(next) : null;
  const nextStatus = next?.state === "doing" ? "In progress" : next?.state === "blocked" ? "Blocked" : "Ready";

  return <article className={`prj${isPaused ? "" : " active"}`}>
    {/* The whole row opens the project; its own action button sits above this. */}
    <button type="button" className="rowlink" onClick={() => onOpenProject(p._id)} aria-label={`Open ${p.title}`} />
    <div>
      <div className={`pst ${isPaused ? "paused" : "active"}`}><i aria-hidden="true" />{stateLabel(p, now)}</div>
      <h3 className="pname">{p.title}</h3>
      <div className="ppurp">{p.purpose}</div>
    </div>

    <div className="where">
      <div className="wk">{whereK || " "}</div>
      <div className="wn">{whereName || " "}</div>
      {hive.length > 0 && <div className="hive" role="img" aria-label={hiveLbl + " done"}>
        {hive.slice(0, 24).map(h => <span key={h.key} className={`hx ${h.c}`} />)}
        <span className="hivelbl">{hiveLbl}</span>
      </div>}
      <span className="bar"><span style={{ width: `${pct}%` }} /></span>
      <div className="wm">{plan ? `${plan.projectDone} of ${plural(plan.all.length, "task")} · ${pct}% formed` : `${p.progress.done} of ${plural(p.progress.total, "task")}`}</div>
    </div>

    <div className="nextbox">
      <div className="nk">{isPaused && next ? "PICK UP HERE" : "UP NEXT"}</div>
      <div className="nt">{next ? next.title : plan ? "Nothing ready yet" : p.nextTask?.title ?? " "}</div>
      <div className="nm">{next ? `${next.code} · ${next.minutes} min${note ? ` · ${note.text}` : ""}` : plan ? "Add a task with a clear done-when." : " "}</div>
      <div className="nrow">
        {next ? <span className="nact">
          <StatusControl task={{ _id: next.id, title: next.title, status: nextStatus }} />
          <button type="button" className="soft" onClick={() => onOpenTask(next.id)}>{next.state === "doing" ? (isPaused ? "Pick up" : "Continue") : "Open"}</button>
        </span>
          : plan && <button type="button" className="soft" onClick={() => onNewTask({ projectId: p._id, lane: p.lane ?? "Projects" })}>+ Add a task</button>}
      </div>
    </div>
  </article>;
}

const GENESIS_STEPS = ["idea", "research", "report", "decision"] as const;

/** An idea still in genesis: how far its research has come, and the next step towards a decision. */
function IdeaRow({ idea: i }: { idea: Idea }) {
  const done = [true, i.threads > 0, i.report, Boolean(i.decision)];
  const step = done.indexOf(false);
  const href = `/ideas?idea=${i.id}`;
  const next = step === 1 ? { t: "Start the research", m: "The threads and sources behind the idea", a: "Start" }
    : step === 2 ? { t: "Write the report", m: "Turns the research into a decision", a: "Write it" }
      : step === 3 ? { t: "Record the decision", m: "Build it, change it, or let it go", a: "Decide" }
        : { t: "Make it a project", m: `Decided: ${i.decision}`, a: "Make it active" };
  return <article className="prj">
    <Link className="rowlink" href={href} aria-label={`Open ${i.title}`} />
    <div>
      <div className="pst genesis"><i aria-hidden="true" />Genesis · not a project yet</div>
      <h3 className="pname">{i.title}</h3>
      {i.purpose && <div className="ppurp">{i.purpose}</div>}
    </div>
    <div className="where">
      <div className="wk">GENESIS · {(GENESIS_STEPS[step] ?? "decision").toUpperCase()}</div>
      <div className="wn">Idea › {i.threads ? plural(i.threads, "research thread") : "no research yet"}</div>
      <div className="hive" role="img" aria-label={`${done.filter(Boolean).length} of 4 genesis steps done`}>
        {done.map((d, k) => <span key={GENESIS_STEPS[k]} className={`hx${d ? " g" : ""}`} />)}
        <span className="hivelbl">idea → research → report → decision</span>
      </div>
      <span className="bar lilac"><span style={{ width: `${(done.filter(Boolean).length / 4) * 100}%` }} /></span>
      <div className="wm">{plural(i.sources, "source")} read · report {i.report ? `written, ${plural(i.findings, "finding")}` : "not written"}</div>
    </div>
    <div className="nextbox">
      <div className="nk lilac">NEXT IN GENESIS</div>
      <div className="nt">{next.t}</div>
      <div className="nm">{next.m}</div>
      <div className="nrow">
        <Link className="soft" href={href}>{next.a}</Link>
      </div>
    </div>
  </article>;
}

/** A task outside any project. The circle moves it, the card opens it, and the play button starts a focus session on it. */
function LooseTask({ task: t, onOpen }: { task: Loose; onOpen: () => void }) {
  const focus = useFocus();
  const st = t.status === "In progress" ? "p" : t.status === "Blocked" ? "b" : "r";
  const meta = [`${t.minutes} min`, t.plannedSessions ? `${t.sessions} of ${t.plannedSessions} sessions` : null, t.status === "Blocked" && t.nextStep ? t.nextStep : null].filter(Boolean).join(" · ");
  return <div className="task">
    <StatusControl task={t} />
    <button type="button" className="topen" onClick={onOpen} aria-haspopup="dialog">
      <span className="tt">{t.title}</span>
      <span className="tm"><span>{meta}</span><span className={`pill ${st}`}>{words[st]}</span></span>
    </button>
    {t.status !== "Blocked" && <button type="button" className="play" onClick={() => void focus.start(t)} aria-label={`Start a focus session on ${t.title}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.6v10.8c0 .6.6.9 1.1.6l8.4-5.4c.5-.3.5-.9 0-1.2L5.6 2c-.5-.3-1.1 0-1.1.6z" /></svg>
    </button>}
  </div>;
}

function RowBones() {
  return <div className="prj" aria-busy="true" aria-label="Loading your projects"><div className="wm">Loading your projects…</div></div>;
}

