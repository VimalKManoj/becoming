"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { bloomSkillList } from "../../convex/lib/bloom";
// Relative, so the unit tests can load this file without the "@/" alias.
import { LinesSkeleton } from "./skeleton";
import { useModal } from "./ritual/use-modal";

// Work's shared pieces: its address, the task form, the next-step form, the sheets they
// open in and the status chip. Styled with the Ritual classes (r-) and work.css (w-).

export const lanes = ["Projects", "Showcases", "Writing"] as const;
export type Lane = typeof lanes[number];
export const energies = [{ value: 1, label: "Low" }, { value: 2, label: "Steady" }, { value: 3, label: "High" }] as const;
export const energyWords = ["", "Low energy", "Steady energy", "High energy"];
const minutePicks = [15, 30, 45, 60, 90];

export type EditableTask = {
  _id?: Id<"tasks">;
  dependencies?: Id<"tasks">[];
  title: string;
  lane: Lane;
  minutes: number;
  energy: number;
  doneWhen: string;
  projectId?: Id<"projects">;
  milestoneId?: Id<"milestones">;
  smallerStep?: string;
  smallerDone?: string;
  smallerMinutes?: number;
  /** Sessions you expect it to take. `undefined` means the current value isn't known to the form. */
  plannedSessions?: number | null;
};

const formText = (data: FormData, name: string) => String(data.get(name) || "").trim();
// A callback ref runs when the element mounts: focus lands in a form the moment it opens.
export const focusOnMount = (node: HTMLElement | null) => node?.focus();

// ---------- Work's address ----------
// Today links into Work with ?new=task, ?view=blocked|done|archived|projects and
// ?project=<id>. In projects, ?visual=1 shows the constellation instead of the list.
// The screen reads them on arrival and writes its view back, so a refresh or a shared
// link opens the same place.

export const taskViews = ["active", "blocked", "done", "archived"] as const;
export type TaskView = typeof taskViews[number];
export type WorkRoute = { mode: "tasks" | "projects"; view: TaskView; project: string | null; adding: boolean; visual: boolean };

export function workRoute(params: { get: (name: string) => string | null }): WorkRoute {
  const view = params.get("view");
  const project = params.get("project")?.trim() || null;
  const mode = project || view === "projects" ? "projects" : "tasks";
  return {
    mode,
    // In the Projects view the task view you came from travels as ?tasks=, so coming back keeps it.
    view: taskViews.find(item => item === (mode === "projects" ? params.get("tasks") : view)) ?? "active",
    project: mode === "projects" ? project : null,
    adding: mode === "tasks" && params.get("new") === "task",
    visual: mode === "projects" && params.get("visual") === "1",
  };
}

/** The query string for a route; the default (active tasks) is the bare address. */
export function workQuery(route: WorkRoute) {
  const query = new URLSearchParams();
  if (route.mode === "projects") {
    query.set("view", "projects");
    if (route.project) query.set("project", route.project);
    if (route.visual) query.set("visual", "1");
    if (route.view !== "active") query.set("tasks", route.view);
  } else {
    if (route.view !== "active") query.set("view", route.view);
    if (route.adding) query.set("new", "task");
  }
  return query.toString();
}

/** Reads a TaskForm's fields into mutation arguments. Empty optional fields are left out. */
export function taskValues(data: FormData) {
  const smallerStep = formText(data, "smallerStep");
  const smallerDone = formText(data, "smallerDone");
  const smallerMinutes = formText(data, "smallerMinutes");
  const projectId = formText(data, "projectId");
  const milestoneId = formText(data, "milestoneId");
  // Planned sessions: a number sets it; an empty field clears it (0), but only when the form
  // knew the saved value, so editing a task whose plan wasn't loaded never wipes it.
  const planned = formText(data, "plannedSessions");
  const plannedSessions = planned ? Number(planned) : data.get("plannedSessionsKnown") ? 0 : undefined;
  // The checklist only sends prerequisites once it has loaded, so a slow load can't clear them.
  const dependencies = data.get("dependenciesShown") ? data.getAll("dependencies").map(value => String(value) as Id<"tasks">) : undefined;
  return {
    title: formText(data, "title"),
    lane: formText(data, "lane") as Lane,
    minutes: Number(data.get("minutes")),
    energy: Number(data.get("energy")),
    doneWhen: formText(data, "doneWhen"),
    ...(projectId ? { projectId: projectId as Id<"projects"> } : {}),
    ...(milestoneId ? { milestoneId: milestoneId as Id<"milestones"> } : {}),
    ...(smallerStep ? { smallerStep } : {}),
    ...(smallerDone ? { smallerDone } : {}),
    ...(smallerMinutes ? { smallerMinutes: Number(smallerMinutes) } : {}),
    ...(dependencies ? { dependencies } : {}),
    ...(plannedSessions !== undefined ? { plannedSessions } : {}),
  };
}

// ---------- Status ----------

export type TaskStatusValue = "Ready" | "In progress" | "Blocked" | "Done" | "Archived";
const statusClass: Record<TaskStatusValue, string> = { "Ready": "s-ready", "In progress": "s-progress", "Blocked": "s-blocked", "Done": "s-done", "Archived": "s-archived" };

/** The prototype's status chip. The word always names the state, so colour is never the only signal. */
export function StatusChip({ status, archivedFrom }: { status: string; archivedFrom?: string }) {
  const known = status in statusClass ? status as TaskStatusValue : "Ready";
  return <span className={`r-status ${statusClass[known]}`}>{status === "Archived" && archivedFrom ? `Archived · was ${archivedFrom}` : status}</span>;
}

// ---------- Sheets ----------

type SheetProps = {
  /** The id of the heading inside, which names the dialog. */
  labelledBy: string;
  eyebrow: ReactNode;
  onClose: () => void;
  /** "card" is the capture sheet's centred card (a bottom sheet on phones); "page" covers the screen for longer forms. */
  variant?: "card" | "page";
  children: ReactNode;
};

/** Work's sheets, in the capture sheet's style. Escape and the backdrop close them. */
export function Sheet({ labelledBy, eyebrow, onClose, variant = "card", children }: SheetProps) {
  const dialog = useModal<HTMLDivElement>(onClose);
  const head = <div className="r-row r-between" style={{ gap: 12 }}>
    <span className="r-eyebrow ember w-sheet-eyebrow">{eyebrow}</span>
    {/* Focus moves into the sheet as it opens; a form's first field, mounting later, takes it from here. */}
    <button type="button" ref={focusOnMount} className="r-close" aria-label="Close" onClick={onClose}>×</button>
  </div>;
  if (variant === "page") return <div ref={dialog} className="r-overlay sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
    <div className="r-col r-rise-6" style={{ maxWidth: 560, gap: 16 }}>{head}{children}</div>
  </div>;
  return <div ref={dialog} className="r-cap" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
    <div className="r-cap-back" onClick={onClose} />
    <div className="r-cap-card w-sheet">{head}{children}</div>
  </div>;
}

// ---------- Task form ----------

type TaskFormProps = {
  title: ReactNode;
  task?: EditableTask;
  /** Prefills a new task, e.g. when adding one from a project's milestone. */
  defaults?: Partial<EditableTask>;
  busy: boolean;
  /** The heading's id, so the sheet around the form is named by it. */
  headingId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function TaskForm({ title, task, defaults, busy, headingId, onSubmit, onCancel }: TaskFormProps) {
  const options = useQuery(api.projects.options);
  const prerequisites = useQuery(api.tasks.prerequisiteOptions, task ? { taskId: task._id } : {});
  const ids = useId();
  const initialProject = task?.projectId ?? defaults?.projectId ?? "";
  const [projectId, setProjectId] = useState<string>(initialProject);
  // Controlled, so a prefilled milestone survives the project options loading after the form opens.
  const [milestoneId, setMilestoneId] = useState<string>(task?.milestoneId ?? defaults?.milestoneId ?? "");
  const values = { ...defaults, ...task };
  // Controlled only so the quick picks can fill it in; the field still submits as "minutes".
  const [minutes, setMinutes] = useState(String(values.minutes || 30));
  const project = options?.find(item => item._id === projectId);
  // Only active projects take new tasks, but a task keeps the project it already has.
  const projectChoices = options?.filter(item => item.status === "Active" || item._id === initialProject) ?? [];
  const lane = values.lane || "Projects";
  const energy = values.energy || 2;
  // A new task has no plan yet; an edited one only when its saved value came with it.
  const plannedKnown = !task || task.plannedSessions !== undefined;
  return <form className="w-form" onSubmit={onSubmit} aria-busy={busy} aria-labelledby={headingId}>
    <h2 id={headingId} className="w-sheet-title">{title}</h2>
    <fieldset className="w-fields" disabled={busy}>
      <legend className="sr-only">Task details</legend>
      <label className="r-field">Task title<input ref={focusOnMount} className="r-input" name="title" required maxLength={160} defaultValue={values.title} placeholder="A step you could finish in one sitting" /></label>
      {/* Native radios drawn as chips: arrow keys move between lanes, and the choice submits as "lane". */}
      <fieldset className="w-group"><legend className="r-label">Lane</legend>
        <div className="r-row" style={{ gap: 6 }}>{lanes.map(item => <label key={item} className={`r-chip round h40 w-choice lane-${item}`}>
          <input type="radio" name="lane" value={item} defaultChecked={lane === item} /><span className="r-dot" aria-hidden="true" />{item}
        </label>)}</div>
      </fieldset>
      <div className="w-pair">
        <div className="r-stack" style={{ gap: 8 }}>
          <label className="r-field">Minutes<input className="r-input mono" name="minutes" type="number" inputMode="numeric" min="5" max="240" step="1" required value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
          <div className="r-row" style={{ gap: 6 }} role="group" aria-label="Quick minute picks">{minutePicks.map(pick => <button key={pick} type="button" className="r-chip mono h34" aria-pressed={Number(minutes) === pick} onClick={() => setMinutes(String(pick))}>{pick}</button>)}</div>
        </div>
        <fieldset className="w-group"><legend className="r-label">Energy it needs</legend>
          <div className="w-energies">{energies.map(item => <label key={item.value} className="r-chip w-choice w-energy">
            <input type="radio" name="energy" value={item.value} defaultChecked={energy === item.value} />
            <span className="r-bars" aria-hidden="true">{[6, 9, 12].map((height, index) => <span key={height} style={{ height, opacity: index < item.value ? 1 : 0.25 }} />)}</span>{item.label}
          </label>)}</div>
        </fieldset>
      </div>
      <label className="r-field">Done when<textarea className="r-textarea w-textarea" name="doneWhen" required maxLength={1000} rows={3} defaultValue={values.doneWhen} placeholder="What you'll see when it's finished, e.g. “The recap saves offline.”" /></label>
      <div className="w-pair">
        {/* The links are submitted from state through these hidden fields, so a list that is
            still loading (or a disabled select, which forms never submit) can't drop them. */}
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="milestoneId" value={milestoneId} />
        <label className="r-field" htmlFor={`${ids}-project`}>Project · optional<select id={`${ids}-project`} className="r-input w-select" value={projectId} disabled={options === undefined} onChange={event => { setProjectId(event.target.value); setMilestoneId(""); }}>
          <option value="">{options === undefined && projectId ? "Loading projects…" : "No project"}</option>
          {projectChoices.map(item => <option key={item._id} value={item._id}>{item.title}{item.status !== "Active" ? ` (${item.status.toLowerCase()})` : ""}</option>)}
        </select></label>
        <label className="r-field" htmlFor={`${ids}-milestone`}>Milestone · optional<select id={`${ids}-milestone`} className="r-input w-select" value={milestoneId} onChange={event => setMilestoneId(event.target.value)} disabled={!project?.milestones.length}>
          <option value="">{options === undefined && milestoneId ? "Loading milestones…" : project?.milestones.length ? "No milestone" : projectId ? "No milestones in this project" : "Choose a project first"}</option>
          {project?.milestones.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}
        </select></label>
      </div>
      <label className="r-field">Planned sessions · optional
        <input className="r-input mono" name="plannedSessions" type="number" inputMode="numeric" min="1" max="100" step="1" defaultValue={values.plannedSessions ?? undefined} placeholder="How many sittings it might take" aria-describedby={`${ids}-planned-hint`} />
        <span id={`${ids}-planned-hint`} className="r-hint">{plannedKnown ? "1 to 100. Leave it empty for no plan; the project map counts sessions against it." : "1 to 100. Leave it empty to keep what's saved."}</span>
      </label>
      {plannedKnown && <input type="hidden" name="plannedSessionsKnown" value="1" />}
      <PrerequisiteChecklist options={prerequisites} taskId={task?._id} selected={task?.dependencies ?? []} />
      {/* Closed details still submit their fields, so collapsing it never loses what you typed. */}
      <details className="w-details" open={Boolean(values.smallerStep)}>
        <summary><span className="r-eyebrow-sm">Optional smaller step</span><span className="r-small"> · a useful short session when the whole task won’t fit</span></summary>
        <div className="r-stack" style={{ gap: 12, paddingBottom: 14 }}>
          <p className="r-small">Fill in all three fields, or leave them all empty.</p>
          <label className="r-field">Smaller action<input className="r-input" name="smallerStep" maxLength={1000} defaultValue={values.smallerStep} /></label>
          <div className="w-pair">
            <label className="r-field">Smaller minutes<input className="r-input mono" name="smallerMinutes" type="number" inputMode="numeric" min="5" max="240" step="1" defaultValue={values.smallerMinutes} /></label>
            <label className="r-field">Smaller step done when<input className="r-input" name="smallerDone" maxLength={1000} defaultValue={values.smallerDone} /></label>
          </div>
        </div>
      </details>
      <div className="r-stack" style={{ gap: 8, marginTop: 6 }}>
        <button type="submit" className="r-btn">{busy ? "Saving…" : "Save task"}</button>
        <button type="button" className="r-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

/** Unblocking and reopening both ask for the step that moves the task forward again. */
export function NextStepForm({ kind, busy, onSubmit, onCancel }: { kind: "unblock" | "reopen"; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return <form className="w-form" onSubmit={onSubmit} aria-busy={busy}>
    <fieldset className="w-fields" disabled={busy}>
      <legend className="sr-only">{kind === "unblock" ? "Unblock this task" : "Reopen this task"}</legend>
      <label className="r-field">{kind === "unblock" ? "What's the next step now that it's unblocked?" : "What's the next step?"}<textarea ref={focusOnMount} className="r-textarea w-textarea" name="nextStep" required maxLength={2000} rows={3} placeholder="The very next thing to do." /></label>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm">{busy ? "Saving…" : kind === "unblock" ? "Mark as ready" : "Reopen task"}</button>
        <button type="button" className="r-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

type PrerequisiteOption = { _id: Id<"tasks">; title: string; status: string };

// "Waiting on" other tasks. Today only offers a task once everything it waits on is Done.
// The server refuses archived prerequisites and loops.
function PrerequisiteChecklist({ options, taskId, selected }: { options: PrerequisiteOption[] | undefined; taskId?: Id<"tasks">; selected: Id<"tasks">[] }) {
  if (options === undefined) return <LinesSkeleton label="Loading tasks it could wait on…" lines={3} small />;
  // An archived prerequisite appears only because this task already names it. It no longer
  // holds the task back; it is kept unless you untick it.
  const choices = options.filter(option => option._id !== taskId && (option.status !== "Archived" || selected.includes(option._id)));
  return <fieldset className="w-group"><legend className="r-label">Waiting on · optional</legend>
    <input type="hidden" name="dependenciesShown" value="1" />
    {choices.length === 0 ? <p className="r-small">No other tasks yet.</p> : <div className="w-checklist">
      {choices.map(option => <label key={option._id} className="w-check"><input type="checkbox" name="dependencies" value={option._id} defaultChecked={selected.includes(option._id)} /><span>{option.title}<span className="r-small"> · {option.status === "Archived" ? "Archived, no longer blocks" : option.status}</span></span></label>)}
    </div>}
    <p className="r-small" style={{ marginTop: 8 }}>Today won’t suggest this task until those tasks are done (or archived).</p>
  </fieldset>;
}

/** Marking a task done, anywhere: an optional "what changed" and the skills it practised. */
export function DoneForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (note: string, skills: string[]) => void; onCancel: () => void }) {
  const [skills, setSkills] = useState<string[]>([]);
  const toggle = (name: string) => setSkills(current => current.includes(name) ? current.filter(item => item !== name) : current.length >= 5 ? current : [...current, name]);
  return <form className="w-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); onSubmit(String(new FormData(event.currentTarget).get("note") || ""), skills); }}>
    <fieldset className="w-fields" disabled={busy}>
      <legend className="sr-only">Mark this task done</legend>
      <label className="r-field">What changed? <span className="r-small">· optional, kept in its history</span><textarea ref={focusOnMount} className="r-textarea w-textarea" name="note" maxLength={4000} rows={2} placeholder="Shipped the retry path; the toast copy is final." /></label>
      <div role="group" aria-label="Skills it practised">
        <div className="r-label" style={{ marginBottom: 8 }}>Skills <span className="r-small">· optional, they grow your Mind Bloom</span></div>
        <div className="r-row" style={{ gap: 6 }}>{bloomSkillList.map(skill => <button key={skill.name} type="button" className="r-chip round h34" aria-pressed={skills.includes(skill.name)} onClick={() => toggle(skill.name)}>{skill.name}</button>)}</div>
      </div>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn sm mint">{busy ? "Saving…" : "Mark done"}</button>
        <button type="button" className="r-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

/** Blocking a task: what's in the way becomes its next step. */
export function BlockForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (reason: string) => void; onCancel: () => void }) {
  return <form className="w-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); onSubmit(String(new FormData(event.currentTarget).get("reason") || "")); }}>
    <fieldset className="w-fields" disabled={busy}>
      <legend className="sr-only">Mark this task blocked</legend>
      <label className="r-field">What&apos;s blocking it, and how could it be unblocked?<textarea ref={focusOnMount} className="r-textarea w-textarea" name="reason" required maxLength={2000} rows={2} placeholder="Waiting on the API key from the client. Ask on Monday." /></label>
      <div className="r-row" style={{ gap: 8 }}>
        <button type="submit" className="r-btn red">{busy ? "Saving…" : "Mark blocked"}</button>
        <button type="button" className="r-ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
