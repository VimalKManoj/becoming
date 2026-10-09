"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Bone, LinesSkeleton, Skeleton } from "@/components/skeleton";
import { ProjectCard, ProjectCardBones, ProjectsArea, useSaver } from "@/components/projects-view";
import { BlockForm, DoneForm, NextStepForm, Sheet, StatusChip, TaskForm, energyWords, lanes, taskValues, workQuery, workRoute, type EditableTask, type Lane, type TaskView, type WorkRoute } from "@/components/task-forms";
import { useRitual } from "@/components/ritual/ritual-context";
import { plural } from "@/lib/format";
import { useNow } from "@/lib/use-rhythm";

// Work (the prototype's "What you're building."): active projects as wide cards, then one
// column per lane of open tasks with their status in words. Tapping a task opens its sheet,
// which holds every lifecycle action; Done, Archived and all projects are linked at the foot.
// "Plan it for tonight" opens Today's check-in for that task.

export type Task = FunctionReturnType<typeof api.tasks.listPage>["page"][number];
type SheetState = { kind: "task"; id: Id<"tasks">; step?: "done" } | { kind: "edit"; id: Id<"tasks"> } | { kind: "new"; defaults?: Partial<EditableTask> } | null;
type Placement = { projectId: Id<"projects">; text: string } | null;
type Options = FunctionReturnType<typeof api.projects.options> | undefined;

const laneSubs: Record<Lane, string> = { Projects: "Bigger work, in steps", Showcases: "Small, finished pieces", Writing: "Notes and posts" };
const listCopy: Record<Exclude<TaskView, "active">, { label: string; title: string; em: string; hint: string; empty: string }> = {
  blocked: { label: "Blocked", title: "What’s in the ", em: "way.", hint: "Kept out of Today until you unblock them with a next step.", empty: "Nothing is blocked. When a session ends blocked, the task waits here with what’s in the way." },
  done: { label: "Done", title: "Finished ", em: "work.", hint: "Tasks you finished in a session’s recap. Reopen one if it turns out to need more.", empty: "Nothing finished yet. Tasks you finish in a session’s recap arrive here." },
  archived: { label: "Archived", title: "Set ", em: "aside.", hint: "Hidden from every list but kept with its history. Restore one whenever you like.", empty: "Nothing archived. Archiving hides a task without deleting its history." },
};

const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
const isOpen = (task: Pick<Task, "status">) => task.status === "Ready" || task.status === "In progress";
const statusRank: Record<string, number> = { "In progress": 2, "Ready": 1, "Blocked": 0 };

/** Today's check-in for exactly this task. */
const startHref = (task: Pick<Task, "_id">) => `/today?task=${task._id}`;

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

  const openTask = (id: Id<"tasks">, step?: "done") => setSheet({ kind: "task", id, step });
  const closeTask = (id: Id<"tasks">) => { setSheet(null); focusById(`task-${id}`); };
  const toLanes = () => go({ mode: "tasks", view: "active", project: null, adding: false, visual: false });
  // ?new=task (Today's "add a task" link) opens the full task form.
  const newTask = route.adding ? { defaults: undefined } : sheet?.kind === "new" ? sheet : null;
  const closeNew = () => { if (route.adding) go({ adding: false }, "replace"); setSheet(null); };

  return <>
    {route.mode === "projects"
      ? <ProjectsArea openId={route.project} visual={route.visual} onVisual={visual => go({ visual })} onOpen={project => go({ mode: "projects", project })} onBack={toLanes} onOpenTask={openTask} onNewTask={defaults => setSheet({ kind: "new", defaults })} />
      : route.view === "active"
        ? <Lanes onOpenTask={openTask} onOpenProject={project => go({ mode: "projects", project, visual: false })} onRoute={go} onNewTask={() => setSheet({ kind: "new" })} />
        : <TaskListView view={route.view} onOpenTask={openTask} onRoute={go} onBack={toLanes} />}
    {sheet?.kind === "task" && <TaskSheet key={sheet.id} taskId={sheet.id} initialStep={sheet.step} onClose={() => closeTask(sheet.id)} onEdit={() => setSheet({ kind: "edit", id: sheet.id })}
      onOpenProject={project => { setSheet(null); go({ mode: "projects", project, adding: false, visual: false }); }} />}
    {sheet?.kind === "edit" && <EditTaskSheet key={sheet.id} taskId={sheet.id} onDone={() => setSheet({ kind: "task", id: sheet.id })} />}
    {newTask && <NewTaskSheet defaults={newTask.defaults} onClose={closeNew} />}
  </>;
}

// ---------- Lanes ----------

function Lanes({ onOpenTask, onOpenProject, onRoute, onNewTask }: { onOpenTask: (id: Id<"tasks">, step?: "done") => void; onOpenProject: (id: Id<"projects">) => void; onRoute: (next: Partial<WorkRoute>) => void; onNewTask: () => void }) {
  const active = usePaginatedQuery(api.tasks.listPage, { view: "active" }, { initialNumItems: 48 });
  const blocked = usePaginatedQuery(api.tasks.listPage, { view: "blocked" }, { initialNumItems: 24 });
  const projects = useQuery(api.projects.list, { status: "Active" });
  const options = useQuery(api.projects.options);
  const profile = useQuery(api.settings.getProfile);
  const now = useNow();
  const { openCapture, openNewProject } = useRitual();
  const loading = active.status === "LoadingFirstPage" || blocked.status === "LoadingFirstPage" || projects === undefined;
  const pinnedId = profile?.pinnedTaskId;
  const pinned = (task: Task) => task._id === pinnedId && isOpen(task);
  // The pinned task leads, then work already in motion, then ready, then blocked; otherwise the server's order.
  const rank = (task: Task) => (pinned(task) ? 10 : 0) + (statusRank[task.status] ?? 0);
  const tasks = [...active.results, ...blocked.results].sort((a, b) => rank(b) - rank(a));
  const more = active.status === "CanLoadMore" || blocked.status === "CanLoadMore";
  const loadingMore = active.status === "LoadingMore" || blocked.status === "LoadingMore";
  const projectLaneCount = projects?.filter(project => (project.lane ?? "Projects") === "Projects").length ?? 0;

  return <div className="r-wide r-rise-6 w-work">
    <div className="r-head">
      <div><div className="r-eyebrow">Work</div><h1 className="r-title">What you’re <em>building.</em></h1></div>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="button" className="r-ghost sm w-head-btn" onClick={() => openCapture("task")}>+ Add task</button>
        <button type="button" className="r-ghost sm ember w-head-btn" onClick={openNewProject}>+ New project</button>
      </div>
    </div>
    {loading ? <WorkBodySkeleton /> : <>
      <section aria-label="Active projects" className="w-list">
        {projects.length ? projects.map(project => <ProjectCard key={project._id} project={project} now={now} onOpen={() => onOpenProject(project._id)} />)
          : <p className="r-dashed r-body">No active projects. A project groups bigger work into milestones and tasks, so you can watch it move. Start one when something needs more than a few sessions.</p>}
      </section>
      <div className="w-lanes">{lanes.map(lane => {
        const items = tasks.filter(task => task.lane === lane);
        return <section key={lane} className={`w-lane lane-${lane}`} aria-labelledby={`lane-${lane}`}>
          <div className="w-lane-head"><span className="r-dot" aria-hidden="true" /><h2 id={`lane-${lane}`} className="w-lane-name">{lane}</h2><span className="w-lane-sub">{lane === "Projects" && projectLaneCount ? plural(projectLaneCount, "active project") : laneSubs[lane]}</span></div>
          {items.length ? items.map(task => <TaskCard key={task._id} task={task} where={placement(options, task)} pinned={pinned(task)} onOpen={() => onOpenTask(task._id)} onDone={() => onOpenTask(task._id, "done")} />)
            : <p className="w-lane-empty">Nothing open in {lane}.</p>}
        </section>;
      })}</div>
      {more && <button type="button" className="r-ghost sm" style={{ alignSelf: "flex-start" }} disabled={loadingMore} onClick={() => { if (active.status === "CanLoadMore") active.loadMore(48); if (blocked.status === "CanLoadMore") blocked.loadMore(24); }}>{loadingMore ? "Loading more…" : "Load more tasks"}</button>}
      <nav className="w-more" aria-label="More of your work">
        <button type="button" className="r-link" onClick={() => onRoute({ view: "done" })}>Done</button><span aria-hidden="true">·</span>
        <button type="button" className="r-link" onClick={() => onRoute({ view: "archived" })}>Archived</button><span aria-hidden="true">·</span>
        <button type="button" className="r-link" onClick={() => onRoute({ mode: "projects", project: null, visual: false })}>All projects</button><span aria-hidden="true">·</span>
        <button type="button" className="r-link" onClick={onNewTask}>Add a task with every detail</button>
      </nav>
    </>}
  </div>;
}

/** A task in a lane: title, minutes and project, its status in words. The whole card opens its sheet. */
function TaskCard({ task, where, pinned, showLane = false, onOpen, onDone }: { task: Task; where: Placement; pinned: boolean; showLane?: boolean; onOpen: () => void; onDone?: () => void }) {
  const waiting = isOpen(task) ? waitingOn(task).length : 0;
  const meta = [showLane ? task.lane : null, `${task.minutes} min`, where?.text ?? null, waiting ? `waiting on ${plural(waiting, "task")}` : null].filter(Boolean).join(" · ");
  const card = <button type="button" id={`task-${task._id}`} className={`w-task lane-${task.lane}`} onClick={onOpen}>
    {pinned && <span className="w-pin"><span className="r-diamond" aria-hidden="true" />Pinned for tonight</span>}
    <span className="w-task-title">{task.title}</span>
    <span className="w-task-foot">
      <span className="w-task-meta">{showLane && <span className="r-dot" aria-hidden="true" />}{meta}</span>
      <StatusChip status={task.status} archivedFrom={task.archivedFrom} />
    </span>
  </button>;
  if (!onDone || !isOpen(task)) return card;
  // One tap from the lane: start a Ready task, or finish one in progress (with its optional note).
  return <div className="w-task-wrap">{card}<QuickMove task={task} onDone={onDone} /></div>;
}

function QuickMove({ task, onDone }: { task: Task; onDone: () => void }) {
  const setStatus = useMutation(api.tasks.setStatus);
  const { busy, save } = useSaver();
  if (task.status === "In progress") return <button type="button" className="w-quick done" aria-label={`Mark “${task.title}” done`} title="Mark done" onClick={onDone}>✓</button>;
  return <button type="button" className="w-quick" aria-label={`Start “${task.title}”`} title="Start" disabled={busy}
    onClick={() => void save(() => setStatus({ taskId: task._id, status: "In progress" }), `Started “${task.title}”.`)}>▶</button>;
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

/** Everything about one task, and every move the backend allows from its status. */
function TaskSheet({ taskId, initialStep, onClose, onEdit, onOpenProject }: { taskId: Id<"tasks">; initialStep?: "done"; onClose: () => void; onEdit: () => void; onOpenProject: (id: Id<"projects">) => void }) {
  const task = useQuery(api.tasks.get, { taskId });
  const options = useQuery(api.projects.options);
  const profile = useQuery(api.settings.getProfile);
  const pinTask = useMutation(api.tasks.pin);
  const unblockTask = useMutation(api.tasks.unblock);
  const reopenTask = useMutation(api.tasks.reopen);
  const archiveTask = useMutation(api.tasks.archive);
  const restoreTask = useMutation(api.tasks.restore);
  const setStatus = useMutation(api.tasks.setStatus);
  const [step, setStep] = useState<"unblock" | "reopen" | "done" | "block" | null>(initialStep ?? null);
  const { busy, save } = useSaver();

  if (task === undefined) return <Sheet labelledBy="task-sheet-title" eyebrow="Task" onClose={onClose}><h2 id="task-sheet-title" className="sr-only">Task</h2><LinesSkeleton label="Opening the task…" lines={5} /></Sheet>;
  if (task === null) return <Sheet labelledBy="task-sheet-title" eyebrow="Task" onClose={onClose}><h2 id="task-sheet-title" className="w-sheet-title sm">This task isn’t available.</h2></Sheet>;

  const where = placement(options, task);
  const open = isOpen(task);
  const pinned = open && profile?.pinnedTaskId === task._id;
  const waiting = open ? waitingOn(task) : [];
  const stepLabel = task.status === "Blocked" ? "Blocked by" : task.status === "In progress" ? "Pick up here" : "Next step";

  async function moveOn(event: FormEvent<HTMLFormElement>, kind: "unblock" | "reopen") {
    event.preventDefault();
    const nextStep = String(new FormData(event.currentTarget).get("nextStep") || "").trim();
    const saved = kind === "unblock"
      ? await save(() => unblockTask({ taskId, nextStep }), `“${task!.title}” is Ready again and can appear in Today.`)
      : await save(() => reopenTask({ taskId, nextStep }), `“${task!.title}” is back in progress.`);
    if (saved) setStep(null);
  }

  // Moving a task needs no timer: start, finish (with an optional note) or block it here.
  const move = (status: "Ready" | "In progress" | "Blocked" | "Done", message: string, extra: { note?: string; skills?: string[] } = {}) =>
    save(() => setStatus({ taskId, status, ...extra }), message).then(saved => { if (saved) setStep(null); });

  return <Sheet labelledBy="task-sheet-title" eyebrow={<span className={`r-row lane-${task.lane}`} style={{ gap: 8 }}><span className="r-dot" aria-hidden="true" />{task.lane}</span>} onClose={onClose}>
    <div>
      <h2 id="task-sheet-title" className="w-sheet-title sm">{task.title}</h2>
      {where && <button type="button" className="r-link" style={{ marginTop: 8 }} onClick={() => onOpenProject(where.projectId)}>{where.text} →</button>}
    </div>
    <div className="r-row" style={{ gap: 6 }}>
      <StatusChip status={task.status} archivedFrom={task.archivedFrom} />
      {pinned && <span className="r-badge">Pinned for tonight</span>}
      <span className="r-fact mono">{task.minutes} min</span>
      <span className="r-fact">{energyWords[task.energy] ?? `Energy ${task.energy}/3`}</span>
    </div>
    <div className="r-dashed"><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>{task.doneWhen}</div></div>
    {task.nextStep && <div className={`r-inset${task.status === "Blocked" ? " w-blocked" : ""}`}><div className="r-eyebrow-sm">{stepLabel}</div><div className="r-body" style={{ marginTop: 4 }}>{task.nextStep}</div></div>}
    {waiting.length > 0 && <div className="r-inset">
      <div className="r-eyebrow-sm">Waiting on</div>
      <ul className="w-waiting">{waiting.map((title, index) => <li key={`${title}-${index}`}>{title}</li>)}</ul>
      <p className="r-small" style={{ marginTop: 6 }}>Today offers this task once {waiting.length === 1 ? "that is" : "those are"} done.</p>
    </div>}
    {task.smallerStep && <div className="r-inset"><div className="r-eyebrow-sm">Smaller step · {task.smallerMinutes} min</div><div className="r-body" style={{ marginTop: 4 }}>{task.smallerStep}</div><p className="r-small" style={{ marginTop: 4 }}>Done when: {task.smallerDone}</p></div>}
    {step === "done" ? <DoneForm busy={busy} onSubmit={(note, skills) => void move("Done", `“${task.title}” is done.`, { note, skills })} onCancel={() => setStep(null)} />
      : step === "block" ? <BlockForm busy={busy} onSubmit={reason => void move("Blocked", `“${task.title}” is blocked. It stays out of Today until you unblock it.`, { note: reason })} onCancel={() => setStep(null)} />
      : step ? <NextStepForm kind={step} busy={busy} onSubmit={event => void moveOn(event, step)} onCancel={() => setStep(null)} />
      : <>
        <div className="r-row" style={{ gap: 8 }} role="group" aria-label={`Status of ${task.title}`}>
          {task.status === "Ready" && <button type="button" className="r-btn sm" disabled={busy} onClick={() => void move("In progress", `Started “${task.title}”.`)}>Start</button>}
          {(task.status === "Ready" || task.status === "In progress" || task.status === "Blocked") && <button type="button" className={task.status === "In progress" ? "r-btn sm mint" : "r-ghost sm"} disabled={busy} onClick={() => setStep("done")}>Mark done…</button>}
          {open && <button type="button" className="r-ghost sm" disabled={busy} onClick={() => setStep("block")}>Blocked…</button>}
          {task.status === "In progress" && <button type="button" className="r-ghost sm" disabled={busy} onClick={() => void move("Ready", `“${task.title}” is back to Ready.`)}>Move back to Ready</button>}
          {task.status === "Blocked" && <button type="button" className="r-btn sm" disabled={busy} onClick={() => setStep("unblock")}>Unblock</button>}
          {task.status === "Done" && <button type="button" className="r-btn sm" disabled={busy} onClick={() => setStep("reopen")}>Reopen</button>}
          {task.status === "Archived" && <button type="button" className="r-btn sm" disabled={busy} onClick={() => void save(() => restoreTask({ taskId }), `Restored “${task.title}”.`)}>Restore</button>}
          {open && <Link href={startHref(task)} className="r-ghost sm">Focus on it tonight</Link>}
          {open && (pinned
            ? <button type="button" className="r-ghost sm" disabled={busy} onClick={() => void save(() => pinTask({}), "Unpinned.")}>Unpin</button>
            : <button type="button" className="r-ghost sm ember" disabled={busy} onClick={() => void save(() => pinTask({ taskId }), `Pinned “${task.title}”. Today offers it first whenever it fits.`)}>Pin for tonight</button>)}
          {task.status !== "Done" && task.status !== "Archived" && <button type="button" className="r-ghost sm" disabled={busy} onClick={onEdit}>Edit</button>}
        </div>
        {task.status !== "Archived" && <p className="r-small"><button type="button" className="r-underline" disabled={busy} onClick={() => void save(() => archiveTask({ taskId }), `Archived “${task.title}”. Its history is kept; restore it from here or Archived.`)}>Archive</button> · hides it everywhere, keeps its history</p>}
      </>}
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

function EditTaskSheet({ taskId, onDone }: { taskId: Id<"tasks">; onDone: () => void }) {
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
