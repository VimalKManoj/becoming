"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { caseStudyMarkdown } from "../../convex/lib/caseStudy";
import { dayKey } from "../../convex/lib/time";
import { Bone, LinesSkeleton, Skeleton } from "@/components/skeleton";
import { ConstellationView } from "@/components/constellation/constellation-view";
import { Sheet, StatusChip, energies, focusOnMount, type EditableTask, type Lane } from "@/components/task-forms";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { formatDay, plural } from "@/lib/format";
import { lastWorked } from "@/lib/ritual";
import { useNow } from "@/lib/use-rhythm";

// Projects in Work (the prototype's project cards and project page): what it's for, the
// milestone timeline (mint ✓ done, ember-ringed current, hollow later) and the next step,
// with "Plan it for tonight" opening Today's check-in. Progress is counted from task records.
// Editing, status, milestone upkeep, the project's tasks and the case-study draft sit in sheets.
// List | Visual switches the list and the project page to the project constellation; the
// project page also keeps the constellation's phases and docs (plan: PLAN-project-constellation.md).

type ProjectStatus = "Active" | "Done" | "Archived";
type Detail = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Milestone = Detail["milestones"][number];
type DetailTask = Detail["unassigned"][number];
type Summary = FunctionReturnType<typeof api.projects.list>[number];
type Progress = { done: number; total: number };
type MilestoneState = "done" | "current" | "next" | "later";
type Constellation = NonNullable<FunctionReturnType<typeof api.constellation.get>>;
type PhaseView = Constellation["phases"][number];
type DocView = Constellation["docs"][number];
type PhaseChoice = Pick<PhaseView, "id" | "num" | "name">;

const projectStatuses = ["Active", "Done", "Archived"] as const;
const field = (data: FormData, name: string) => String(data.get(name) || "").trim();
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
const percentOf = (progress: Progress) => progress.total ? Math.round(progress.done / progress.total * 100) : 0;
const laneClass = (lane: Lane | null) => `lane-${lane ?? "Projects"}`;
export const planHref = (projectId: Id<"projects">) => `/today?intent=build&project=${projectId}`;

/** Done milestones, then the first open one is current, the one after it next, the rest later. */
function milestoneStates(milestones: Pick<Milestone, "completedAt">[]): MilestoneState[] {
  const firstOpen = milestones.findIndex(milestone => milestone.completedAt === undefined);
  return milestones.map((milestone, index) => milestone.completedAt !== undefined ? "done" : index === firstOpen ? "current" : index === firstOpen + 1 ? "next" : "later");
}

// Every state is also a word, so the timeline never relies on colour or the mark alone.
function milestoneMeta(milestone: Milestone, state: MilestoneState) {
  if (state === "done") return `Done · ${milestone.progress.done} of ${plural(milestone.progress.total, "task")}`;
  const started = milestone.progress.done > 0 || milestone.tasks.some(task => task.status === "In progress");
  const word = state === "current" ? (started ? "In progress" : "Current") : state === "next" ? "Next" : "Later";
  return milestone.progress.total ? `${word} · ${milestone.progress.done} of ${milestone.progress.total}` : `${word} · no tasks yet`;
}

function milestoneLine(summary: Summary["milestones"]) {
  if (!summary.total) return "No milestones yet";
  return summary.current === null ? `All ${plural(summary.total, "milestone")} done` : `Milestone ${summary.current} of ${summary.total}`;
}

// Shared save handling: a busy flag, and the result as a toast.
export function useSaver() {
  const { showToast } = useRitual();
  const [busy, setBusy] = useState(false);
  async function save(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); showToast(success); return true; }
    catch (caught) { showToast(readableError(caught), "alert"); return false; }
    finally { setBusy(false); }
  }
  return { busy, save };
}

// ---------- Cards ----------

/** One project, as the prototype's wide card: lane and rhythm, name, next step, milestone and task progress. */
export function ProjectCard({ project, now, onOpen }: { project: Summary; now: number | null; onOpen: () => void }) {
  const state = project.status === "Active" ? (now === null ? "" : lastWorked(project.lastWorkedAt, now)) : project.status.toLowerCase();
  return <button type="button" id={`project-${project._id}`} className={`w-proj ${laneClass(project.lane)}`} onClick={onOpen}>
    <span className="w-proj-main">
      <span className="w-eyebrow"><span className="r-dot" aria-hidden="true" />{project.lane ?? "Project"}{state ? ` · ${state}` : ""}</span>
      <span className="w-proj-name">{project.title}</span>
      <span className="w-proj-next">{project.nextTask ? `Next: ${project.nextTask.title}` : project.status === "Active" ? "Next: nothing ready yet" : project.purpose}</span>
    </span>
    <span className="w-proj-progress">
      <span className="w-mono-line"><span>{milestoneLine(project.milestones)}</span><span>{project.progress.total ? `${project.progress.done} / ${plural(project.progress.total, "task")}` : "No tasks yet"}</span></span>
      <span className="r-bar w-bar" aria-hidden="true"><span style={{ width: `${percentOf(project.progress)}%` }} /></span>
    </span>
    <span className="w-open" aria-hidden="true">Open →</span>
  </button>;
}

export function ProjectCardBones({ i = 0 }: { i?: number }) {
  return <div className="w-proj skel-card" aria-hidden="true" style={{ display: "flex" }}>
    <span className="w-proj-main skel-full"><Bone w="38%" h={11} i={i} /><Bone w="62%" h={28} i={i + 1} className="bone-title" /><Bone w="48%" h={12} i={i + 2} /></span>
    <span className="w-proj-progress skel-full"><span className="skel-row between"><Bone w={110} h={11} i={i + 2} /><Bone w={80} h={11} i={i + 3} /></span><Bone h={6} shape="pill" i={i + 4} /></span>
  </div>;
}

// ---------- The projects list (?view=projects) ----------

const emptyCopy: Record<ProjectStatus, string> = {
  Active: "No active projects. A project groups bigger work into milestones and tasks, so you can watch it move.",
  Done: "Nothing finished yet. A project you mark done rests here with its milestones, sessions and evidence kept.",
  Archived: "Nothing archived. Archiving keeps every session and piece of evidence, puts its open tasks away with it, and stops the project feeding Today. Make it active to bring them back.",
};

type AreaProps = {
  /** The open project from the URL or a click. It may be any string from `?project=`. */
  openId: string | null;
  /** List or Visual (`?visual=1`). */
  visual: boolean;
  onVisual: (visual: boolean) => void;
  onOpen:(projectId: Id<"projects"> | null) => void;
  onBack: () => void;
  onOpenTask: (taskId: Id<"tasks">) => void;
  onNewTask: (defaults: Partial<EditableTask>) => void;
};

/** Work's project mode: one project's page, or every project by status. */
export function ProjectsArea({ openId, visual, onVisual, onOpen, onBack, onOpenTask, onNewTask }: AreaProps) {
  // A `?project=` link is checked against your own projects before it is read, so a stale
  // or mistyped id says so instead of failing the whole screen.
  const options = useQuery(api.projects.options, openId ? {} : "skip");
  const [status, setStatus] = useState<ProjectStatus>("Active");
  if (openId && options === undefined) return <ProjectSkeleton />;
  const known = openId ? options?.find(item => item._id === openId) : undefined;
  // Back to Work, with focus on the project's card.
  if (known) return <ProjectPage key={known._id} projectId={known._id} visual={visual} onVisual={onVisual} onOpenTask={onOpenTask} onNewTask={onNewTask} onBack={() => { onBack(); focusById(`project-${known._id}`); }} />;
  return <ProjectsList status={status} onStatus={setStatus} visual={visual} onVisual={onVisual} notFound={Boolean(openId)} onOpen={projectId => onOpen(projectId)} onDismiss={() => onOpen(null)} onBack={onBack} />;
}

/** The design's List | Visual control: two buttons, the current one pressed. */
function ViewSwitch({ visual, onVisual }: { visual: boolean; onVisual: (visual: boolean) => void }) {
  return <div className="w-seg" role="group" aria-label="Projects view">
    <button type="button" className={visual ? undefined : "on"} aria-pressed={!visual} onClick={() => { if (visual) onVisual(false); }}>List</button>
    <button type="button" className={visual ? "on" : undefined} aria-pressed={visual} onClick={() => { if (!visual) onVisual(true); }}>Visual</button>
  </div>;
}

function ProjectsList({ status, onStatus, visual, onVisual, notFound, onOpen, onDismiss, onBack }: { status: ProjectStatus; onStatus: (status: ProjectStatus) => void; visual: boolean; onVisual: (visual: boolean) => void; notFound: boolean; onOpen: (projectId: Id<"projects">) => void; onDismiss: () => void; onBack: () => void }) {
  const projects = useQuery(api.projects.list, visual ? "skip" : { status });
  const now = useNow();
  const { openNewProject } = useRitual();
  return <div className="r-wide r-rise-6" style={{ gap: 22 }}>
    {/* The design's header: Work's Tasks | Projects tabs and + New project, then the title beside List | Visual. */}
    <header className="w-header">
      <div className="w-hrow">
        <nav className="w-tabs" aria-label="Work">
          <span className="r-eyebrow w-tabs-label">Work</span>
          <button type="button" className="w-tab" onClick={onBack}>Tasks</button>
          <button type="button" className="w-tab cur" aria-current="page">Projects</button>
        </nav>
        <button type="button" className="r-ghost sm ember w-head-btn" onClick={openNewProject}>+ New project</button>
      </div>
      <div className="w-trow">
        <h1 className="r-title">Every <em>project.</em></h1>
        <ViewSwitch visual={visual} onVisual={onVisual} />
      </div>
    </header>
    {notFound && <div className="r-dashed r-row r-between" style={{ gap: 10 }} role="status">
      <span className="r-body">That project link doesn’t match one of your projects. Here are your projects instead.</span>
      <button type="button" className="r-ghost xs" onClick={onDismiss}>OK</button>
    </div>}
    {visual ? <VisualPicker onOpen={onOpen} /> : <>
      <div className="r-row" style={{ gap: 6 }} role="group" aria-label="Show projects">
        {projectStatuses.map(item => <button key={item} type="button" className="r-chip round" aria-pressed={status === item} onClick={() => onStatus(item)}>{item}</button>)}
      </div>
      {projects === undefined ? <Skeleton label="Loading your projects…" className="w-list">{[0, 1, 2].map(n => <ProjectCardBones key={n} i={n * 2} />)}</Skeleton>
        : projects.length === 0 ? <p className="r-dashed r-body">{emptyCopy[status]}</p>
          : <div className="w-list">{projects.map(project => <ProjectCard key={project._id} project={project} now={now} onOpen={() => onOpen(project._id)} />)}</div>}
    </>}
  </div>;
}

/** Visual maps one project: chips of the active ones, starting with the one worked on most recently. */
function VisualPicker({ onOpen }: { onOpen: (projectId: Id<"projects">) => void }) {
  const projects = useQuery(api.projects.list, { status: "Active" });
  const [picked, setPicked] = useState<string | null>(null);
  if (projects === undefined) return <Skeleton label="Loading your projects…" className="w-picker"><Bone w={120} h={34} shape="pill" /><Bone w={150} h={34} shape="pill" i={1} /><Bone w={110} h={34} shape="pill" i={2} /></Skeleton>;
  if (projects.length === 0) return <p className="r-dashed r-body">No active projects to map. The constellation draws one active project at a time: start one, or make a finished project active again from List.</p>;
  const recent = projects.reduce((best, item) => (item.lastWorkedAt ?? -1) > (best.lastWorkedAt ?? -1) ? item : best, projects[0]);
  const chosen = projects.find(item => item._id === picked) ?? recent;
  return <>
    <div className="w-picker">
      <div className="r-row w-picker-chips" role="radiogroup" aria-label="Project to map" onKeyDown={radioKeys}>
        {projects.map(item => <button key={item._id} type="button" role="radio" aria-checked={item._id === chosen._id} tabIndex={item._id === chosen._id ? 0 : -1} className="r-chip round h34" onClick={() => setPicked(item._id)}>{item.title}</button>)}
      </div>
      <button type="button" className="r-link" onClick={() => onOpen(chosen._id)}>Open {chosen.title} ›</button>
    </div>
    <ConstellationView key={chosen._id} projectId={chosen._id} />
  </>;
}

// ---------- One project ----------

export function ProjectSkeleton() {
  return <Skeleton label="Opening the project…" className="w-page">
    <Bone w={86} h={36} shape="pill" />
    <span className="skel-full" aria-hidden="true"><Bone w={150} h={11} i={1} /><Bone w="56%" h={48} i={2} className="bone-title" /><Bone w="70%" h={14} i={3} /></span>
    <div className="w-cols" aria-hidden="true">
      <div className="w-ms-card skel-card"><span className="skel-row between"><Bone w={90} h={11} i={3} /><Bone w={120} h={11} i={4} /></span><Bone h={6} shape="pill" i={4} />
        {[0, 1, 2, 3].map(n => <span key={n} className="skel-row"><Bone w={20} h={20} shape="circle" i={5 + n} /><span className="skel-grow"><Bone w="52%" h={13} i={5 + n} /><Bone w="34%" h={10} i={6 + n} /></span></span>)}
      </div>
      <div className="w-next skel-card"><Bone w={80} h={10} i={4} /><Bone w="80%" h={28} i={5} className="bone-title" /><Bone w="60%" h={12} i={6} /><Bone h={54} shape="pill" i={7} className="bone-button" /></div>
    </div>
  </Skeleton>;
}

type ProjectSheet = { kind: "edit" } | { kind: "case-study" } | { kind: "add-milestone" } | { kind: "milestone"; id: Id<"milestones"> }
  | { kind: "add-phase" } | { kind: "phase"; id: Id<"phases"> } | { kind: "add-doc" } | { kind: "doc"; id: Id<"projectDocs"> } | { kind: "delete" } | null;

function ProjectPage({ projectId, visual, onVisual, onBack, onOpenTask, onNewTask }: { projectId: Id<"projects">; visual: boolean; onVisual: (visual: boolean) => void; onBack: () => void; onOpenTask: (taskId: Id<"tasks">) => void; onNewTask: (defaults: Partial<EditableTask>) => void }) {
  const project = useQuery(api.projects.get, { projectId });
  // Phases, docs and which phase each milestone sits in come from the project's map.
  const map = useQuery(api.constellation.get, { projectId });
  const updateProject = useMutation(api.projects.update);
  const setStatus = useMutation(api.projects.setStatus);
  const addMilestone = useMutation(api.projects.addMilestone);
  const addPhase = useMutation(api.constellation.addPhase);
  const addDoc = useMutation(api.constellation.addDoc);
  const [sheet, setSheet] = useState<ProjectSheet>(null);
  const { busy, save } = useSaver();

  if (project === undefined) return <ProjectSkeleton />;
  if (project === null) return <div className="w-page r-rise-6">
    <button type="button" className="r-back" onClick={onBack}>‹ Work</button>
    <p className="r-dashed r-body">This project isn’t available.</p>
  </div>;

  const close = (focusId: string) => { setSheet(null); focusById(focusId); };
  const states = milestoneStates(project.milestones);
  const active = project.status === "Active";
  const lane = project.lane;
  const next = project.nextTask;
  const changeStatus = (status: ProjectStatus, text: string) => void save(() => setStatus({ projectId, status }), text);
  const newTask = (milestoneId?: Id<"milestones">) => onNewTask({ projectId, milestoneId, lane: lane ?? "Projects" });

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { projectId, title: field(data, "title"), purpose: field(data, "purpose"), outcome: field(data, "outcome") };
    if (await save(() => updateProject(values), "Project details saved.")) close("project-title");
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await save(() => addMilestone({ projectId, title: field(data, "title"), doneWhen: field(data, "doneWhen") }), "Milestone added.")) close("milestones-heading");
  }

  async function createPhase(values: PhaseValues) {
    if (await save(() => addPhase({ projectId, ...values }), `Phase “${values.name}” added.`)) close("phases-heading");
  }

  async function createDoc(values: DocValues) {
    if (await save(() => addDoc({ projectId, ...values }), `${values.code.toUpperCase()} added to the docs.`)) close("docs-heading");
  }

  const phases = map?.phases;
  const phaseChoices: PhaseChoice[] | undefined = phases?.map(({ id, num, name }) => ({ id, num, name }));
  const phaseOf = new Map(phases?.flatMap(phase => phase.milestones.map(item => [String(item.id), phase] as const)) ?? []);

  const allTasks = [...project.milestones.flatMap(milestone => milestone.tasks.map(task => ({ task, where: milestone.title }))), ...project.unassigned.map(task => ({ task, where: "" }))];
  const energy = next ? energies.find(item => item.value === next.energy)?.label : undefined;

  return <div className={`w-page r-rise-6${visual ? " w-page-wide" : ""}`}>
    <button type="button" className="r-back" onClick={onBack}>‹ Work</button>
    <div className="w-trow">
      <div className={`w-title-block ${laneClass(lane)}`}>
        <div className="w-eyebrow"><span className="r-dot" aria-hidden="true" />{lane ?? "Project"} · {project.status.toLowerCase()}</div>
        {/* Focus lands on the title when the project opens, and again after editing its details. */}
        <h1 id="project-title" ref={focusOnMount} tabIndex={-1} className="w-project-title">{project.title}</h1>
        <p className="w-purpose">{project.purpose}</p>
        {project.outcome && <p className="w-purpose" style={{ marginTop: 6 }}><span className="r-eyebrow-sm">Outcome · </span>{project.outcome}</p>}
      </div>
      <ViewSwitch visual={visual} onVisual={onVisual} />
    </div>

    {visual ? <ConstellationView projectId={projectId} /> : <>
    <div className="w-cols">
      <section className={`w-ms-card ${laneClass(lane)}`} aria-labelledby="milestones-heading">
        <div className="w-mono-line"><h2 id="milestones-heading" tabIndex={-1} className="w-mono-head">MILESTONES</h2><span>{project.progress.done} / {plural(project.progress.total, "task")} · {percentOf(project.progress)}%</span></div>
        <div className="r-bar w-ms-bar" role="img" aria-label={`${project.progress.done} of ${plural(project.progress.total, "task")} done`}><span style={{ width: `${percentOf(project.progress)}%` }} /></div>
        {project.milestones.length === 0 ? <p className="w-none">No milestones yet. Add them when the shape is clearer. Ready tasks still reach Today.</p>
          : <ol className="w-timeline">{project.milestones.map((milestone, index) => {
            const state = states[index];
            const phase = phaseOf.get(String(milestone._id));
            return <li key={milestone._id}>
              <button type="button" id={`milestone-${milestone._id}`} className={`w-ms ${state}`} onClick={() => setSheet({ kind: "milestone", id: milestone._id })}>
                <span className="w-ms-rail" aria-hidden="true"><span className="w-mark">{state === "done" ? "✓" : ""}</span><span className="w-line" /></span>
                <span className="w-ms-text"><span className="w-ms-name">{milestone.title}</span><span className="w-ms-meta">{phase ? `Phase ${phase.num} · ` : ""}{milestoneMeta(milestone, state)}</span></span>
              </button>
            </li>;
          })}</ol>}
        <button type="button" id="add-milestone" className="r-link" style={{ marginTop: 6 }} onClick={() => setSheet({ kind: "add-milestone" })}>+ Add milestone</button>
      </section>

      <section className="w-next" aria-labelledby="next-heading">
        <h2 id="next-heading" className="r-eyebrow ember">Next step</h2>
        {!active ? <>
          <p className="w-next-title">This project is {project.status.toLowerCase()}.</p>
          <p className="w-next-meta">Its tasks stay out of Today. Make it active to plan it again.</p>
          <button type="button" className="r-btn block w-plan" disabled={busy} onClick={() => changeStatus("Active", "Project is active again.")}>Make active</button>
        </> : next ? <>
          <p className="w-next-title">{next.title}</p>
          <p className="w-next-meta">{next.minutes} min{next.smallerMinutes ? ` · or a ${next.smallerMinutes} min smaller step` : ""}{energy ? ` · ${energy} energy` : ""}</p>
          <Link href={planHref(projectId)} className="r-btn block w-plan">Plan it for tonight</Link>
          <button type="button" className="r-link" style={{ marginTop: 12 }} onClick={() => onOpenTask(next._id)}>Open this task</button>
        </> : <>
          <p className="w-next-title">Nothing ready yet.</p>
          <p className="w-next-meta">Add a task with a clear done-when, and Today can suggest it when it fits.</p>
          <button type="button" className="r-btn block w-plan" onClick={() => newTask()}>+ Add a task</button>
        </>}
      </section>
    </div>

    <div className="w-cols">
      <PhasesCard map={map} onOpen={id => setSheet({ kind: "phase", id })} onAdd={() => setSheet({ kind: "add-phase" })} />
      <DocsCard map={map} onOpen={id => setSheet({ kind: "doc", id })} onAdd={() => setSheet({ kind: "add-doc" })} />
    </div>

    <section className="r-card w-tasks-card" aria-labelledby="project-tasks-heading">
      <div className="w-mono-line"><h2 id="project-tasks-heading" className="w-mono-head">TASKS</h2>{active && <button type="button" className="r-ghost xs" onClick={() => newTask()}>+ Add task</button>}</div>
      {allTasks.length === 0 ? <p className="w-none" style={{ marginTop: 10 }}>No tasks yet.</p>
        : <ul className="w-rows">{allTasks.map(({ task, where }) => <li key={task._id}><TaskRow task={task} where={where} onOpen={() => onOpenTask(task._id)} /></li>)}</ul>}
    </section>

    <div className="r-row" style={{ gap: 8 }} role="group" aria-label="Project actions">
      <button type="button" id="project-edit" className="r-ghost xs" onClick={() => setSheet({ kind: "edit" })}>Edit details</button>
      <button type="button" id="project-case-study" className="r-ghost xs" onClick={() => setSheet({ kind: "case-study" })}>Case study draft</button>
      {active ? <>
        <button type="button" className="r-ghost xs" disabled={busy} onClick={() => changeStatus("Done", "Project marked done. Its open tasks no longer appear in Today.")}>Mark done</button>
        <button type="button" className="r-ghost xs" disabled={busy} onClick={() => changeStatus("Archived", "Project archived with its open tasks. Make it active to bring them back.")}>Archive</button>
      </> : <button type="button" className="r-ghost xs" disabled={busy} onClick={() => changeStatus("Active", "Project is active again.")}>Make active</button>}
      <button type="button" id="project-delete" className="r-ghost xs" onClick={() => setSheet({ kind: "delete" })}>Delete project</button>
    </div>
    <p className="r-small">Progress counts completed tasks, so adding a task can lower the percentage. Archived tasks aren’t counted.</p>
    </>}

    {sheet?.kind === "edit" && <Sheet labelledBy="project-form-title" eyebrow="Edit project" variant="page" onClose={() => close("project-edit")}>
      <ProjectForm project={project} busy={busy} onSubmit={event => void edit(event)} onCancel={() => close("project-edit")} />
    </Sheet>}
    {sheet?.kind === "add-milestone" && <Sheet labelledBy="milestone-form-title" eyebrow={project.title} onClose={() => close("add-milestone")}>
      <h2 id="milestone-form-title" className="w-sheet-title sm">Add a <em>milestone.</em></h2>
      <p className="r-small">An outcome made of a few tasks, such as “Usable Today flow”. The first one that isn’t complete is the current one.</p>
      <MilestoneForm busy={busy} onSubmit={event => void createMilestone(event)} onCancel={() => close("add-milestone")} />
    </Sheet>}
    {sheet?.kind === "milestone" && (() => {
      const index = project.milestones.findIndex(item => item._id === sheet.id);
      if (index < 0) return null;
      return <MilestoneSheet key={sheet.id} projectTitle={project.title} milestone={project.milestones[index]} state={states[index]} index={index} count={project.milestones.length} canAdd={active}
        phases={phaseChoices} phaseId={phaseOf.get(String(sheet.id))?.id ?? null}
        onClose={() => close(`milestone-${sheet.id}`)} onRemoved={() => close("milestones-heading")}
        onOpenTask={taskId => { setSheet(null); onOpenTask(taskId); }} onNewTask={() => { setSheet(null); newTask(sheet.id); }} />;
    })()}
    {sheet?.kind === "add-phase" && <Sheet labelledBy="phase-form-title" eyebrow={project.title} onClose={() => close("add-phase")}>
      <h2 id="phase-form-title" className="w-sheet-title sm">Add a <em>phase.</em></h2>
      <p className="r-small">A stage of the plan, such as “Reliability &amp; real use”. It comes after the phases you already have; milestones join it from their own sheet.</p>
      <PhaseForm busy={busy} onSave={values => void createPhase(values)} onCancel={() => close("add-phase")} />
    </Sheet>}
    {sheet?.kind === "phase" && (() => {
      const index = phases?.findIndex(item => item.id === sheet.id) ?? -1;
      if (!phases || index < 0) return null;
      return <PhaseSheet key={sheet.id} projectTitle={project.title} phase={phases[index]} index={index} count={phases.length}
        onClose={() => close(`phase-${sheet.id}`)} onRemoved={() => close("phases-heading")} />;
    })()}
    {sheet?.kind === "add-doc" && <Sheet labelledBy="doc-form-title" eyebrow={project.title} variant="page" onClose={() => close("add-doc")}>
      <h2 id="doc-form-title" className="w-sheet-title">Add a <em>doc.</em></h2>
      <p className="r-lede">A document the plan stands on, like a PRD or a system design. The writing stays in your repo; Becoming keeps its details, a link, and the phases it feeds.</p>
      <DocForm phases={phaseChoices ?? []} busy={busy} onSave={values => void createDoc(values)} onCancel={() => close("add-doc")} />
    </Sheet>}
    {sheet?.kind === "doc" && (() => {
      const doc = map?.docs.find(item => item.id === sheet.id);
      if (!doc) return null;
      return <DocSheet key={sheet.id} projectTitle={project.title} doc={doc} phases={phaseChoices ?? []}
        onClose={() => close(`doc-${sheet.id}`)} onRemoved={() => close("docs-heading")} />;
    })()}
    {sheet?.kind === "case-study" && <Sheet labelledBy="case-study-title" eyebrow="Case study draft" variant="page" onClose={() => close("project-case-study")}>
      <h2 id="case-study-title" className="w-sheet-title">Tell the <em>story.</em></h2>
      <p className="r-lede">Arranges this project&apos;s saved sessions, milestones and evidence into Markdown you can edit. It invents nothing and shares nothing.</p>
      <CaseStudyPanel projectId={projectId} title={project.title} />
    </Sheet>}
    {sheet?.kind === "delete" && <DeleteProjectSheet projectId={projectId} active={active} onClose={() => close("project-delete")}
      onArchive={() => { setSheet(null); changeStatus("Archived", "Project archived with its open tasks. Make it active to bring them back."); }} onDeleted={onBack} />}
  </div>;
}

// Deleting is for good, so the sheet says exactly what goes with the project, and offers Archive.
function DeleteProjectSheet({ projectId, active, onClose, onArchive, onDeleted }: { projectId: Id<"projects">; active: boolean; onClose: () => void; onArchive: () => void; onDeleted: () => void }) {
  const preview = useQuery(api.projects.deletePreview, { projectId });
  const remove = useMutation(api.projects.remove);
  const { busy, save } = useSaver();
  const goes = preview ? [plural(preview.tasks, "task"), plural(preview.sessions, "session"), plural(preview.evidence, "piece of evidence", "pieces of evidence"), plural(preview.milestones, "milestone"), plural(preview.phases, "phase"), plural(preview.docs, "doc")] : [];

  return <Sheet labelledBy="delete-project-title" eyebrow="Delete project" onClose={onClose}>
    <h2 id="delete-project-title" className="w-sheet-title sm">Delete <em>{preview?.title ?? "this project"}?</em></h2>
    {preview === undefined ? <LinesSkeleton lines={3} label="Counting what this project holds" />
      : preview === null ? <p className="r-body">This project isn’t available.</p> : <>
        <p className="r-body">This removes the project for good, with {goes.slice(0, -1).join(", ")} and {goes.at(-1)}.</p>
        {preview.sessions > 0 && <p className="r-small">Its sessions leave your Journey too, so past weeks, streaks and the bloom count them no longer.</p>}
        <p className="r-small">Ideas it grew from stay in Ideas. Archive instead keeps everything: its open tasks are put away until you make it active again.</p>
        {preview.running && <p className="r-dashed r-body">A focus session is running on one of its tasks. Finish or cancel it first.</p>}
        <div className="r-row" style={{ gap: 8 }}>
          <button type="button" className="r-ghost red" disabled={busy || preview.running}
            onClick={() => void save(() => remove({ projectId }), `“${preview.title}” deleted.`).then(ok => { if (ok) onDeleted(); })}>{busy ? "Deleting…" : "Delete for good"}</button>
          {active && <button type="button" className="r-ghost xs" disabled={busy} onClick={onArchive}>Archive instead</button>}
          <button type="button" className="r-ghost xs" ref={focusOnMount} disabled={busy} onClick={onClose}>Keep it</button>
        </div>
      </>}
  </Sheet>;
}

/** A compact task line: title, minutes and where it sits, and its status in words. */
export function TaskRow({ task, where, onOpen }: { task: Pick<DetailTask, "_id" | "title" | "status" | "minutes" | "lane" | "nextStep">; where?: string; onOpen: () => void }) {
  return <button type="button" id={`task-${task._id}`} className={`w-row lane-${task.lane}`} onClick={onOpen}>
    <span className="r-dot" aria-hidden="true" />
    <span className="w-row-text"><span className="w-row-title">{task.title}</span><span className="w-row-meta">{task.minutes} min · {task.lane}{where ? ` · ${where}` : ""}</span></span>
    <StatusChip status={task.status} />
  </button>;
}

function MilestoneSheet({ projectTitle, milestone, state, index, count, canAdd, phases, phaseId, onClose, onRemoved, onOpenTask, onNewTask }: {
  projectTitle: string; milestone: Milestone; state: MilestoneState; index: number; count: number; canAdd: boolean;
  /** The project's phases, or undefined while they load. */
  phases: PhaseChoice[] | undefined; phaseId: Id<"phases"> | null;
  onClose: () => void; onRemoved: () => void; onOpenTask: (taskId: Id<"tasks">) => void; onNewTask: () => void;
}) {
  const updateMilestone = useMutation(api.projects.updateMilestone);
  const moveMilestone = useMutation(api.projects.moveMilestone);
  const removeMilestone = useMutation(api.projects.removeMilestone);
  const setMilestonePhase = useMutation(api.constellation.setMilestonePhase);
  const { busy, save } = useSaver();
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");

  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await save(() => updateMilestone({ milestoneId: milestone._id, title: field(data, "title"), doneWhen: field(data, "doneWhen") }), "Milestone saved.")) setMode("view");
  }
  const move = (direction: "up" | "down") => void save(() => moveMilestone({ milestoneId: milestone._id, direction }), `Milestone moved ${direction}.`);
  function choosePhase(value: string) {
    const chosen = phases?.find(item => item.id === value);
    void save(() => setMilestonePhase({ milestoneId: milestone._id, phaseId: chosen ? chosen.id : null }),
      chosen ? `Milestone moved to Phase ${chosen.num} · ${chosen.name}.` : "Milestone is outside any phase now.");
  }

  return <Sheet labelledBy="milestone-sheet-title" eyebrow={`${projectTitle} · milestone ${index + 1} of ${count}`} onClose={onClose}>
    {mode === "edit" ? <>
      <h2 id="milestone-sheet-title" className="w-sheet-title sm">Edit <em>milestone.</em></h2>
      <MilestoneForm milestone={milestone} busy={busy} onSubmit={event => void edit(event)} onCancel={() => setMode("view")} />
    </> : <>
      <div>
        <h2 id="milestone-sheet-title" className="w-sheet-title sm">{milestone.title}</h2>
        <p className="r-small" style={{ marginTop: 6 }}>{milestoneMeta(milestone, state)}{state === "done" && milestone.completedAt ? ` · complete ${formatDay(milestone.completedAt)}` : ""}</p>
      </div>
      {milestone.progress.total > 0 && <div className="r-bar" role="img" aria-label={`${milestone.progress.done} of ${plural(milestone.progress.total, "task")} done`}><span style={{ width: `${percentOf(milestone.progress)}%` }} /></div>}
      {milestone.doneWhen && <div className="r-dashed"><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>{milestone.doneWhen}</div></div>}
      {phases === undefined ? <LinesSkeleton label="Loading the project's phases…" lines={1} small />
        : phases.length === 0 ? <p className="r-small">No phases yet. Add phases on the project page to group milestones into stages of the plan.</p>
          : <label className="r-field" htmlFor="milestone-phase">Phase
            <select id="milestone-phase" className="r-input w-select" value={phaseId ?? ""} disabled={busy} onChange={event => choosePhase(event.target.value)}>
              <option value="">No phase</option>
              {phases.map(item => <option key={item.id} value={item.id}>{item.num} · {item.name}</option>)}
            </select>
          </label>}
      {milestone.tasks.length ? <ul className="w-rows">{milestone.tasks.map(task => <li key={task._id}><TaskRow task={task} onOpen={() => onOpenTask(task._id)} /></li>)}</ul>
        : <p className="w-none">No tasks in this milestone yet.</p>}
      <p className="r-small">It completes on its own when every task in it is done.</p>
      {mode === "remove" ? <div className="r-inset r-stack" style={{ gap: 10 }} role="group" aria-label={`Confirm removing ${milestone.title}`}>
        <p className="r-body">Remove this milestone? Its tasks stay in the project, without a milestone.</p>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="button" className="r-ghost red" disabled={busy} onClick={() => void save(() => removeMilestone({ milestoneId: milestone._id }), "Milestone removed. Its tasks are kept.").then(ok => { if (ok) onRemoved(); })}>Remove</button>
          <button type="button" className="r-ghost xs" ref={focusOnMount} onClick={() => setMode("view")}>Keep it</button>
        </div>
      </div> : <div className="r-row" style={{ gap: 8 }} role="group" aria-label={`Actions for ${milestone.title}`}>
        {canAdd && <button type="button" className="r-ghost xs ember" onClick={onNewTask}>+ Add task</button>}
        <button type="button" className="r-ghost xs" onClick={() => setMode("edit")}>Edit</button>
        <button type="button" className="r-ghost xs" disabled={busy || index === 0} onClick={() => move("up")} aria-label={`Move ${milestone.title} earlier`}>↑ Earlier</button>
        <button type="button" className="r-ghost xs" disabled={busy || index === count - 1} onClick={() => move("down")} aria-label={`Move ${milestone.title} later`}>↓ Later</button>
        <button type="button" className="r-ghost xs" onClick={() => setMode("remove")}>Remove</button>
      </div>}
    </>}
  </Sheet>;
}

// ---------- Phases ----------

type PhaseValues = { name: string; goal: string; nextStep: string; doneWhen: string };
const phaseStateWord: Record<PhaseView["state"], string> = { done: "Done", active: "In progress", ahead: "Ahead" };

function phaseMeta(phase: PhaseView) {
  const tasks = phase.total ? `${phase.done} of ${plural(phase.total, "task")} done · ${phase.pct}%` : "No tasks yet";
  return `${phaseStateWord[phase.state]} · ${tasks} · ${plural(phase.milestones.length, "milestone")}`;
}

/** The project's phases in order: number, name, goal and task progress. Each opens its sheet. */
function PhasesCard({ map, onOpen, onAdd }: { map: Constellation | null | undefined; onOpen: (id: Id<"phases">) => void; onAdd: () => void }) {
  return <section className="w-ms-card" aria-labelledby="phases-heading">
    <div className="w-mono-line"><h2 id="phases-heading" tabIndex={-1} className="w-mono-head">PHASES</h2>{map && map.phases.length > 0 && <span>{map.stats.phasesDone} of {plural(map.phases.length, "phase")} done</span>}</div>
    {map === undefined ? <div style={{ marginTop: 12 }}><LinesSkeleton label="Loading the phases…" lines={3} /></div>
      : map === null ? <p className="w-none" style={{ marginTop: 10 }}>The plan for this project isn’t available.</p>
        : map.phases.length === 0 ? <p className="w-none" style={{ marginTop: 10 }}>No phases yet. A phase is a stage of the plan that groups milestones, like “Reliability &amp; real use”. Without phases, the milestones above are the plan.</p>
          : <ol className="w-phases">{map.phases.map(phase => <li key={phase.id}>
            <button type="button" id={`phase-${phase.id}`} className={`w-phase ${phase.state}`} onClick={() => onOpen(phase.id)}>
              <span className="w-phase-num" aria-hidden="true">{phase.num}</span>
              <span className="w-phase-text">
                <span className="w-phase-name"><span className="sr-only">Phase {phase.num}: </span>{phase.name}</span>
                {phase.goal && <span className="w-phase-goal">{phase.goal}</span>}
                <span className="w-ms-meta">{phaseMeta(phase)}</span>
                <span className="r-bar thin w-phase-bar" aria-hidden="true"><span style={{ width: `${phase.pct}%` }} /></span>
              </span>
            </button>
          </li>)}</ol>}
    <button type="button" id="add-phase" className="r-link" style={{ marginTop: 10 }} disabled={!map} onClick={onAdd}>+ Add phase</button>
  </section>;
}

function PhaseSheet({ projectTitle, phase, index, count, onClose, onRemoved }: { projectTitle: string; phase: PhaseView; index: number; count: number; onClose: () => void; onRemoved: () => void }) {
  const updatePhase = useMutation(api.constellation.updatePhase);
  const movePhase = useMutation(api.constellation.movePhase);
  const removePhase = useMutation(api.constellation.removePhase);
  const { busy, save } = useSaver();
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const move = (direction: -1 | 1) => void save(() => movePhase({ phaseId: phase.id, direction }), `“${phase.name}” moved ${direction < 0 ? "earlier" : "later"}.`);

  return <Sheet labelledBy="phase-sheet-title" eyebrow={`${projectTitle} · phase ${phase.num}`} onClose={onClose}>
    {mode === "edit" ? <>
      <h2 id="phase-sheet-title" className="w-sheet-title sm">Edit <em>phase {phase.num}.</em></h2>
      <PhaseForm phase={phase} busy={busy} onSave={values => void save(() => updatePhase({ phaseId: phase.id, ...values }), "Phase saved.").then(ok => { if (ok) setMode("view"); })} onCancel={() => setMode("view")} />
    </> : <>
      <div>
        <h2 id="phase-sheet-title" className="w-sheet-title sm">{phase.name}</h2>
        <p className="r-small" style={{ marginTop: 6 }}>{phaseMeta(phase)}</p>
      </div>
      {phase.total > 0 && <div className="r-bar" role="img" aria-label={`${phase.done} of ${plural(phase.total, "task")} done`}><span style={{ width: `${phase.pct}%` }} /></div>}
      {phase.goal && <div className="r-inset"><div className="r-eyebrow-sm">Goal</div><div className="r-body" style={{ marginTop: 4 }}>{phase.goal}</div></div>}
      {phase.nextStep && <div className="r-inset"><div className="r-eyebrow-sm">Next step</div><div className="r-body" style={{ marginTop: 4 }}>{phase.nextStep}</div></div>}
      {phase.doneWhen && <div className="r-dashed"><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>{phase.doneWhen}</div></div>}
      <div>
        <div className="r-eyebrow-sm">Milestones</div>
        {phase.milestones.length ? <ul className="w-phase-ms">{phase.milestones.map(item => <li key={item.id}>
          <span className="w-phase-code">{item.code}</span><span className="w-phase-ms-title">{item.title}</span>
          <span className="r-small">{item.total ? `${item.done} of ${item.total}` : "no tasks"}</span>
        </li>)}</ul> : <p className="r-small" style={{ marginTop: 6 }}>None yet. Open a milestone on the project page and choose this phase.</p>}
      </div>
      {mode === "remove" ? <div className="r-inset r-stack" style={{ gap: 10 }} role="group" aria-label={`Confirm removing ${phase.name}`}>
        <p className="r-body">Remove phase {phase.num}? Its milestones and tasks stay in the project, outside any phase, and docs stop feeding it.</p>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="button" className="r-ghost red" disabled={busy} onClick={() => void save(() => removePhase({ phaseId: phase.id }), "Phase removed. Its milestones are kept.").then(ok => { if (ok) onRemoved(); })}>Remove</button>
          <button type="button" className="r-ghost xs" ref={focusOnMount} onClick={() => setMode("view")}>Keep it</button>
        </div>
      </div> : <div className="r-row" style={{ gap: 8 }} role="group" aria-label={`Actions for ${phase.name}`}>
        <button type="button" className="r-ghost xs" onClick={() => setMode("edit")}>Edit</button>
        <button type="button" className="r-ghost xs" disabled={busy || index === 0} onClick={() => move(-1)} aria-label={`Move ${phase.name} earlier`}>↑ Earlier</button>
        <button type="button" className="r-ghost xs" disabled={busy || index === count - 1} onClick={() => move(1)} aria-label={`Move ${phase.name} later`}>↓ Later</button>
        <button type="button" className="r-ghost xs" onClick={() => setMode("remove")}>Remove</button>
      </div>}
    </>}
  </Sheet>;
}

function PhaseForm({ phase, busy, onSave, onCancel }: { phase?: PhaseView; busy: boolean; onSave: (values: PhaseValues) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ name: field(data, "name"), goal: field(data, "goal"), nextStep: field(data, "nextStep"), doneWhen: field(data, "doneWhen") });
  }
  return <form className="w-form" onSubmit={submit} aria-label={phase ? `Edit ${phase.name}` : "Add a phase"}>
    <fieldset className="w-fields" disabled={busy}><legend className="sr-only">Phase</legend>
      <label className="r-field">Phase name<input ref={focusOnMount} className="r-input" name="name" required maxLength={120} defaultValue={phase?.name} placeholder="Reliability & real use" /></label>
      <label className="r-field">Goal · optional<textarea className="r-textarea w-textarea" name="goal" rows={2} maxLength={1000} defaultValue={phase?.goal} placeholder="What this stage is for" /></label>
      <label className="r-field">Next step · optional<textarea className="r-textarea w-textarea" name="nextStep" rows={2} maxLength={2000} defaultValue={phase?.nextStep} /></label>
      <label className="r-field">Done when · optional<input className="r-input" name="doneWhen" maxLength={1000} defaultValue={phase?.doneWhen} /></label>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save phase"}</button>
        <button type="button" className="r-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

// ---------- Docs ----------

type DocValues = { code: string; title: string; summary: string; sections?: number; link: string; phaseIds: Id<"phases">[]; nextEdit: string; doneWhen: string; written: boolean };
const isWebLink = (link: string) => /^https?:\/\//i.test(link);

/** A web address opens in a new tab; a repo path (documents/PRD.md) is shown as it is. */
function DocLink({ link }: { link: string }) {
  return isWebLink(link) ? <a className="w-doc-link" href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//i, "")} ↗</a>
    : <code className="w-path">{link}</code>;
}

function docMeta(doc: DocView) {
  return [doc.writtenAt ? "Written" : "Planned", doc.sections !== null ? plural(doc.sections, "section") : null,
    doc.feeds.length ? `Feeds ${doc.feeds.length === 1 ? "phase" : "phases"} ${doc.feeds.join(", ")}` : "Feeds no phase yet"].filter(Boolean).join(" · ");
}

function DocsCard({ map, onOpen, onAdd }: { map: Constellation | null | undefined; onOpen: (id: Id<"projectDocs">) => void; onAdd: () => void }) {
  const docs = map?.docs;
  const written = docs?.filter(doc => doc.writtenAt !== null).length ?? 0;
  return <section className="w-ms-card" aria-labelledby="docs-heading">
    <div className="w-mono-line"><h2 id="docs-heading" tabIndex={-1} className="w-mono-head">DOCS</h2>{docs && docs.length > 0 && <span>{written} of {plural(docs.length, "doc")} written</span>}</div>
    {map === undefined ? <div style={{ marginTop: 12 }}><LinesSkeleton label="Loading the docs…" lines={3} /></div>
      : map === null ? <p className="w-none" style={{ marginTop: 10 }}>This project’s docs aren’t available.</p>
        : map.docs.length === 0 ? <p className="w-none" style={{ marginTop: 10 }}>No docs yet. Note the documents the plan stands on, like a PRD or a system design. The writing stays in your repo; Becoming keeps a link and the phases each one feeds.</p>
          : <ul className="w-docs">{map.docs.map(doc => <li key={doc.id}>
            <button type="button" id={`doc-${doc.id}`} className={`w-doc${doc.writtenAt ? "" : " planned"}`} onClick={() => onOpen(doc.id)}>
              <span className="w-doc-code" aria-hidden="true">{doc.code}</span>
              <span className="w-row-text"><span className="w-row-title"><span className="sr-only">{doc.code}: </span>{doc.title}</span><span className="w-row-meta">{docMeta(doc)}</span></span>
            </button>
          </li>)}</ul>}
    <button type="button" id="add-doc" className="r-link" style={{ marginTop: 10 }} disabled={!map} onClick={onAdd}>+ Add doc</button>
  </section>;
}

function DocSheet({ projectTitle, doc, phases, onClose, onRemoved }: { projectTitle: string; doc: DocView; phases: PhaseChoice[]; onClose: () => void; onRemoved: () => void }) {
  const updateDoc = useMutation(api.constellation.updateDoc);
  const removeDoc = useMutation(api.constellation.removeDoc);
  const { busy, save } = useSaver();
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const fed = phases.filter(phase => doc.phaseIds.includes(String(phase.id)));

  return <Sheet labelledBy="doc-sheet-title" eyebrow={`${projectTitle} · doc`} variant="page" onClose={onClose}>
    {mode === "edit" ? <>
      <h2 id="doc-sheet-title" className="w-sheet-title">Edit <em>{doc.code}.</em></h2>
      <DocForm doc={doc} phases={phases} busy={busy} onSave={values => void save(() => updateDoc({ docId: doc.id, ...values }), "Doc saved.").then(ok => { if (ok) setMode("view"); })} onCancel={() => setMode("view")} />
    </> : <>
      <div className="r-row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <span className="w-doc-code lg" aria-hidden="true">{doc.code}</span>
        <h2 id="doc-sheet-title" className="w-sheet-title sm"><span className="sr-only">{doc.code}: </span>{doc.title}</h2>
      </div>
      <div className="r-row" style={{ gap: 6 }}>
        <span className={`r-status ${doc.writtenAt ? "s-done" : "s-draft"}`}>{doc.writtenAt ? `Written ${formatDay(doc.writtenAt)}` : "Planned"}</span>
        {doc.sections !== null && <span className="r-fact mono">{plural(doc.sections, "section")}</span>}
        {doc.tasksInformed > 0 && <span className="r-fact">Informs {plural(doc.tasksInformed, "task")}</span>}
      </div>
      {doc.summary && <p className="r-body" style={{ whiteSpace: "pre-wrap" }}>{doc.summary}</p>}
      {doc.link && <div className="r-inset"><div className="r-eyebrow-sm">Where it lives</div><div style={{ marginTop: 6 }}><DocLink link={doc.link} /></div></div>}
      <div>
        <div className="r-eyebrow-sm">Feeds</div>
        {fed.length ? <ul className="r-row w-feeds">{fed.map(phase => <li key={phase.id} className="r-tag">Phase {phase.num} · {phase.name}</li>)}</ul>
          : <p className="r-small" style={{ marginTop: 6 }}>No phase yet. Edit the doc to choose the phases it feeds.</p>}
      </div>
      {doc.nextEdit && <div className="r-inset"><div className="r-eyebrow-sm">Next edit</div><div className="r-body" style={{ marginTop: 4 }}>{doc.nextEdit}</div></div>}
      {doc.doneWhen && <div className="r-dashed"><div className="r-eyebrow-sm">Done when</div><div className="r-body" style={{ marginTop: 4 }}>{doc.doneWhen}</div></div>}
      <p className="r-small">Details updated {formatDay(doc.updatedAt)}{doc.source !== "app" ? " · added through MCP" : ""}.</p>
      {mode === "remove" ? <div className="r-inset r-stack" style={{ gap: 10 }} role="group" aria-label={`Confirm removing ${doc.code}`}>
        <p className="r-body">Remove {doc.code} from this project? Only Becoming’s record of it goes; the file itself isn’t touched.</p>
        <div className="r-row" style={{ gap: 8 }}>
          <button type="button" className="r-ghost red" disabled={busy} onClick={() => void save(() => removeDoc({ docId: doc.id }), `${doc.code} removed from the docs.`).then(ok => { if (ok) onRemoved(); })}>Remove</button>
          <button type="button" className="r-ghost xs" ref={focusOnMount} onClick={() => setMode("view")}>Keep it</button>
        </div>
      </div> : <div className="r-row" style={{ gap: 8 }} role="group" aria-label={`Actions for ${doc.code}`}>
        <button type="button" className="r-ghost xs" onClick={() => setMode("edit")}>Edit</button>
        <button type="button" className="r-ghost xs" onClick={() => setMode("remove")}>Remove</button>
      </div>}
    </>}
  </Sheet>;
}

function DocForm({ doc, phases, busy, onSave, onCancel }: { doc?: DocView; phases: PhaseChoice[]; busy: boolean; onSave: (values: DocValues) => void; onCancel: () => void }) {
  const ids = useId();
  const [feeds, setFeeds] = useState<string[]>(doc?.phaseIds ?? []);
  const [written, setWritten] = useState(doc ? doc.writtenAt !== null : false);
  const toggle = (id: string) => setFeeds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sections = field(data, "sections");
    onSave({
      code: field(data, "code").toUpperCase(), title: field(data, "title"), summary: field(data, "summary"), link: field(data, "link"),
      ...(sections ? { sections: Number(sections) } : {}),
      phaseIds: phases.filter(phase => feeds.includes(String(phase.id))).map(phase => phase.id),
      nextEdit: field(data, "nextEdit"), doneWhen: field(data, "doneWhen"), written,
    });
  }

  return <form className="w-form" onSubmit={submit} aria-label={doc ? `Edit ${doc.code}` : "Add a doc"}>
    <fieldset className="w-fields" disabled={busy}><legend className="sr-only">Doc</legend>
      <div className="w-doc-pair">
        <label className="r-field">Code<input ref={focusOnMount} className="r-input mono w-code-input" name="code" required maxLength={4} pattern="[A-Za-z0-9]{1,4}" title="1 to 4 letters or digits, like PRD" autoCapitalize="characters" spellCheck={false} defaultValue={doc?.code} placeholder="PRD" /></label>
        <label className="r-field">Title<input className="r-input" name="title" required maxLength={120} defaultValue={doc?.title} placeholder="Product requirements" /></label>
      </div>
      <label className="r-field">Summary · optional<textarea className="r-textarea w-textarea" name="summary" rows={3} maxLength={2000} defaultValue={doc?.summary} placeholder="What it settles, in a sentence or two" /></label>
      <div className="w-pair">
        <label className="r-field">Sections · optional<input className="r-input mono" name="sections" type="number" inputMode="numeric" min="0" max="999" step="1" defaultValue={doc?.sections ?? undefined} /></label>
        <label className="r-field">Link · optional<input className="r-input mono" name="link" maxLength={300} spellCheck={false} defaultValue={doc?.link ?? ""} placeholder="documents/PRD.md" aria-describedby={`${ids}-link`} />
          <span id={`${ids}-link`} className="r-hint">An http(s) address, or a path in your repo.</span></label>
      </div>
      <div role="group" aria-labelledby={`${ids}-feeds`}>
        <div id={`${ids}-feeds`} className="r-label" style={{ marginBottom: 8 }}>Phases it feeds</div>
        {phases.length ? <div className="r-row" style={{ gap: 6 }}>{phases.map(phase => <button key={phase.id} type="button" className="r-chip round h34" aria-pressed={feeds.includes(String(phase.id))} onClick={() => toggle(String(phase.id))}>
          <span className="r-mono">{phase.num}</span>{phase.name}
        </button>)}</div> : <p className="r-small">No phases yet. Add phases on the project page, then choose the ones this doc feeds.</p>}
      </div>
      <div className="r-row r-between w-switch-row">
        <span id={`${ids}-written`} className="r-label">Written · it exists in your repo now<span className="r-hint" style={{ display: "block", marginTop: 2 }}>{written ? "Shown as written." : "Shown as planned, faded on the map."}</span></span>
        <button type="button" role="switch" className="r-toggle" aria-checked={written} aria-labelledby={`${ids}-written`} onClick={() => setWritten(!written)} />
      </div>
      <div className="w-pair">
        <label className="r-field">Next edit · optional<input className="r-input" name="nextEdit" maxLength={1000} defaultValue={doc?.nextEdit} /></label>
        <label className="r-field">Done when · optional<input className="r-input" name="doneWhen" maxLength={1000} defaultValue={doc?.doneWhen} /></label>
      </div>
      <div className="r-stack" style={{ gap: 8, marginTop: 6 }}>
        <button type="submit" className="r-btn">{busy ? "Saving…" : "Save doc"}</button>
        <button type="button" className="r-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

function ProjectForm({ project, busy, onSubmit, onCancel }: { project: { title: string; purpose: string; outcome: string }; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="w-form" onSubmit={onSubmit} aria-labelledby="project-form-title">
    <h2 id="project-form-title" className="w-sheet-title">Edit <em>project.</em></h2>
    <fieldset className="w-fields" disabled={busy}><legend className="sr-only">Project details</legend>
      <label className="r-field">Project name<input ref={focusOnMount} className="r-input" style={{ height: 52, font: "400 20px var(--r-serif)" }} name="title" required maxLength={160} defaultValue={project.title} /></label>
      <label className="r-field">Why it matters<textarea className="r-textarea w-textarea" name="purpose" required maxLength={2000} rows={3} defaultValue={project.purpose} /></label>
      <label className="r-field">Intended outcome · optional<textarea className="r-textarea w-textarea" name="outcome" maxLength={2000} rows={3} defaultValue={project.outcome} placeholder="What will exist when it's done?" /></label>
      <div className="r-stack" style={{ gap: 8, marginTop: 6 }}>
        <button type="submit" className="r-btn">{busy ? "Saving…" : "Save project"}</button>
        <button type="button" className="r-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

function MilestoneForm({ milestone, busy, onSubmit, onCancel }: { milestone?: Milestone; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="w-form" onSubmit={onSubmit} aria-label={milestone ? `Edit ${milestone.title}` : "Add a milestone"}>
    <fieldset className="w-fields" disabled={busy}><legend className="sr-only">Milestone</legend>
      <label className="r-field">Milestone outcome<input ref={focusOnMount} className="r-input" name="title" required maxLength={160} defaultValue={milestone?.title} placeholder="Usable Today flow" /></label>
      <label className="r-field">Done when · optional<input className="r-input" name="doneWhen" maxLength={1000} defaultValue={milestone?.doneWhen} /></label>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save milestone"}</button>
        <button type="button" className="r-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

function CaseStudyPanel({ projectId, title }: { projectId: Id<"projects">; title: string }) {
  const data = useQuery(api.projects.caseStudy, { projectId });
  const now = useNow();
  const [message, setMessage] = useState("");
  if (data === undefined || now === null) return <LinesSkeleton label="Assembling the draft…" lines={6} small />;
  if (data === null) return <p className="r-body">This project isn’t available.</p>;
  const markdown = caseStudyMarkdown(data, dayKey(now, Intl.DateTimeFormat().resolvedOptions().timeZone));
  const fileName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-case-study.md`;

  async function copy() {
    try { await navigator.clipboard.writeText(markdown); setMessage("Copied to your clipboard."); }
    catch { setMessage("Copying was blocked by the browser. Select the text and copy it instead."); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url; link.download = fileName; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Downloaded ${fileName}.`);
  }

  return <div className="r-stack" style={{ gap: 12 }}>
    <label className="r-field">Markdown draft<textarea className="r-textarea w-markdown" readOnly value={markdown} rows={16} /></label>
    <p role="status" className="r-small">{message}</p>
    <div className="r-stack" style={{ gap: 8 }}>
      <button type="button" className="r-btn" onClick={() => void copy()}>Copy Markdown</button>
      <button type="button" className="r-ghost" onClick={download}>Download .md</button>
    </div>
  </div>;
}
