import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { httpUrl, optionalText } from "./lib/validate";

// The project constellation (Work → Projects → Visual): one project as a map from its
// genesis (idea, research, report, decision) through its docs to its phases, milestones and
// tasks. Every number is derived from records; nothing is stored twice. Design:
// documents/design/project-constellation.dc.html; plan: documents/PLAN-project-constellation.md.

type Db = Pick<QueryCtx, "db">;
const pad = (n: number) => String(n).padStart(2, "0");
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const minutesOf = (s: Pick<Doc<"sessions">, "startedAt" | "endedAt">) => (s.startedAt ? Math.max(0, Math.round((s.endedAt - s.startedAt) / 60_000)) : 0);

export async function ownedProject(ctx: Db, owner: string, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  assertOwner(project, owner);
  return project;
}

type TaskState = "done" | "doing" | "ready" | "blocked";
const stateOf = (status: Doc<"tasks">["status"]): TaskState => status === "Done" ? "done" : status === "In progress" ? "doing" : status === "Blocked" ? "blocked" : "ready";

/** The whole map for one owned project, or null. */
export async function constellationFor(ctx: QueryCtx, owner: string, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project || project.owner !== owner) return null;
  const [phaseDocs, milestoneDocs, taskDocs, docDocs, sessions, recentEvents] = await Promise.all([
    ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", projectId)).collect(),
    ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", projectId)).collect(),
    ctx.db.query("tasks").withIndex("by_project", q => q.eq("projectId", projectId)).collect(),
    ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", projectId)).collect(),
    ctx.db.query("sessions").withIndex("by_owner_project", q => q.eq("owner", owner).eq("projectId", projectId)).take(3000),
    ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner)).order("desc").take(600),
  ]);
  const phases = phaseDocs.filter(p => p.owner === owner).sort((a, b) => a.order - b.order);
  const milestones = milestoneDocs.filter(m => m.owner === owner).sort((a, b) => a.order - b.order);
  const tasks = taskDocs.filter(t => t.owner === owner && t.status !== "Archived").sort((a, b) => a._creationTime - b._creationTime);
  const docs = docDocs.filter(d => d.owner === owner);

  // Sessions and focused minutes per task.
  const work = new Map<string, { sessions: number; minutes: number }>();
  for (const s of sessions) {
    const entry = work.get(String(s.taskId)) ?? { sessions: 0, minutes: 0 };
    entry.sessions += 1; entry.minutes += minutesOf(s);
    work.set(String(s.taskId), entry);
  }
  // When each blocked task was blocked (its latest "blocked" event), for the replay.
  const blockedAt = new Map<string, number>();
  await Promise.all(tasks.filter(t => t.status === "Blocked").map(async t => {
    const last = (await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", t._id)).order("desc").take(20)).find(e => e.kind === "blocked");
    if (last) blockedAt.set(String(t._id), last.at);
  }));

  const codes = new Map<string, string>();
  const taskView = (t: Doc<"tasks">, code: string) => {
    codes.set(String(t._id), code);
    const w = work.get(String(t._id));
    return {
      id: t._id, code, title: t.title, status: t.status, state: stateOf(t.status), lane: t.lane, minutes: t.minutes, energy: t.energy,
      doneWhen: t.doneWhen, nextStep: t.nextStep, skills: t.skills ?? [], plannedSessions: t.plannedSessions ?? null,
      sessions: w?.sessions ?? 0, focusedMinutes: w?.minutes ?? 0, createdAt: t._creationTime,
      startedAt: t.startedAt ?? null, completedAt: t.completedAt ?? null, blockedAt: blockedAt.get(String(t._id)) ?? null,
      dependencies: t.dependencies.map(String),
    };
  };
  type TaskView = ReturnType<typeof taskView>;
  const summarise = (list: TaskView[]) => {
    const done = list.filter(t => t.state === "done").length, doing = list.filter(t => t.state === "doing").length, blocked = list.filter(t => t.state === "blocked").length;
    return {
      total: list.length, done, doing, blocked, pct: list.length ? Math.round((done / list.length) * 100) : 0,
      state: (list.length && done === list.length ? "done" : done + doing + blocked > 0 ? "active" : "ahead") as "done" | "active" | "ahead",
      sessions: list.reduce((n, t) => n + t.sessions, 0), focusedMinutes: list.reduce((n, t) => n + t.focusedMinutes, 0),
    };
  };
  const milestoneView = (m: Doc<"milestones">, code: string) => {
    const own = tasks.filter(t => t.milestoneId === m._id).map((t, k) => taskView(t, `${code}·${k + 1}`));
    return { id: m._id, code, title: m.title, doneWhen: m.doneWhen ?? "", completedAt: m.completedAt ?? null, tasks: own, ...summarise(own) };
  };

  const phaseIds = new Set(phases.map(p => String(p._id)));
  const phaseViews = phases.map((p, i) => {
    const ms = milestones.filter(m => m.phaseId && String(m.phaseId) === String(p._id)).map((m, j) => milestoneView(m, `${i}${letters[j] ?? j}`));
    const all = ms.flatMap(m => m.tasks);
    const dates = all.flatMap(t => [t.startedAt, t.completedAt].filter((x): x is number => x !== null));
    return {
      id: p._id, num: pad(i), order: p.order, name: p.name, goal: p.goal ?? "", nextStep: p.nextStep ?? "", doneWhen: p.doneWhen ?? "",
      milestones: ms, startedAt: dates.length ? Math.min(...dates) : null, endedAt: dates.length && all.every(t => t.state === "done") ? Math.max(...dates) : null,
      ...summarise(all),
    };
  });
  // Milestones outside any phase, and tasks outside any milestone, still belong to the map.
  const loose = milestones.filter(m => !m.phaseId || !phaseIds.has(String(m.phaseId))).map((m, j) => milestoneView(m, letters[j] ?? String(j)));
  const looseTasks = tasks.filter(t => !t.milestoneId || !milestones.some(m => m._id === t.milestoneId)).map((t, k) => taskView(t, `·${k + 1}`));
  const allTasks = [...phaseViews.flatMap(p => p.milestones.flatMap(m => m.tasks)), ...loose.flatMap(m => m.tasks), ...looseTasks];

  // Genesis: the idea it grew from, and the research, report and decision behind it.
  const idea = project.ideaId ? await ctx.db.get(project.ideaId) : null;
  const ownIdea = idea && idea.owner === owner ? idea : null;
  const [research, reports] = ownIdea ? await Promise.all([
    ctx.db.query("research").withIndex("by_idea", q => q.eq("ideaId", ownIdea._id)).collect(),
    ctx.db.query("reports").withIndex("by_idea", q => q.eq("ideaId", ownIdea._id)).collect(),
  ]) : [[], []];
  const report = reports.filter(r => r.owner === owner).sort((a, b) => b.writtenAt - a.writtenAt)[0] ?? null;

  const docViews = docs.sort((a, b) => (a.writtenAt ?? Infinity) - (b.writtenAt ?? Infinity) || a._creationTime - b._creationTime).map(d => {
    const fed = phaseViews.filter(p => d.phaseIds.some(id => String(id) === String(p.id)));
    return {
      id: d._id, code: d.code, title: d.title, summary: d.summary ?? "", sections: d.sections ?? null, link: d.link ?? null,
      phaseIds: d.phaseIds.map(String), feeds: fed.map(p => p.num), tasksInformed: fed.reduce((n, p) => n + p.total, 0),
      nextEdit: d.nextEdit ?? "", doneWhen: d.doneWhen ?? "", writtenAt: d.writtenAt ?? null, updatedAt: d.updatedAt, source: d.source,
    };
  });

  const activity = recentEvents.filter(e => e.projectId && String(e.projectId) === String(projectId)).slice(0, 60).map(e => ({
    kind: e.kind, note: e.note ?? null, at: e.at, source: e.source, taskId: String(e.taskId), taskCode: codes.get(String(e.taskId)) ?? null,
    taskTitle: tasks.find(t => t._id === e.taskId)?.title ?? null,
  }));

  // Imported history can predate the records themselves, so real start and finish dates count too.
  const started = [project._creationTime, ownIdea?._creationTime, ...tasks.flatMap(t => [t._creationTime, t.startedAt, t.completedAt])].filter((x): x is number => typeof x === "number");
  const overall = summarise(allTasks);
  return {
    project: { id: project._id, title: project.title, purpose: project.purpose, outcome: project.outcome ?? "", status: project.status, createdAt: project._creationTime },
    genesis: {
      idea: ownIdea ? { id: ownIdea._id, title: ownIdea.title, notes: ownIdea.notes, lane: ownIdea.lane, createdAt: ownIdea._creationTime, brainstorm: ownIdea.brainstorm ?? null } : null,
      research: research.filter(r => r.owner === owner).map(r => ({ id: r._id, title: r.title, summary: r.summary ?? "", sources: r.sources, createdAt: r._creationTime, source: r.source })),
      report: report ? { id: report._id, title: report.title, summary: report.summary ?? "", findings: report.findings, writtenAt: report.writtenAt, source: report.source } : null,
      decision: report?.decision ?? null,
    },
    docs: docViews,
    phases: phaseViews,
    loose: { milestones: loose, tasks: looseTasks },
    activity,
    stats: { ...overall, phases: phaseViews.length, phasesDone: phaseViews.filter(p => p.state === "done").length, docs: docViews.length },
    timeline: { start: Math.min(...started), now: Date.now() },
  };
}

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => constellationFor(ctx, await requireOwner(ctx), args.projectId),
});

/** One task's story for the panel: every recorded move, newest last. */
export const taskStory = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.owner !== owner) return null;
    const events = await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).order("asc").take(200);
    return events.map(e => ({ kind: e.kind, note: e.note ?? null, at: e.at, source: e.source }));
  },
});

// ---------- Phases ----------

const phaseFields = { name: v.string(), goal: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()) };
type PhaseInput = { name: string; goal?: string; nextStep?: string; doneWhen?: string };
const phaseValues = (args: PhaseInput) => ({
  name: nonempty(args.name, 120), goal: optionalText(args.goal, 1000, "the phase goal"),
  nextStep: optionalText(args.nextStep, 2000, "the next step"), doneWhen: optionalText(args.doneWhen, 1000, "the done-when"),
});

export async function addPhaseFor(ctx: MutationCtx, owner: string, projectId: Id<"projects">, args: PhaseInput) {
  const project = await ownedProject(ctx, owner, projectId);
  const last = await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", project._id)).order("desc").first();
  const count = (await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", project._id)).take(41)).length;
  if (count >= 40) throw new ConvexError("A project can have up to 40 phases.");
  return ctx.db.insert("phases", { owner, projectId: project._id, order: (last?.order ?? -1) + 1, ...phaseValues(args) });
}

export const addPhase = mutation({
  args: { projectId: v.id("projects"), ...phaseFields },
  handler: async (ctx, args) => addPhaseFor(ctx, await requireOwner(ctx), args.projectId, args),
});

async function ownedPhase(ctx: Db, owner: string, phaseId: Id<"phases">) {
  const phase = await ctx.db.get(phaseId);
  assertOwner(phase, owner);
  return phase;
}

export const updatePhase = mutation({
  args: { phaseId: v.id("phases"), ...phaseFields },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const phase = await ownedPhase(ctx, owner, args.phaseId);
    await ctx.db.patch(phase._id, phaseValues(args));
  },
});

export const movePhase = mutation({
  args: { phaseId: v.id("phases"), direction: v.union(v.literal(-1), v.literal(1)) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const phase = await ownedPhase(ctx, owner, args.phaseId);
    const all = (await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", phase.projectId)).collect()).sort((a, b) => a.order - b.order);
    const at = all.findIndex(p => p._id === phase._id), other = all[at + args.direction];
    if (!other) return;
    await ctx.db.patch(phase._id, { order: other.order });
    await ctx.db.patch(other._id, { order: phase.order });
  },
});

/** Removing a phase keeps its milestones and tasks; they move outside any phase. */
export const removePhase = mutation({
  args: { phaseId: v.id("phases") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const phase = await ownedPhase(ctx, owner, args.phaseId);
    for (const m of await ctx.db.query("milestones").withIndex("by_phase", q => q.eq("phaseId", phase._id)).collect()) await ctx.db.patch(m._id, { phaseId: undefined });
    for (const d of await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", phase.projectId)).collect()) {
      if (d.phaseIds.includes(phase._id)) await ctx.db.patch(d._id, { phaseIds: d.phaseIds.filter(id => id !== phase._id) });
    }
    await ctx.db.delete(phase._id);
  },
});

export async function setMilestonePhaseFor(ctx: MutationCtx, owner: string, milestoneId: Id<"milestones">, phaseId: Id<"phases"> | null) {
  const milestone = await ctx.db.get(milestoneId);
  assertOwner(milestone, owner);
  if (phaseId) {
    const phase = await ownedPhase(ctx, owner, phaseId);
    if (phase.projectId !== milestone.projectId) throw new ConvexError("That phase belongs to another project.");
  }
  await ctx.db.patch(milestone._id, { phaseId: phaseId ?? undefined });
}

export const setMilestonePhase = mutation({
  args: { milestoneId: v.id("milestones"), phaseId: v.union(v.id("phases"), v.null()) },
  handler: async (ctx, args) => setMilestonePhaseFor(ctx, await requireOwner(ctx), args.milestoneId, args.phaseId),
});

// ---------- Docs ----------

const docFields = {
  code: v.string(), title: v.string(), summary: v.optional(v.string()), sections: v.optional(v.number()), link: v.optional(v.string()),
  phaseIds: v.optional(v.array(v.id("phases"))), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()), written: v.optional(v.boolean()),
};
export type DocInput = { code: string; title: string; summary?: string; sections?: number; link?: string; phaseIds?: Id<"phases">[]; nextEdit?: string; doneWhen?: string; written?: boolean };

/** A doc's link: a web address, or a path in your repo such as documents/PRD.md. */
export function linkValue(value: string | undefined) {
  const link = value?.trim();
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return httpUrl(link, "The doc link must be an HTTP or HTTPS address, or a repo path.");
  // Any other scheme (javascript:, data:…) or a protocol-relative "//host" is not a repo path.
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("//")) throw new ConvexError("The doc link must be an HTTP or HTTPS address, or a repo path.");
  if (link.length > 300 || /[\s<>"]/.test(link)) throw new ConvexError("A repo path can be up to 300 characters, with no spaces.");
  return link;
}

/** A doc's code: 1 to 4 letters or digits, upper-cased (PRD, API, SYS). */
export function docCodeValue(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(code)) throw new ConvexError("A doc code is 1 to 4 letters or digits, like PRD or API.");
  return code;
}

async function docValues(ctx: Db, owner: string, projectId: Id<"projects">, args: DocInput) {
  const code = docCodeValue(args.code);
  if (args.sections !== undefined && (!Number.isInteger(args.sections) || args.sections < 0 || args.sections > 999)) throw new ConvexError("Sections must be a whole number from 0 to 999.");
  const phaseIds = [...new Set(args.phaseIds ?? [])];
  for (const id of phaseIds) {
    const phase = await ownedPhase(ctx, owner, id);
    if (phase.projectId !== projectId) throw new ConvexError("A doc can only feed phases of its own project.");
  }
  return {
    code, title: nonempty(args.title, 120), summary: optionalText(args.summary, 2000, "the summary"), sections: args.sections, link: linkValue(args.link),
    phaseIds, nextEdit: optionalText(args.nextEdit, 1000, "the next edit"), doneWhen: optionalText(args.doneWhen, 1000, "the done-when"),
  };
}

export async function addDocFor(ctx: MutationCtx, owner: string, projectId: Id<"projects">, args: DocInput, source = "app") {
  const project = await ownedProject(ctx, owner, projectId);
  const existing = await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", project._id)).take(41);
  if (existing.length >= 40) throw new ConvexError("A project can have up to 40 docs.");
  const values = await docValues(ctx, owner, project._id, args);
  if (existing.some(d => d.code === values.code)) throw new ConvexError(`This project already has a doc coded ${values.code}.`);
  const now = Date.now();
  return ctx.db.insert("projectDocs", { owner, projectId: project._id, ...values, updatedAt: now, ...(args.written === false ? {} : { writtenAt: now }), source });
}

export const addDoc = mutation({
  args: { projectId: v.id("projects"), ...docFields },
  handler: async (ctx, args) => addDocFor(ctx, await requireOwner(ctx), args.projectId, args),
});

export async function updateDocFor(ctx: MutationCtx, owner: string, docId: Id<"projectDocs">, args: DocInput) {
  const doc = await ctx.db.get(docId);
  assertOwner(doc, owner);
  const values = await docValues(ctx, owner, doc.projectId, { ...args, phaseIds: args.phaseIds ?? doc.phaseIds });
  const clash = (await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", doc.projectId)).collect()).some(d => d._id !== doc._id && d.code === values.code);
  if (clash) throw new ConvexError(`This project already has a doc coded ${values.code}.`);
  const now = Date.now();
  await ctx.db.patch(doc._id, { ...values, updatedAt: now, ...(args.written === true && !doc.writtenAt ? { writtenAt: now } : {}), ...(args.written === false ? { writtenAt: undefined } : {}) });
}

export const updateDoc = mutation({
  args: { docId: v.id("projectDocs"), ...docFields },
  handler: async (ctx, args) => updateDocFor(ctx, await requireOwner(ctx), args.docId, args),
});

export const removeDoc = mutation({
  args: { docId: v.id("projectDocs") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const doc = await ctx.db.get(args.docId);
    assertOwner(doc, owner);
    await ctx.db.delete(doc._id);
  },
});
