"use client";

import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { ago, dayMonth, dayRange, plural, type CMilestone, type CTask, type Constellation } from "@/components/constellation/model";
import { activityLine, who } from "@/components/constellation/panel";
import { StatusControl } from "@/components/tasks/status-control";
import { QuickAdd } from "@/components/tasks/quick-add";
import { useTaskMove } from "@/components/tasks/use-task-move";

// A project's List view: the owner's design (the canvas's List artboard), on the same records
// as the Visual map (convex/constellation.ts). Phase → milestone → task, with where you are,
// what's up next, the docs the plan stands on, where it came from and recent activity.
// Nothing here starts a focus session: Start only marks a task In progress, and a task's own
// sheet is where a focus session begins.

type St = "d" | "p" | "r" | "b";
type Filter = "all" | "open" | "b" | "d";
type PhaseState = "done" | "active" | "ahead";
export const stOf: Record<CTask["state"], St> = { done: "d", doing: "p", ready: "r", blocked: "b" };
export const words: Record<St, string> = { d: "Done", p: "In progress", r: "Ready", b: "Blocked" };

type Ms = { key: string; id: Id<"milestones"> | null; code: string; name: string; doneWhen: string; tasks: CTask[] };
type Group = {
  key: string; phaseId: Id<"phases"> | null; num: string; name: string; goal: string; nextStep: string; doneWhen: string;
  endedAt: number | null; ms: Ms[]; tasks: CTask[]; state: PhaseState; pct: number; done: number; doing: number; total: number;
};

function summary(tasks: CTask[]) {
  const done = tasks.filter(t => t.state === "done").length, doing = tasks.filter(t => t.state === "doing").length, blocked = tasks.filter(t => t.state === "blocked").length;
  const state: PhaseState = tasks.length && done === tasks.length ? "done" : done + doing + blocked > 0 ? "active" : "ahead";
  return { done, doing, total: tasks.length, state, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}
const msOf = (m: CMilestone): Ms => ({ key: String(m.id), id: m.id, code: m.code, name: m.title, doneWhen: m.doneWhen, tasks: m.tasks });

/** The plan as groups: each phase, then (as one more group) whatever sits outside any phase. */
function groupsOf(map: Constellation): Group[] {
  const groups: Group[] = map.phases.map(p => {
    const ms = p.milestones.map(msOf), tasks = ms.flatMap(m => m.tasks);
    return { key: String(p.id), phaseId: p.id, num: p.num, name: p.name, goal: p.goal, nextStep: p.nextStep, doneWhen: p.doneWhen, endedAt: p.endedAt, ms, tasks, ...summary(tasks) };
  });
  const loose = map.loose.milestones.map(msOf);
  if (map.loose.tasks.length) loose.push({ key: "none", id: null, code: "·", name: "No milestone", doneWhen: "", tasks: map.loose.tasks });
  if (loose.length) {
    const tasks = loose.flatMap(m => m.tasks);
    groups.push({ key: "loose", phaseId: null, num: "—", name: groups.length ? "Outside any phase" : "Milestones", goal: "", nextStep: "", doneWhen: "", endedAt: null, ms: loose, tasks, ...summary(tasks) });
  }
  return groups;
}

/** Where a project stands, from its map: the phase (or, without phases, the milestone) you're
 *  working in, what's up next, and its totals. Shared by the List view and Work's project rows. */
export function planSummary(map: Constellation) {
  const groups = groupsOf(map);
  const phases = groups.filter(g => g.phaseId);
  const all = groups.flatMap(g => g.tasks);
  const byId = new Map(all.map(t => [String(t.id), t]));
  const msOfTask = new Map(groups.flatMap(g => g.ms.flatMap(m => m.tasks.map(t => [String(t.id), m] as const))));
  const waitingOn = (t: CTask) => t.dependencies.map(id => byId.get(id)).find(d => d && d.state !== "done");

  // ---- where you are: the phase you're working in. That's the one with work in progress, or
  // else the latest task you started or finished (if that phase isn't done), or else the first
  // phase still going, or the first ahead. Without phases, the current milestone. ----
  const hereIndex = (() => {
    const doing = phases.findIndex(g => g.tasks.some(t => t.state === "doing"));
    if (doing >= 0) return doing;
    const touched = phases.map(g => Math.max(0, ...g.tasks.flatMap(t => [t.startedAt ?? 0, t.completedAt ?? 0])));
    const latest = touched.indexOf(Math.max(0, ...touched));
    if (latest >= 0 && touched[latest] > 0 && phases[latest].state !== "done") return latest;
    const i = phases.findIndex(g => g.state === "active");
    if (i >= 0) return i;
    const j = phases.findIndex(g => g.state === "ahead");
    return j >= 0 ? j : phases.length - 1;
  })();
  const here = phases[hereIndex] ?? null;
  const looseMs = groups.find(g => g.key === "loose")?.ms.filter(m => m.id) ?? [];
  const hereMsIndex = here ? -1 : Math.max(0, looseMs.findIndex(m => summary(m.tasks).state !== "done"));
  const hereMs = here ? null : looseMs[hereMsIndex] ?? null;

  const currentMs = here?.ms.find(m => summary(m.tasks).state !== "done") ?? null;
  const projectDone = all.filter(t => t.state === "done").length;
  const projectPct = all.length ? Math.round((projectDone / all.length) * 100) : 0;
  const phasesDone = phases.filter(g => g.state === "done").length;

  // ---- up next: work in progress first, then ready work from where you are, then the rest in plan order ----
  const hereTasks = new Set((here?.tasks ?? hereMs?.tasks ?? []).map(t => String(t.id)));
  const openWork = [...all.filter(t => t.state === "doing"), ...all.filter(t => t.state === "ready" && hereTasks.has(String(t.id))), ...all.filter(t => t.state === "ready" && !hereTasks.has(String(t.id)))];
  const upNext = openWork.slice(0, 3);
  const blocked = all.filter(t => t.state === "blocked");
  const firstMs = upNext[0] ? msOfTask.get(String(upNext[0].id)) : undefined;
  const noteOf = (t: CTask): { text: string; red?: boolean } | null => {
    if (t.state === "blocked") return t.nextStep ? { text: t.nextStep, red: true } : null;
    if (t.state === "doing") return t.plannedSessions ? { text: `${t.sessions} of ${t.plannedSessions} sessions` } : t.nextStep ? { text: t.nextStep } : null;
    if (t.state === "ready") { const w = waitingOn(t); return w ? { text: `after ${w.code}` } : null; }
    return null;
  };
  const lastAt = Math.max(0, ...all.flatMap(t => [t.startedAt ?? 0, t.completedAt ?? 0, t.blockedAt ?? 0]), ...map.activity.map(e => e.at));
  return { groups, phases, all, here, looseMs, hereMsIndex, hereMs, currentMs, projectDone, projectPct, phasesDone, openWork, upNext, blocked, firstMs, noteOf, lastAt };
}

export type ProjectListProps = {
  map: Constellation;
  active: boolean;
  statusWord: string;
  busy: boolean;
  initial: string;
  /** Proposals waiting in the Inbox, shown on the Activity card. */
  inboxCount: number;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onMakeActive: () => void;
  onAddTask: (milestoneId?: Id<"milestones">, title?: string) => void;
  onAddMilestone: (phaseId?: Id<"phases">) => void;
  onAddPhase: () => void;
  onEditPhase: (phaseId: Id<"phases">) => void;
  onEditMilestone: (milestoneId: Id<"milestones">) => void;
  onAddDoc: () => void;
  onOpenDoc: (docId: Id<"projectDocs">) => void;
  onVisual: () => void;
};

export function ProjectList(props: ProjectListProps) {
  const { map, active, busy, initial } = props;
  const { groups, phases, all, here, looseMs, hereMsIndex, hereMs, currentMs, projectDone, projectPct, phasesDone, openWork, upNext, blocked, firstMs, noteOf } = planSummary(map);

  const [openP, setOpenP] = useState<Record<string, boolean> | null>(null);
  const [openM, setOpenM] = useState<Record<string, boolean> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [doc, setDoc] = useState<string | null>(null);
  const openPhases = openP ?? (here ? { [here.key]: true } : groups.length === 1 ? { [groups[0].key]: true } : {});
  const openMs = openM ?? (currentMs ? { [currentMs.key]: true } : hereMs ? { [hereMs.key]: true } : {});

  const moves = useTaskMove();
  // Every row moves with the same status circle (PLAN-one-tap-and-daily-loop, Phase 1).
  const asTask = (t: CTask) => ({ _id: t.id, title: t.title, status: words[stOf[t.state]] });

  // ---- filters and the doc focus ----
  const counts = { all: all.length, open: openWork.length, b: blocked.length, d: projectDone };
  const match = (t: CTask) => filter === "all" || (filter === "open" && (t.state === "doing" || t.state === "ready")) || stOf[t.state] === filter;
  const selDoc = map.docs.find(d => d.code === doc) ?? null;
  const filtering = filter !== "all";
  const shown = groups.map(g => ({ g, ms: g.ms.map(m => ({ m, tasks: filtering ? m.tasks.filter(match) : m.tasks })).filter(x => !filtering || x.tasks.length) }))
    .filter(x => !filtering || x.ms.length);
  const allOpen = groups.length > 0 && groups.every(g => openPhases[g.key]);

  const togglePhase = (key: string) => { setOpenP({ ...openPhases, [key]: !openPhases[key] }); setFilter("all"); };
  const toggleMs = (key: string) => { setOpenM({ ...openMs, [key]: !openMs[key] }); setFilter("all"); };
  const showHere = () => {
    const key = here?.key ?? "loose";
    setOpenP({ ...openPhases, [key]: true });
    if (currentMs || hereMs) setOpenM({ ...openMs, [(currentMs ?? hereMs)!.key]: true });
    setFilter("all"); setDoc(null);
    requestAnimationFrame(() => document.getElementById(`pl-phase-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const pickDoc = (code: string) => { if (doc === code) setDoc(null); else { setDoc(code); setOpenP({}); } setFilter("all"); };

  const docsWritten = map.docs.filter(d => d.writtenAt !== null).length;
  const feedsOf = (phaseIds: string[]) => phases.filter(g => g.phaseId && phaseIds.includes(String(g.phaseId))).map(g => g.num);
  const now = map.timeline.now;

  // ---- where it came from ----
  const g = map.genesis;
  const sources = g.research.reduce((n, r) => n + r.sources.length, 0);
  const briefs = g.research.flatMap(r => r.sources).filter(s => s.kind === "brief");
  const briefBy = [...new Set(briefs.map(s => s.by))];
  const researchDates = g.research.flatMap(r => [r.createdAt, ...r.sources.map(s => s.at)]);

  const stepsOf = (list: Ms[]) => list.map(m => {
    const s = summary(m.tasks);
    return { key: m.key, code: m.code, name: m.name, cls: s.state === "done" ? "done" : s.state === "active" ? "cur" : "",
      word: s.state === "done" ? "Done" : `${s.done} of ${s.total}${s.doing ? ` · ${s.doing} in progress` : ""}` };
  });
  const msWindow = hereMs ? looseMs.slice(Math.max(0, hereMsIndex - 2), Math.max(0, hereMsIndex - 2) + 5) : [];
  const hereStats = here ? summary(here.tasks) : hereMs ? summary(hereMs.tasks) : null;

  return <>
    <section className="now" aria-label="Where you are">
      {(here || hereMs) && hereStats && <div className="card here">
        <div className="chead">
          <div className="eyebrow ember">{here ? `You are here · Phase ${here.num} of ${String(phases.length).padStart(2, "0")}` : `You are here · Milestone ${hereMsIndex + 1} of ${looseMs.length}`}</div>
          <button type="button" className="link" onClick={props.onVisual}>See it on the map ›</button>
        </div>
        <h2 className="htitle">{here ? here.name : hereMs!.name}</h2>
        {(here ? here.goal : hereMs!.doneWhen) && <div className="goal">{here ? here.goal : `Done when: ${hereMs!.doneWhen}`}</div>}
        <div className="hstats"><b>{hereStats.pct}%</b><span>{hereStats.done} of {plural(hereStats.total, "task")} done in this {here ? "phase" : "milestone"}</span></div>
        {(here ? here.ms.length > 0 : msWindow.length > 0) && <ol className="steps" aria-label={here ? "Milestones in this phase" : "Milestones"}>
          {stepsOf(here ? here.ms : msWindow).map(s => <li key={s.key} className={`stp ${s.cls}`}>
            <span className="sdot" aria-hidden="true" />
            <div className="scode">{s.code}</div>
            <div className="sname">{s.name}</div>
            <div className="sword">{s.word}</div>
          </li>)}
        </ol>}
        <div className="hfoot">
          <span className="small">Project: {projectPct}% formed · {projectDone} of {plural(all.length, "task")}{phases.length ? ` · ${phasesDone} of ${phases.length} phases done` : ""}</span>
          <button type="button" className="link" onClick={showHere}>Show this {here ? "phase" : "milestone"} ↓</button>
        </div>
      </div>}

      <div className="card">
        <div className="chead">
          <div className="eyebrow ember">{active && upNext.length ? "Up next · pick one" : "Next step"}</div>
          {active && firstMs && <span className="cnum">FROM {firstMs.code === "·" ? "" : `${firstMs.code} · `}{firstMs.name.toUpperCase()}</span>}
        </div>
        {!active ? <div className="next" style={{ marginTop: 10 }}>
          <div className="nxt">This project is {props.statusWord}.</div>
          <div className="nxm" style={{ marginBottom: 14 }}>Its tasks stay out of Today. Make it active to plan it again.</div>
          <div><button type="button" className="btn" disabled={busy} onClick={props.onMakeActive}>Make active</button></div>
        </div> : upNext.length ? <div className="next" style={{ marginTop: 6 }}>
          {upNext.map((t, i) => {
            const note = noteOf(t);
            return <div key={t.id} className={`nx${i === 0 ? " first" : ""}`}>
              <button type="button" className="nxopen" onClick={() => props.onOpenTask(t.id)} aria-haspopup="dialog">
                <span className="nxt">{t.title}</span>
                <span className="nxm"><b>{words[stOf[t.state]]}</b> · {t.code} · {t.minutes} min{note ? ` · ${note.text}` : ""}</span>
              </button>
              <StatusControl task={asTask(t)} />
            </div>;
          })}
        </div> : <div className="next" style={{ marginTop: 10 }}>
          <div className="nxt">Nothing ready yet.</div>
          <div className="nxm" style={{ marginBottom: 14 }}>Add a task with a clear done-when, and Today can suggest it when it fits.</div>
          <div><button type="button" className="btn" onClick={() => props.onAddTask()}>+ Add a task</button></div>
        </div>}
        {active && blocked.length > 0 && <div className="blocked">
          <div className="tx"><b>{blocked.length} blocked:</b> {blocked[0].title}{blocked[0].nextStep ? ` is waiting on ${blocked[0].nextStep.replace(/^waiting on /i, "").replace(/\.$/, "")}.` : "."}</div>
          <button type="button" className="soft red" disabled={moves.busy === blocked[0].id} onClick={() => void moves.move(asTask(blocked[0]), "Ready")}>Unblock</button>
        </div>}
      </div>
    </section>

    <div className="wrap">
      <section className="card" aria-labelledby="pl-phases">
        <div className="chead">
          <div>
            <h2 id="pl-phases" className="eyebrow" style={{ margin: 0 }}>{phases.length ? "Phases" : "Milestones"}</h2>
            <div style={{ marginTop: 6, font: "400 13px var(--sans)", color: "var(--muted)" }}>
              {phases.length ? `${phasesDone} of ${phases.length} done · open one to see its milestones, then its tasks` : "Open one to see its tasks. Add a phase once the project needs stages."}
            </div>
          </div>
          {groups.length > 0 && <button type="button" className="soft" onClick={() => { setOpenP(allOpen ? {} : Object.fromEntries(groups.map(x => [x.key, true]))); setFilter("all"); }}>{allOpen ? "Collapse all" : "Expand all"}</button>}
        </div>
        {all.length > 0 && <div className="toolbar" role="group" aria-label="Show tasks">
          {([["all", "All tasks"], ["open", "Open"], ["b", "Blocked"], ["d", "Done"]] as const).map(([key, label]) =>
            <button key={key} type="button" className={`chip${filter === key ? " on" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span className="c">{counts[key]}</span></button>)}
        </div>}
        {selDoc && <div className="focusbar">
          <span>Showing the phases <b>{selDoc.title}</b> feeds</span><span className="spacer" />
          <button type="button" className="soft" onClick={() => props.onOpenDoc(selDoc.id)}>Open doc</button>
          <button type="button" className="soft" onClick={() => setDoc(null)}>Clear</button>
        </div>}

        <div className="plist">
          {shown.map(({ g: p, ms }) => {
            const open = filtering || Boolean(openPhases[p.key]);
            const isNow = Boolean(here && p.key === here.key);
            const isFed = Boolean(selDoc && p.phaseId && selDoc.phaseIds.includes(String(p.phaseId)));
            const docs = p.phaseId ? map.docs.filter(d => d.phaseIds.includes(String(p.phaseId))) : [];
            const firstOpen = p.tasks.find(t => t.state === "doing" || t.state === "ready");
            const status = p.state === "done" ? "Done" : p.state === "active" ? `${p.pct}% · in progress` : "Ahead";
            return <div key={p.key} id={`pl-phase-${p.key}`} className={`phase ${p.state}${open ? " open" : ""}${isNow ? " now" : ""}${selDoc ? (isFed ? " fed" : " dim") : ""}`}>
              <div className="spine" aria-hidden="true">
                {isNow && <span className="nring" />}
                <span className={`node ${p.state}`} />
              </div>
              <div className="pcol">
                <button type="button" className="phead" onClick={() => togglePhase(p.key)} aria-expanded={open}>
                  <span className="ptop">
                    <span className="pnum">{p.num}</span>
                    <span className="pname">{p.name}</span>
                    {isNow && <span className="nowtag">NOW</span>}
                    {isFed && selDoc && <span className="fedtag">FED BY {selDoc.code}</span>}
                    <span className={`pstatus ${p.state}`}>{status}</span>
                    <svg className="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                  </span>
                  {p.goal && (open || p.state !== "done") && <span className="pgoal">{p.goal}</span>}
                  {(open || p.state === "active") && <span className="pbarrow">
                    <span className={`bar${p.state === "done" ? " mint" : ""}`}><span style={{ width: `${p.pct}%` }} /></span>
                    <span className="t">{p.done} of {plural(p.total, "task")} · {plural(p.ms.filter(m => m.id).length, "milestone")}</span>
                  </span>}
                </button>

                {open && <div className="pbody">
                  {p.phaseId && <>
                    <div className="pinfo">
                      <div className="pin"><div className="k ember">{p.state === "done" ? "What it delivered" : "Next step"}</div>
                        <div className="v">{p.state === "done" ? p.doneWhen || p.goal || "Every task is done." : p.nextStep || (firstOpen ? `${firstOpen.code} ${firstOpen.title}` : "Add a task to this phase.")}</div></div>
                      <div className="pin"><div className="k">{p.state === "done" ? "Closed" : "Done when"}</div>
                        <div className="v">{p.state === "done" ? (p.endedAt ? `Closed ${dayMonth(p.endedAt)}.` : "Closed.") : p.doneWhen || "Not set yet. Edit the phase to add it."}</div></div>
                    </div>
                    <div className="built"><span className="k">BUILT FROM</span>
                      {docs.length ? docs.map(d => <span key={d.id} className="dchip">{d.code}</span>) : <span className="tm" style={{ display: "inline" }}>No docs linked yet</span>}
                    </div>
                  </>}
                  <div className="mlist">
                    {ms.map(({ m, tasks }) => {
                      const s = summary(m.tasks);
                      const mOpen = filtering || Boolean(openMs[m.key]);
                      return <div key={m.key} className={`ms${mOpen ? " open" : ""}`}>
                        <button type="button" className="mhead" onClick={() => toggleMs(m.key)} aria-expanded={mOpen}>
                          <span className={`mcode ${s.state}`}>{m.code}</span>
                          <span className="mname">{m.name}</span>
                          <span className="mprog"><span className="t">{s.state === "done" ? `Done · ${s.done} of ${s.total}` : `${s.done} of ${s.total} done`}</span><span className={`bar${s.state === "done" ? " mint" : ""}`}><span style={{ width: `${s.pct}%` }} /></span></span>
                          <svg className="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
                        </button>
                        {mOpen && <div className="tasks">
                          {tasks.map(t => {
                            const st = stOf[t.state], note = noteOf(t);
                            return <div key={t.id} className={`task ${st}`}>
                              <button type="button" className="topen" onClick={() => props.onOpenTask(t.id)} aria-haspopup="dialog">
                                <span className={`tg ${st}`} aria-hidden="true" />
                                <span className="tbody">
                                  <span className="tt">{t.title}</span>
                                  <span className="tm">{t.code} · {t.minutes} min{note && <> · <b className={note.red ? "red" : undefined}>{note.text}</b></>}</span>
                                </span>
                              </button>
                              <span className={`pill ${st}`}>{words[st]}</span>
                              <span className="act"><StatusControl task={asTask(t)} /></span>
                            </div>;
                          })}
                          {tasks.length === 0 && <div className="tm" style={{ padding: "10px 4px" }}>No tasks yet.</div>}
                          {active && <QuickAdd projectId={map.project.id} milestoneId={m.id ?? undefined} placeholder={`Add a task to ${m.code === "·" ? "this project" : m.code}…`} onMore={title => props.onAddTask(m.id ?? undefined, title)} />}
                          {active && m.id && <div className="pl-msfoot">
                            <button type="button" className="add" onClick={() => props.onEditMilestone(m.id!)}>Edit milestone</button>
                          </div>}
                        </div>}
                      </div>;
                    })}
                    <div className="pl-msfoot">
                      <button type="button" className="add" onClick={() => props.onAddMilestone(p.phaseId ?? undefined)}>+ Add milestone{p.phaseId ? ` to ${p.num}` : ""}</button>
                      {p.phaseId && <button type="button" className="add" onClick={() => props.onEditPhase(p.phaseId!)}>Edit phase</button>}
                    </div>
                  </div>
                </div>}
              </div>
            </div>;
          })}
          {filtering && shown.length === 0 && <div className="empty">Nothing matches this filter.</div>}
          {groups.length === 0 && <div className="empty">No milestones or phases yet. Add a milestone for the next outcome, or a phase if the project has stages.</div>}
        </div>
        <div className="pl-msfoot" style={{ marginTop: 10 }}>
          <button type="button" className="add" onClick={props.onAddPhase}>+ Add phase</button>
          {groups.length === 0 && <button type="button" className="add" onClick={() => props.onAddMilestone()}>+ Add milestone</button>}
        </div>
      </section>

      <aside className="side">
        <section className="card" aria-labelledby="pl-docs">
          <div className="chead"><h2 id="pl-docs" className="eyebrow lilac" style={{ margin: 0 }}>Built from · {plural(map.docs.length, "doc")}</h2>
            {map.docs.length > 0 && <span className="cnum">{docsWritten === map.docs.length ? "ALL WRITTEN" : `${map.docs.length - docsWritten} PLANNED`}</span>}</div>
          <div style={{ marginTop: 6, font: "400 12.5px/1.45 var(--sans)", color: "var(--muted)" }}>{map.docs.length ? "Pick a doc to see which phases it feeds." : "The documents the plan stands on: a PRD, a system design, a schema. The writing stays in your repo."}</div>
          <div className="docs">
            {map.docs.map(d => {
              const feeds = feedsOf(d.phaseIds);
              return <button key={d.id} type="button" className={`doc${doc === d.code ? " on" : ""}`} onClick={() => pickDoc(d.code)} aria-pressed={doc === d.code}>
                <span className="code">{d.code}</span>
                <span style={{ minWidth: 0 }}><span className="dn" style={{ display: "block" }}>{d.title}</span><span className="dm" style={{ display: "block" }}>{feeds.length ? `Feeds phase${feeds.length === 1 ? "" : "s"} ${feeds.join(", ")}` : d.writtenAt === null ? "Planned" : "Feeds no phase yet"}</span></span>
                <span className="darrow" aria-hidden="true">›</span>
              </button>;
            })}
          </div>
          <button type="button" className="add" onClick={props.onAddDoc}>+ Add doc</button>
        </section>

        <section className="card" aria-labelledby="pl-genesis">
          <div className="chead"><h2 id="pl-genesis" className="eyebrow lilac" style={{ margin: 0 }}>Where it came from</h2><button type="button" className="link" onClick={props.onVisual}>Genesis ›</button></div>
          <div className="gsteps">
            {g.idea && <div className="gs"><span className="gi" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2.5L13.5 8 8 13.5 2.5 8z" fill="#C9B8F0" /></svg></span>
              <div><div className="gn">Idea · {g.idea.title}</div><div className="gd">{g.idea.brainstorm ? "Brainstormed" : "Quick capture"}</div></div><span className="gw">{dayMonth(g.idea.createdAt).toUpperCase()}</span></div>}
            {g.research.length > 0 && <div className="gs"><span className="gi" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="#C9B8F0"><circle cx="3" cy="4" r="1.6" /><circle cx="8" cy="4" r="1.6" /><circle cx="13" cy="4" r="1.6" /><circle cx="5.5" cy="8.5" r="1.6" /><circle cx="10.5" cy="8.5" r="1.6" /><circle cx="8" cy="13" r="1.6" fill="#F1EBFF" /></svg></span>
              <div><div className="gn">Research · {plural(g.research.length, "thread")}</div><div className="gd">{plural(sources, "source")}{briefs.length ? `, ${plural(briefs.length, "brief")} by ${briefBy.join(" and ")}` : ""}</div></div>
              <span className="gw">{researchDates.length ? dayRange(Math.min(...researchDates), Math.max(...researchDates)).toUpperCase() : ""}</span></div>}
            {g.report && <div className="gs"><span className="gi" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#C9B8F0" strokeWidth="1.3"><path d="M4 1.8h5.5L12.5 4.8v9.4H4z" /><path d="M6 7.5h4.5M6 10h4.5M6 12.3h3" /></svg></span>
              <div><div className="gn">Report · {g.report.title}</div><div className="gd">{plural(g.report.findings.length, "finding")}</div></div><span className="gw">{dayMonth(g.report.writtenAt).toUpperCase()}</span></div>}
            {g.decision && <div className="gs"><span className="gi" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.2" stroke="#86E3C3" strokeWidth="1.3" /><path d="M5.2 8.2l2 2 3.8-4" stroke="#A6EDD4" strokeWidth="1.5" /></svg></span>
              <div><div className="gn">Decision · {g.decision.verdict}</div>{g.decision.rule && <div className="gd">{g.decision.rule}</div>}</div><span className="gw">{dayMonth(g.decision.at).toUpperCase()}</span></div>}
            <div className="gs"><span className="gi" aria-hidden="true"><span style={{ display: "block", width: 13, height: 13, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #FFE1C4, #F06A2A 70%)", boxShadow: "0 0 10px rgba(255,138,61,.5)" }} /></span>
              <div><div className="gn">Project · {map.project.title}</div><div className="gd">{g.idea ? "Then the docs, then the plan" : "Started as a project"}</div></div><span className="gw">{dayMonth(map.project.createdAt).toUpperCase()}</span></div>
          </div>
          {!g.idea && <div className="gd" style={{ marginTop: 6 }}>The idea and research behind a project live in Ideas → brainstorm.</div>}
        </section>

        <section className="card" aria-labelledby="pl-activity">
          <div className="chead"><h2 id="pl-activity" className="eyebrow" style={{ margin: 0 }}>Activity</h2>{props.inboxCount > 0 && <span className="cnum">{props.inboxCount} IN INBOX</span>}</div>
          {map.activity.length ? <div className="feed">
            {map.activity.slice(0, 4).map((e, i) => {
              const w = who(e.source, initial);
              return <div key={`${e.at}-${i}`} className="fi"><span className={`fav${w.ai ? " ai" : ""}`} aria-hidden="true">{w.initial}</span>
                <div className="ftxt"><span className="fwho">{w.who}</span>{w.ai && <span className="mcp">MCP</span>} {activityLine(e.kind, e.taskTitle, e.note)}<span className="fwhen">{ago(e.at, now)}</span></div></div>;
            })}
          </div> : <div className="gd" style={{ marginTop: 10 }}>Nothing yet. Starting, finishing or logging a task shows up here.</div>}
        </section>
      </aside>
    </div>
  </>;
}
