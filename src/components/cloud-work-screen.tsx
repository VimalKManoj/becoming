"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Bone, LinesSkeleton, Skeleton } from "@/components/skeleton";
import { ProjectCardBones, ProjectsArea, useSaver } from "@/components/projects-view";
import { Sheet, StatusChip, TaskForm, lanes, taskValues, workQuery, workRoute, type EditableTask, type Lane, type TaskView, type WorkRoute } from "@/components/task-forms";
import { useRitual } from "@/components/ritual/ritual-context";
import { WorkOverview } from "@/components/work-overview";
import { NewProjectFlow } from "@/components/new-project/new-project-flow";
import { dayMonth } from "@/components/constellation/model";
import { EVENT_NOTE } from "@/components/constellation/panel";
import { plural } from "@/lib/format";
import { readableError } from "@/lib/errors";
import { StatusControl } from "@/components/tasks/status-control";
import { copyWorkPrompt, workPrompt } from "@/components/tasks/work-prompt";
import { useFocus } from "@/components/focus/focus-layer";
import { QuickAdd } from "@/components/tasks/quick-add";
import { ChoiceField, InlineField } from "@/components/tasks/inline-field";
import { useTaskMove, type MoveTarget } from "@/components/tasks/use-task-move";
import { bloomSkillList } from "../../convex/lib/bloom";
import { useNow } from "@/lib/use-rhythm";

// Work: the overview (projects as rows, loose tasks below), one lane's open tasks, the
// Blocked/Done/Archived lists, and the projects area. Every task moves with the same status
// circle, one tap with an Undo (PLAN-one-tap-and-daily-loop, Phase 1); its sheet edits in place.
// "Start a focus session" is the only way from here into Today's check-in and timer.

export type Task = FunctionReturnType<typeof api.tasks.listPage>["page"][number];
type SheetState = { kind: "task"; id: Id<"tasks"> } | { kind: "edit"; id: Id<"tasks"> } | { kind: "new"; defaults?: Partial<EditableTask> } | null;
type Placement = { projectId: Id<"projects">; text: string } | null;
type Options = FunctionReturnType<typeof api.projects.options> | undefined;

const laneTitles: Record<Lane, ReactNode> = { Projects: <>Bigger work, <em>in steps.</em></>, Showcases: <>Small, finished <em>pieces.</em></>, Writing: <>Notes and <em>posts.</em></> };
const listCopy: Record<Exclude<TaskView, "active">, { label: string; title: string; em: string; hint: string; empty: string }> = {
  blocked: { label: "Blocked", title: "What’s in the ", em: "way.", hint: "Kept out of Today until you unblock them. Click a circle to change its status.", empty: "Nothing is blocked. A blocked task waits here with what’s in the way." },
  done: { label: "Done", title: "Finished ", em: "work.", hint: "Everything you’ve finished, wherever it happened. Click a circle to reopen one.", empty: "Nothing finished yet. Finished tasks arrive here." },
  archived: { label: "Archived", title: "Set ", em: "aside.", hint: "Hidden from every list but kept with its history. Restore one whenever you like.", empty: "Nothing archived. Archiving hides a task without deleting its history." },
};

const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
const isOpen = (task: Pick<Task, "status">) => task.status === "Ready" || task.status === "In progress";
const statusRank: Record<string, number> = { "In progress": 2, "Ready": 1, "Blocked": 0 };

/** Today's check-in for exactly this task. */

function placement(options: Options, task: Pick<Task, "projectId" | "milestoneId">): Placement {
  const project = options?.find(item => item._id === task.projectId);
  if (!project) return null;
  const milestone = project.milestones.find(item => item._id === task.milestoneId);
  return { projectId: project._id, text: milestone ? `${project.title} · ${milestone.title}` : project.title };
}

// Prerequisites that still hold this task back, by title. Done and archived ones don't.
const waitingOn = (task: Pick<Task, "prerequisites">) => task.prerequisites.flatMap(item => item.status === "Done" || item.status === "Archived" ? [] : [item.title]);

// The shared workspace shell handles sign-in; this renders only for a confirmed account.
// useSearchParams needs a Suspense boundary on a prerendered route.
export function CloudWorkScreen() {
  return <Suspense fallback={<WorkSkeleton />}><WorkScreen /></Suspense>;
}

function WorkScreen() {
  const params = useSearchParams();
  const address = params.toString();
  const [route, setRoute] = useState(() => workRoute(params));
  const [seen, setSeen] = useState(address);
  const [sheet, setSheet] = useState<SheetState>(null);
  const now = useNow();
  const { openCapture, openNewProject } = useRitual();
  // Arriving at a new address (a link from Today, or Back) re-reads it. The screen's own
  // writes below describe the route it already shows, so re-reading them changes nothing.
  if (address !== seen) { setSeen(address); setRoute(workRoute(params)); }

  /** Moves within Work. A new screen gets its own history entry, so Back returns to the last one. */
  function go(next: Partial<WorkRoute>, entry: "push" | "replace" = "push") {
    const value = { ...route, ...next };
    setRoute(value);
    const query = workQuery(value);
    // Next.js syncs native history updates with useSearchParams, without a server round trip.
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (entry === "push") { window.history.pushState(null, "", url); document.getElementById("main")?.scrollTo({ top: 0 }); }
    else window.history.replaceState(null, "", url);
  }

  const openTask = (id: Id<"tasks">) => setSheet({ kind: "task", id });
  const closeTask = (id: Id<"tasks">) => { setSheet(null); focusById(`task-${id}`); };
  const toLanes = () => go({ mode: "tasks", view: "active", project: null, adding: false, visual: false, lane: null, creating: false, idea: null });
  // ?new=task (Today's "add a task" link) opens the full task form.
  const newTask = route.adding ? { defaults: undefined } : sheet?.kind === "new" ? sheet : null;
  const closeNew = () => { if (route.adding) go({ adding: false }, "replace"); setSheet(null); };

  // The New project page (?new=project) replaces the rest of Work until it's done or left.
  if (route.creating) return <NewProjectFlow ideaId={route.idea} onCancel={() => window.history.length > 1 ? window.history.back() : toLanes()}
    onOpenProject={project => go({ mode: "projects", project, visual: false, creating: false, idea: null }, "replace")} />;

  return <>
    {route.mode === "projects"
      ? <ProjectsArea openId={route.project} visual={route.visual} onVisual={visual => go({ visual })} onOpen={project => go({ mode: "projects", project })} onBack={toLanes} onOpenTask={openTask} onNewTask={defaults => setSheet({ kind: "new", defaults })} />
      : route.view === "active" && !route.lane
        // Work itself: projects as rows, and only the tasks that belong to no project.
        ? (now === null ? <WorkSkeleton /> : <WorkOverview now={now} onOpenTask={openTask}
          onOpenProject={project => go({ mode: "projects", project, visual: false })}
          onNewTask={defaults => setSheet({ kind: "new", defaults })} onQuickTask={() => openCapture("task")} onNewProject={() => openNewProject()}
          onDone={() => go({ view: "done" })} onArchived={() => go({ view: "archived" })} onAllProjects={() => go({ mode: "projects", project: null, visual: false })} />)
      : route.view === "active"
        ? <OneLane lane={route.lane ?? "Projects"} onOpenTask={openTask} onAllLanes={toLanes} onNewTask={defaults => setSheet({ kind: "new", defaults })} />
        : <TaskListView view={route.view} onOpenTask={openTask} onRoute={go} onBack={toLanes} />}
    {sheet?.kind === "task" && <TaskSheet key={sheet.id} taskId={sheet.id} onClose={() => closeTask(sheet.id)} onEdit={() => setSheet({ kind: "edit", id: sheet.id })}
      onOpenProject={project => { setSheet(null); go({ mode: "projects", project, adding: false, visual: false }); }} />}
    {sheet?.kind === "edit" && <EditTaskSheet key={sheet.id} taskId={sheet.id} onDone={() => setSheet({ kind: "task", id: sheet.id })} />}
    {newTask && <NewTaskSheet defaults={newTask.defaults} onClose={closeNew} />}
  </>;
}

// ---------- One lane ----------

// ?lane= (Today's Small piece and Write) shows that one lane's open tasks to choose from, with
// quick add at the top. Nothing starts a focus session unless you ask for one on the task.
function OneLane({ lane, onOpenTask, onAllLanes, onNewTask }: { lane: Lane; onOpenTask: (id: Id<"tasks">) => void; onAllLanes: () => void; onNewTask: (defaults?: Partial<EditableTask>) => void }) {
  const active = usePaginatedQuery(api.tasks.listPage, { view: "active" }, { initialNumItems: 48 });
  const blocked = usePaginatedQuery(api.tasks.listPage, { view: "blocked" }, { initialNumItems: 24 });
  const options = useQuery(api.projects.options);
  const profile = useQuery(api.settings.getProfile);
  const loading = active.status === "LoadingFirstPage" || blocked.status === "LoadingFirstPage";
  const pinnedId = profile?.pinnedTaskId;
  const pinned = (task: Task) => task._id === pinnedId && isOpen(task);
  // The pinned task leads, then work already in motion, then ready, then blocked; otherwise the server's order.
  const rank = (task: Task) => (pinned(task) ? 10 : 0) + (statusRank[task.status] ?? 0);
  const items = [...active.results, ...blocked.results].filter(task => task.lane === lane).sort((a, b) => rank(b) - rank(a));
  const more = active.status === "CanLoadMore" || blocked.status === "CanLoadMore";
  const loadingMore = active.status === "LoadingMore" || blocked.status === "LoadingMore";

  return <div className="r-wide r-rise-6 w-work">
    <button type="button" className="r-back" onClick={onAllLanes}>‹ All work</button>
    <div className="r-head">
      <div><div className={`r-eyebrow lane-${lane}`}>{lane}</div><h1 className="r-title">{laneTitles[lane]}</h1><p className="r-lede" style={{ marginTop: 6 }}>Pick what you’ll work on. Click a task’s circle to change its status; open a task for the rest.</p></div>
    </div>
    <QuickAdd lane={lane} placeholder={`Add to ${lane}…`} onMore={title => onNewTask({ lane, title })} />
    {loading ? <WorkBodySkeleton /> : <>
      <section className={`w-lane lane-${lane}`} aria-labelledby={`lane-${lane}`}>
        <div className="w-lane-head"><span className="r-dot" aria-hidden="true" /><h2 id={`lane-${lane}`} className="w-lane-name">Open in {lane}</h2><span className="w-lane-sub">{plural(items.length, "task")}</span></div>
        {items.length ? <div className="w-grid">{items.map(task => <TaskCard key={task._id} task={task} where={placement(options, task)} pinned={pinned(task)} onOpen={() => onOpenTask(task._id)} />)}</div>
          : <p className="w-lane-empty">Nothing open in {lane} yet. Add one above, or catch an idea first.</p>}
      </section>
      {more && <button type="button" className="r-ghost sm" style={{ alignSelf: "flex-start" }} disabled={loadingMore} onClick={() => { if (active.status === "CanLoadMore") active.loadMore(48); if (blocked.status === "CanLoadMore") blocked.loadMore(24); }}>{loadingMore ? "Loading more…" : "Load more tasks"}</button>}
    </>}
  </div>;
}

/** A task card: title, minutes and project, its status in words. The circle moves it; the card opens its sheet. */
function TaskCard({ task, where, pinned, showLane = false, onOpen }: { task: Task; where: Placement; pinned: boolean; showLane?: boolean; onOpen: () => void }) {
  const waiting = isOpen(task) ? waitingOn(task).length : 0;
  const meta = [showLane ? task.lane : null, `${task.minutes} min`, where?.text ?? null, waiting ? `waiting on ${plural(waiting, "task")}` : null].filter(Boolean).join(" · ");
  return <div className="w-task-wrap">
    <button type="button" id={`task-${task._id}`} className={`w-task lane-${task.lane}`} onClick={onOpen}>
      {pinned && <span className="w-pin"><span className="r-diamond" aria-hidden="true" />Pinned for tonight</span>}
      <span className="w-task-title">{task.title}</span>
      <span className="w-task-foot">
        <span className="w-task-meta">{showLane && <span className="r-dot" aria-hidden="true" />}{meta}</span>
        <StatusChip status={task.status} archivedFrom={task.archivedFrom} />
      </span>
    </button>
    <StatusControl task={task} />
  </div>;
}

// ---------- Blocked, Done and Archived ----------

function TaskListView({ view, onOpenTask, onRoute, onBack }: { view: Exclude<TaskView, "active">; onOpenTask: (id: Id<"tasks">) => void; onRoute: (next: Partial<WorkRoute>) => void; onBack: () => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.tasks.listPage, { view }, { initialNumItems: 24 });
  const options = useQuery(api.projects.options);
  const copy = listCopy[view];
  return <div className="r-wide r-rise-6 w-work">
    <button type="button" className="r-back" onClick={onBack}>‹ Work</button>
    <div>
      <div className="r-eyebrow">Work · {copy.label}</div>
      <h1 className="r-title">{copy.title}<em>{copy.em}</em></h1>
      <p className="r-lede" style={{ marginTop: 10 }}>{copy.hint}</p>
    </div>
    <div className="r-row" style={{ gap: 6 }} role="group" aria-label="Show tasks">
      {(["blocked", "done", "archived"] as const).map(item => <button key={item} type="button" className="r-chip round" aria-pressed={view === item} onClick={() => onRoute({ view: item })}>{listCopy[item].label}</button>)}
    </div>
    {status === "LoadingFirstPage" ? <Skeleton label="Loading your tasks…" className="w-grid">{[0, 1, 2, 3].map(n => <TaskBones key={n} i={n} />)}</Skeleton>
      : results.length === 0 ? <p className="r-dashed r-body">{copy.empty}</p>
        : <div className="w-grid">{results.map(task => <TaskCard key={task._id} task={task} where={placement(options, task)} pinned={false} showLane onOpen={() => onOpenTask(task._id)} />)}</div>}
    {(status === "CanLoadMore" || status === "LoadingMore") && <button type="button" className="r-ghost sm" style={{ alignSelf: "flex-start" }} disabled={status === "LoadingMore"} onClick={() => loadMore(24)}>{status === "LoadingMore" ? "Loading more…" : "Load more tasks"}</button>}
  </div>;
}

// ---------- Sheets ----------

/** A task's place in its project's plan: its code, phase and milestone, and its sessions. */
function placeInPlan(map: NonNullable<Constellation>, taskId: Id<"tasks">) {
  for (const phase of map.phases) for (const milestone of phase.milestones) for (const t of milestone.tasks) {
    if (t.id === taskId) return { code: t.code, phaseId: phase.id, phase: `Phase ${phase.num} ${phase.name}`, milestone: `${milestone.code} ${milestone.title}`, sessions: t.sessions, planned: t.plannedSessions };
  }
  for (const milestone of map.loose.milestones) for (const t of milestone.tasks) {
    if (t.id === taskId) return { code: t.code, phaseId: null, phase: null, milestone: `${milestone.code} ${milestone.title}`, sessions: t.sessions, planned: t.plannedSessions };
  }
  const t = map.loose.tasks.find(item => item.id === taskId);
  return t ? { code: t.code, phaseId: null, phase: null, milestone: null, sessions: t.sessions, planned: t.plannedSessions } : null;
}

/** The one obvious next step for each status, as the sheet's main button. Everything else is in the status menu. */
const primaryMove: Record<string, { label: string; to: MoveTarget | "restore"; className: string }> = {
  "Ready": { label: "Start", to: "In progress", className: "r-btn sm" },
  "In progress": { label: "Mark done", to: "Done", className: "r-btn sm mint" },
  "Blocked": { label: "Unblock", to: "Ready", className: "r-btn sm" },
  "Archived": { label: "Restore", to: "restore", className: "r-btn sm" },
};
const minuteChoices = [15, 30, 45, 60, 90].map(value => ({ value, label: `${value} min` }));
const energyChoices = [{ value: 1, label: "Low" }, { value: 2, label: "Steady" }, { value: 3, label: "High" }];
const energyName = ["", "Low", "Steady", "High"];

/**
 * One task, as a clean properties sheet. At the top: the title (click to edit), then one row
 * to act on it: the status button (which opens the status menu), the obvious next step and
 * Focus. Below, a list of details, each edited where it's shown. Then its recent history and,
 * at the foot, quiet links for the rest. Every move has an Undo in the toast, and the latest
 * move (yours or an assistant's) can also be undone from the history.
 */
export function TaskSheet({ taskId, onClose, onEdit, onOpenProject }: { taskId: Id<"tasks">; onClose: () => void; onEdit: () => void; onOpenProject: (id: Id<"projects">) => void }) {
  const task = useQuery(api.tasks.get, { taskId });
  const options = useQuery(api.projects.options);
  const profile = useQuery(api.settings.getProfile);
  const editTask = useMutation(api.tasks.edit);
  const pin = useMutation(api.tasks.pin);
  const undoMove = useMutation(api.tasks.undo);
  const moves = useTaskMove();
  const focus = useFocus();
  const { showToast } = useRitual();
  const [skilling, setSkilling] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const [prompting, setPrompting] = useState(false);
  // Where it sits in its project's plan (code, phase, milestone, sessions) and its story.
  const map = useQuery(api.constellation.get, task?.projectId ? { projectId: task.projectId } : "skip");
  const story = useQuery(api.constellation.taskStory, { taskId });

  if (task === undefined) return <Sheet labelledBy="task-sheet-title" eyebrow="Task" onClose={onClose}><h2 id="task-sheet-title" className="sr-only">Task</h2><LinesSkeleton label="Opening the task…" lines={5} /></Sheet>;
  if (task === null) return <Sheet labelledBy="task-sheet-title" eyebrow="Task" onClose={onClose}><h2 id="task-sheet-title" className="w-sheet-title sm">This task isn’t available.</h2></Sheet>;

  const where = placement(options, task);
  const open = isOpen(task);
  const archived = task.status === "Archived";
  const pinned = open && profile?.pinnedTaskId === task._id;
  const waiting = open ? waitingOn(task) : [];
  const stepLabel = task.status === "Blocked" ? "Blocked by" : task.status === "In progress" ? "Pick up here" : "Next step";
  const place = map ? placeInPlan(map, taskId) : null;
  const builtFrom = map && place?.phaseId ? map.docs.filter(d => d.phaseIds.includes(String(place.phaseId))).map(d => d.code) : [];
  const project = options?.find(item => item._id === task.projectId);
  const milestone = project?.milestones.find(item => item._id === task.milestoneId);
  // One short line: the task's code, then its project and milestone (or its lane when it has none).
  const eyebrow = <span>{place ? `${place.code} · ` : ""}{project ? `${project.title}${milestone ? ` › ${milestone.title}` : ""}` : task.lane}</span>;
  const primary = primaryMove[task.status];
  const busy = moves.busy === taskId;
  const history = story ?? [];
  const shownHistory = allHistory ? [...history].reverse() : [...history].reverse().slice(0, 3);

  /** Saves one edited field; the toast confirms, and a refusal says why. */
  async function saveField(fields: { title?: string; nextStep?: string; doneWhen?: string; minutes?: number; energy?: number; skills?: string[]; notes?: string }, message: string) {
    try { await editTask({ taskId, ...fields }); showToast(message); return true; }
    catch (error) { showToast(readableError(error, "Could not save that."), "alert"); return false; }
  }
  const runPrimary = () => primary.to === "restore" ? void moves.restore(task) : void moves.move(task, primary.to);
  const toggleSkill = (name: string) => {
    const has = task.skills.some(skill => skill.toLowerCase() === name.toLowerCase());
    if (!has && task.skills.length >= 5) { showToast("Up to 5 skills on a task.", "alert"); return; }
    void saveField({ skills: has ? task.skills.filter(skill => skill.toLowerCase() !== name.toLowerCase()) : [...task.skills, name] }, has ? `Removed ${name}.` : `Added ${name}.`);
  };
  const undoLatest = async (eventId: Id<"taskEvents">, by: string) => {
    try { await undoMove({ eventId }); showToast(by === "app" ? "Undone." : `Undone. That was ${by}'s change.`); }
    catch (error) { showToast(readableError(error, "Couldn't undo that."), "alert"); }
  };
  const copyPrompt = () => copyWorkPrompt(task, showToast, "Select the prompt below and copy it by hand.");
  const togglePin = async () => {
    try { await pin({ taskId: pinned ? undefined : taskId }); showToast(pinned ? "Unpinned." : "Pinned for tonight. Today offers it first when it fits."); }
    catch (error) { showToast(readableError(error, "Could not change the pin."), "alert"); }
  };

  return <Sheet labelledBy="task-sheet-title" eyebrow={eyebrow} onClose={onClose}>
    <h2 id="task-sheet-title" className="w-sheet-title sm tk-sheet-title">
      {archived ? task.title : <InlineField label="Title" value={task.title} empty="Name the task" maxLength={160} required onSave={title => saveField({ title }, "Title saved.")} />}
    </h2>

    <div className="tk-sheet-actions" role="group" aria-label={`Act on ${task.title}`}>
      <StatusControl task={task} variant="pill" onDeleted={onClose} />
      {primary && <button type="button" className={`${primary.className} tk-act`} disabled={busy} onClick={runPrimary}>{primary.label}</button>}
      {open && <button type="button" className="r-ghost sm tk-act" onClick={() => void focus.start(task)}>{focus.active?.taskId === task._id ? "◉ Focusing" : "▶ Focus"}</button>}
      {pinned && <span className="r-badge">Pinned for tonight</span>}
    </div>

    <dl className="tk-props">
      <dt>Done when</dt>
      <dd>{archived ? task.doneWhen || "Not set" : <InlineField label="Done when" value={task.doneWhen} empty="Add what finished looks like" multiline maxLength={1000} onSave={doneWhen => saveField({ doneWhen }, "Done-when saved.")} />}</dd>
      <dt className={task.status === "Blocked" ? "red" : undefined}>{stepLabel}</dt>
      <dd>{archived ? task.nextStep || "None" : <InlineField label={stepLabel} value={task.nextStep} empty={task.status === "Blocked" ? "Add what’s in the way" : "Add the very next thing to do"} multiline maxLength={2000} onSave={nextStep => saveField({ nextStep }, "Next step saved.")} />}</dd>
      <dt>Notes</dt>
      <dd>{archived ? <span className="tk-notes">{task.notes || "None"}</span> : <InlineField label="Notes" value={task.notes} empty="Add notes: anything worth keeping about it" multiline maxLength={10000} className="tk-notes" onSave={notes => saveField({ notes }, notes ? "Notes saved." : "Notes cleared.")} />}</dd>
      <dt>Time</dt>
      <dd>{archived ? `${task.minutes} min` : <ChoiceField label="Time it takes" value={task.minutes} options={minuteChoices} display={`${task.minutes} min`} onSave={minutes => saveField({ minutes }, `${minutes} minutes.`)} />}</dd>
      <dt>Energy</dt>
      <dd>{archived ? energyName[task.energy] : <ChoiceField label="Energy it needs" value={task.energy} options={energyChoices} display={energyName[task.energy] ?? "Steady"} onSave={energy => saveField({ energy }, `${energyName[energy]} energy.`)} />}</dd>
      <dt>Skills</dt>
      <dd>
        {skilling
          ? <div className="tk-choices">{bloomSkillList.map(skill => <button key={skill.name} type="button" className="r-chip round h34" aria-pressed={task.skills.some(s => s.toLowerCase() === skill.name.toLowerCase())} onClick={() => toggleSkill(skill.name)}>{skill.name}</button>)}
            <button type="button" className="tk-menu-link" onClick={() => setSkilling(false)}>Done</button></div>
          : <button type="button" className={`tk-inline${task.skills.length ? "" : " empty"}`} disabled={archived} aria-label={`Skills: ${task.skills.join(", ") || "none"}. Change`} onClick={() => setSkilling(true)}>
            {task.skills.length ? <span className="w-chips" style={{ marginTop: 0 }}>{task.skills.map(skill => <span key={skill} className="w-skill">{skill}</span>)}</span> : "Add skills (its milestone’s count until then)"}
          </button>}
      </dd>
      {builtFrom.length > 0 && <><dt>Built from</dt><dd><span className="w-chips" style={{ marginTop: 6 }}>{builtFrom.map(code => <span key={code} className="w-dchip">{code}</span>)}</span></dd></>}
      {waiting.length > 0 && <><dt>Waiting on</dt><dd className="tk-plain">{waiting.join(", ")}<span className="r-small"> · Today offers it once {waiting.length === 1 ? "that is" : "those are"} done</span></dd></>}
      {task.smallerStep && <><dt>Smaller step</dt><dd className="tk-plain">{task.smallerStep} <span className="r-small">· {task.smallerMinutes} min · done when {task.smallerDone}</span></dd></>}
      {place && (place.planned || place.sessions > 0) && <><dt>Sessions</dt><dd className="tk-plain">
        {place.planned ? `${place.sessions} of ${place.planned}` : place.sessions}
        {place.planned && <span className="w-evs" role="img" aria-label={`${place.sessions} of ${place.planned} sessions`} style={{ marginTop: 6 }}>
          {Array.from({ length: Math.min(place.planned, 40) }, (_, k) => <span key={k} className={`w-ev${k < place.sessions ? " on" : ""}`} />)}
        </span>}
      </dd></>}
    </dl>

    {history.length > 0 && <section className="tk-history" aria-label="History">
      <div className="r-row r-between"><div className="r-eyebrow-sm">History</div>
        {history.length > 3 && <button type="button" className="tk-menu-link" onClick={() => setAllHistory(on => !on)}>{allHistory ? "Show less" : `Show all ${history.length}`}</button>}</div>
      <ol className="w-tl">{shownHistory.map(e => <li key={e.id} className={`w-te${e.source !== "app" ? " ai" : ""}${e.kind === "blocked" ? " blk" : ""}`}>
        <div className="w-tek">{e.kind.toUpperCase()}{e.source !== "app" && <span className="w-mcp">MCP</span>}</div>
        <div className="w-tet">{e.note ?? EVENT_NOTE[e.kind] ?? e.kind}</div>
        <div className="w-tew">{dayMonth(e.at)}{e.source !== "app" ? ` · via ${e.source}` : ""}
          {e.undoable && !archived && <> · <button type="button" className="tk-undo" aria-label={`Undo: ${e.kind}${e.source !== "app" ? ` by ${e.source}` : ""}`} onClick={() => void undoLatest(e.id, e.source)}>Undo</button></>}</div>
      </li>)}</ol>
    </section>}

    {prompting && <section className="tk-claude" aria-label="Work on this with Claude">
      <div className="r-row r-between"><div className="r-eyebrow-sm">Work on this with Claude</div><button type="button" className="tk-menu-link" onClick={() => setPrompting(false)}>Close</button></div>
      <p className="r-small">Paste this into Claude Code, or any assistant connected to Becoming. It starts the task and finishes it when the done-when is met. With the Becoming plugin, <code className="s-inline-code">/becoming:next {task._id}</code> does the same.</p>
      <pre className="tk-prompt">{workPrompt(task)}</pre>
      <button type="button" className="r-ghost xs" onClick={copyPrompt}>Copy the prompt</button>
    </section>}

    <nav className="tk-sheet-foot" aria-label="More for this task">
      {!archived && <button type="button" className="tk-foot-link" onClick={onEdit}>Edit all details</button>}
      {where && <button type="button" className="tk-foot-link" onClick={() => onOpenProject(where.projectId)}>Open the project</button>}
      {task.projectId && <Link className="tk-foot-link" href={`/work?view=projects&project=${task.projectId}&visual=1`}>See it on the map</Link>}
      {open && <button type="button" className="tk-foot-link" onClick={() => void togglePin()}>{pinned ? "Unpin" : "Pin for tonight"}</button>}
      {!archived && task.status !== "Done" && <button type="button" className="tk-foot-link" aria-expanded={prompting} onClick={() => { setPrompting(true); copyPrompt(); }}>Work on this with Claude</button>}
      {!archived && <button type="button" className="tk-foot-link" disabled={busy} onClick={() => void moves.archive(task)}>Archive</button>}
    </nav>
  </Sheet>;
}

type Constellation = FunctionReturnType<typeof api.constellation.get>;

/** A task's planned sessions from its project's map: a number, null for none, or undefined when unknown. */
function plannedSessionsIn(map: Constellation | undefined, taskId: Id<"tasks">) {
  if (!map) return undefined;
  const tasks = [...map.phases.flatMap(phase => phase.milestones.flatMap(milestone => milestone.tasks)), ...map.loose.milestones.flatMap(milestone => milestone.tasks), ...map.loose.tasks];
  const found = tasks.find(task => task.id === taskId);
  return found ? found.plannedSessions : undefined;
}

export function EditTaskSheet({ taskId, onDone }: { taskId: Id<"tasks">; onDone: () => void }) {
  const task = useQuery(api.tasks.get, { taskId });
  // The task's own record doesn't carry its planned sessions, so a project task reads them
  // from its project's map; the form keeps an unknown value instead of clearing it.
  const map = useQuery(api.constellation.get, task?.projectId ? { projectId: task.projectId } : "skip");
  const updateTask = useMutation(api.tasks.update);
  const { busy, save } = useSaver();
  const loadingPlan = Boolean(task?.projectId) && map === undefined;

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = taskValues(new FormData(event.currentTarget));
    if (await save(() => updateTask({ taskId, ...values }), "Task changes saved.")) onDone();
  }

  return <Sheet labelledBy="task-form-title" eyebrow="Edit task" variant="page" onClose={onDone}>
    {task === undefined || loadingPlan ? <><h2 id="task-form-title" className="sr-only">Edit task</h2><LinesSkeleton label="Opening the task…" lines={6} /></>
      : task === null ? <h2 id="task-form-title" className="w-sheet-title">This task isn’t available.</h2>
        : <TaskForm key={task._id} headingId="task-form-title" title={<>Edit <em>task.</em></>} task={{ ...task, plannedSessions: plannedSessionsIn(map, task._id) }} busy={busy} onSubmit={event => void update(event)} onCancel={onDone} />}
  </Sheet>;
}

function NewTaskSheet({ defaults, onClose }: { defaults?: Partial<EditableTask>; onClose: () => void }) {
  const createTask = useMutation(api.tasks.create);
  const { busy, save } = useSaver();

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = taskValues(new FormData(event.currentTarget));
    if (await save(() => createTask(values), "Task added. It's Ready and can appear in Today.")) onClose();
  }

  return <Sheet labelledBy="task-form-title" eyebrow="New task" variant="page" onClose={onClose}>
    <TaskForm headingId="task-form-title" title={<>A useful <em>next step.</em></>} defaults={defaults} busy={busy} onSubmit={event => void create(event)} onCancel={onClose} />
  </Sheet>;
}

// ---------- Loading ----------

function TaskBones({ i = 0 }: { i?: number }) {
  return <div className="w-task skel-card" aria-hidden="true"><Bone w="78%" h={13} i={i} /><span className="skel-row between"><Bone w={110} h={10} i={i + 1} /><Bone w={64} h={24} shape="pill" i={i + 2} /></span></div>;
}

/** The lanes screen's shape: two project cards, then three lanes of task cards. */
function WorkBodySkeleton() {
  return <Skeleton label="Loading your work…" className="w-work">
    <div className="w-list">{[0, 1].map(n => <ProjectCardBones key={n} i={n * 2} />)}</div>
    <div className="w-lanes" aria-hidden="true">{lanes.map((lane, n) => <div key={lane} className="w-lane">
      <span className="skel-row"><Bone w={8} h={8} shape="circle" i={n} /><Bone w={80} h={13} i={n + 1} /><Bone w={110} h={10} i={n + 2} /></span>
      {[0, 1].map(k => <TaskBones key={k} i={n + k + 2} />)}
    </div>)}</div>
  </Skeleton>;
}

function WorkSkeleton() {
  return <div className="r-wide w-work">
    <span className="skel-row between" aria-hidden="true">
      <span className="skel-stack tight"><Bone w={50} h={10} /><Bone w={320} h={46} i={1} className="bone-title" /></span>
      <span className="skel-row"><Bone w={110} h={44} shape="pill" i={2} /><Bone w={136} h={44} shape="pill" i={3} /></span>
    </span>
    <WorkBodySkeleton />
  </div>;
}
