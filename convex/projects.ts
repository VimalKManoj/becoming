import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { optionalText } from "./lib/validate";
import { effortValues } from "./lib/taskRules";
import { projectStatus } from "./schema";
import { archiveTask, restoreTask } from "./lib/taskArchive";

// Projects group larger work into ordered milestones and tasks. Progress is always
// derived from task records (counts, not just a percentage), and only Active projects
// feed Today. Archiving keeps every task, session and piece of evidence; its open tasks are
// archived with it and come back when it's made active.

type Ctx = Pick<QueryCtx, "db">;

async function ownedProject(ctx: Ctx, owner: string, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  assertOwner(project, owner);
  return project as Doc<"projects">;
}

async function projectTasks(ctx: Ctx, owner: string, projectId: Id<"projects">) {
  return (await ctx.db.query("tasks").withIndex("by_project", q => q.eq("projectId", projectId)).collect()).filter(task => task.owner === owner);
}

function progress(tasks: Doc<"tasks">[]) {
  const counted = tasks.filter(task => task.status !== "Archived");
  return { done: counted.filter(task => task.status === "Done").length, total: counted.length };
}

// The step Today would start with: work in progress first, then the oldest ready task.
function nextTaskOf(tasks: Doc<"tasks">[]) {
  const open = tasks.filter(task => task.status === "In progress" || task.status === "Ready").sort((a, b) => Number(b.status === "In progress") - Number(a.status === "In progress") || a._creationTime - b._creationTime);
  return open[0] ? { _id: open[0]._id, title: open[0].title, minutes: open[0].minutes, lane: open[0].lane, energy: open[0].energy, smallerMinutes: open[0].smallerMinutes } : null;
}

async function lastWorkedAt(ctx: Ctx, owner: string, projectId: Id<"projects">) {
  const lastSession = await ctx.db.query("sessions").withIndex("by_owner_project", q => q.eq("owner", owner).eq("projectId", projectId)).order("desc").first();
  return lastSession?.endedAt ?? null;
}

const projectSummary = (project: Doc<"projects">) => ({ _id: project._id, title: project.title, purpose: project.purpose, outcome: project.outcome ?? "", status: project.status, ideaId: project.ideaId });

export const list = query({
  args: { status: v.optional(projectStatus) },
  handler: async (ctx, args) => projectsFor(ctx, await requireOwner(ctx), args.status ?? "Active"),
});

/** One owner's projects with progress, milestones and next step. Shared with convex/mcp.ts. */
export async function projectsFor(ctx: Ctx, owner: string, status: Doc<"projects">["status"]) {
    const projects = await ctx.db.query("projects").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", status)).order("desc").take(100);
    return Promise.all(projects.map(async project => {
      const [tasks, milestones] = await Promise.all([
        projectTasks(ctx, owner, project._id),
        ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).collect(),
      ]);
      const nextTask = nextTaskOf(tasks);
      const ordered = [...milestones].sort((a, b) => a.order - b.order);
      const current = ordered.findIndex(m => m.completedAt === undefined);
      return {
        ...projectSummary(project), progress: progress(tasks),
        milestones: { done: milestones.filter(m => m.completedAt !== undefined).length, total: milestones.length, current: current < 0 ? null : current + 1, currentTitle: current < 0 ? null : ordered[current].title },
        nextTask,
        lane: nextTask?.lane ?? tasks[0]?.lane ?? null,
        lastWorkedAt: await lastWorkedAt(ctx, owner, project._id),
      };
    }));
}

// For task forms and labels: every project with its status and milestones in order.
// Forms offer only Active projects for new links; labels can still name the others.
export const options = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const projects = await ctx.db.query("projects").withIndex("by_owner", q => q.eq("owner", owner)).take(200);
    return Promise.all(projects.map(async project => ({
      _id: project._id,
      title: project.title,
      status: project.status,
      milestones: (await ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).collect()).map(m => ({ _id: m._id, title: m.title })),
    })));
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => projectFor(ctx, await requireOwner(ctx), args.projectId),
});

/** One owned project in detail, or null. Shared with convex/mcp.ts. */
export async function projectFor(ctx: Ctx, owner: string, projectId: Id<"projects">) {
    const project = await ctx.db.get(projectId);
    if (!project || project.owner !== owner) return null;
    const [tasks, milestones] = await Promise.all([
      projectTasks(ctx, owner, project._id),
      ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).collect(),
    ]);
    const taskView = (task: Doc<"tasks">) => ({ _id: task._id, title: task.title, status: task.status, lane: task.lane, minutes: task.minutes, nextStep: task.nextStep, milestoneId: task.milestoneId });
    const nextTask = nextTaskOf(tasks);
    return {
      ...projectSummary(project),
      progress: progress(tasks),
      // The same next step and lane the project's card shows.
      nextTask,
      lane: nextTask?.lane ?? tasks[0]?.lane ?? null,
      lastWorkedAt: await lastWorkedAt(ctx, owner, project._id),
      milestones: milestones.map(milestone => {
        const linked = tasks.filter(task => task.milestoneId === milestone._id);
        return { _id: milestone._id, title: milestone.title, doneWhen: milestone.doneWhen ?? "", order: milestone.order, completedAt: milestone.completedAt, phaseId: milestone.phaseId ?? null, progress: progress(linked), tasks: linked.map(taskView) };
      }),
      unassigned: tasks.filter(task => !task.milestoneId || !milestones.some(m => m._id === task.milestoneId)).map(taskView),
    };
}

function projectValues(args: { title: string; purpose: string; outcome?: string }) {
  return { title: nonempty(args.title), purpose: nonempty(args.purpose, 2000), outcome: optionalText(args.outcome, 2000, "the outcome") };
}

export const create = mutation({
  args: { title: v.string(), purpose: v.string(), outcome: v.optional(v.string()), ideaId: v.optional(v.id("ideas")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (args.ideaId) assertOwner(await ctx.db.get(args.ideaId), owner);
    return ctx.db.insert("projects", { owner, ...projectValues(args), status: "Active", ideaId: args.ideaId });
  },
});

export const update = mutation({
  args: { projectId: v.id("projects"), title: v.string(), purpose: v.string(), outcome: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const project = await ownedProject(ctx, owner, args.projectId);
    await ctx.db.patch(project._id, projectValues(args));
    return project._id;
  },
});

// Done and Archived both take a project's tasks out of Today; Active brings them back.
export const setStatus = mutation({
  args: { projectId: v.id("projects"), status: projectStatus },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const project = await ownedProject(ctx, owner, args.projectId);
    if (args.status !== "Active") {
      const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
      const activeTask = active ? await ctx.db.get(active.taskId) : null;
      if (activeTask?.projectId === project._id) throw new ConvexError("Finish or cancel the session for this project's task first.");
    }
    if (args.status === project.status) return project._id;
    // Archiving puts the project's open tasks away too, so nothing elsewhere waits on them;
    // leaving Archived brings back exactly those, not tasks archived on their own before.
    const tasks = await projectTasks(ctx, owner, project._id);
    if (args.status === "Archived") {
      for (const task of tasks) if (task.status === "Ready" || task.status === "In progress" || task.status === "Blocked") await archiveTask(ctx, owner, task, true);
    } else if (project.status === "Archived") {
      for (const task of tasks) if (task.status === "Archived" && task.archivedWithProject) await restoreTask(ctx, owner, task, true);
    }
    await ctx.db.patch(project._id, { status: args.status });
    return project._id;
  },
});

async function ownedMilestone(ctx: MutationCtx, owner: string, milestoneId: Id<"milestones">) {
  const milestone = await ctx.db.get(milestoneId);
  assertOwner(milestone, owner);
  return milestone as Doc<"milestones">;
}

export const addMilestone = mutation({
  args: { projectId: v.id("projects"), title: v.string(), doneWhen: v.optional(v.string()) },
  handler: async (ctx, args) => addMilestoneFor(ctx, await requireOwner(ctx), args),
});

/** A new last milestone in an owned project. Shared with the Inbox. */
export async function addMilestoneFor(ctx: MutationCtx, owner: string, args: { projectId: Id<"projects">; title: string; doneWhen?: string }) {
  const project = await ownedProject(ctx, owner, args.projectId);
  const last = await ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).order("desc").first();
  return ctx.db.insert("milestones", { owner, projectId: project._id, title: nonempty(args.title), doneWhen: optionalText(args.doneWhen, 1000, "the milestone outcome"), order: (last?.order ?? 0) + 1 });
}

export const updateMilestone = mutation({
  args: { milestoneId: v.id("milestones"), title: v.string(), doneWhen: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const milestone = await ownedMilestone(ctx, owner, args.milestoneId);
    await ctx.db.patch(milestone._id, { title: nonempty(args.title), doneWhen: optionalText(args.doneWhen, 1000, "the milestone outcome") });
    return milestone._id;
  },
});

// Swaps a milestone with its neighbour, keeping order values unique.
export const moveMilestone = mutation({
  args: { milestoneId: v.id("milestones"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const milestone = await ownedMilestone(ctx, owner, args.milestoneId);
    const neighbour = await ctx.db.query("milestones")
      .withIndex("by_project", q => args.direction === "up" ? q.eq("projectId", milestone.projectId).lt("order", milestone.order) : q.eq("projectId", milestone.projectId).gt("order", milestone.order))
      .order(args.direction === "up" ? "desc" : "asc").first();
    if (!neighbour) return milestone._id;
    await ctx.db.patch(milestone._id, { order: neighbour.order });
    await ctx.db.patch(neighbour._id, { order: milestone.order });
    return milestone._id;
  },
});

// Removing a milestone unlinks its tasks first, so no task points at a missing milestone.
export const removeMilestone = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const milestone = await ownedMilestone(ctx, owner, args.milestoneId);
    const linked = await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestone._id)).collect();
    for (const task of linked) await ctx.db.patch(task._id, { milestoneId: undefined });
    await ctx.db.delete(milestone._id);
    return null;
  },
});

// ---------- deleting a project for good ----------
// Archive keeps everything; Delete removes the project and everything that only exists
// because of it: milestones, phases, docs, its tasks, their sessions, evidence (with
// screenshots) and history. Whatever else pointed at those records is unlinked, so nothing
// dangles. A session's task is required, so sessions can't outlive their task.

async function deletionScope(ctx: Ctx, owner: string, projectId: Id<"projects">) {
  const project = await ownedProject(ctx, owner, projectId);
  const tasks = await projectTasks(ctx, owner, project._id);
  const milestones = await ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
  const phases = await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
  const docs = await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
  const sessions = (await Promise.all(tasks.map(task => ctx.db.query("sessions").withIndex("by_task", q => q.eq("taskId", task._id)).collect()))).flat();
  const artifacts = (await Promise.all(sessions.map(session => ctx.db.query("artifacts").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()))).flat();
  const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  const running = Boolean(active && tasks.some(task => task._id === active.taskId));
  return { project, tasks, milestones, phases, docs, sessions, artifacts, running };
}

/** What deleting a project would remove, so the confirmation can say it plainly. */
export const deletePreview = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.owner !== owner) return null;
    const scope = await deletionScope(ctx, owner, project._id);
    return { title: project.title, tasks: scope.tasks.length, sessions: scope.sessions.length, evidence: scope.artifacts.length, milestones: scope.milestones.length, phases: scope.phases.length, docs: scope.docs.length, running: scope.running };
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const scope = await deletionScope(ctx, owner, args.projectId);
    if (scope.running) throw new ConvexError("Finish or cancel the focus session on this project's task first.");
    const { project } = scope;
    const taskIds = new Set<string>(scope.tasks.map(task => task._id));
    const milestoneIds = new Set<string>(scope.milestones.map(milestone => milestone._id));
    const gone = new Set<string>([project._id, ...taskIds, ...milestoneIds, ...scope.phases.map(phase => phase._id)]);

    for (const artifact of scope.artifacts) {
      if (artifact.imageId) await ctx.storage.delete(artifact.imageId);
      await ctx.db.delete(artifact._id);
    }
    for (const session of scope.sessions) await ctx.db.delete(session._id);
    for (const task of scope.tasks) {
      const events = await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).collect();
      for (const event of events) await ctx.db.delete(event._id);
      await ctx.db.delete(task._id);
    }
    // Tasks elsewhere: drop prerequisites on deleted tasks, and links to deleted milestones.
    for (const task of await ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
      const dependencies = task.dependencies.filter(id => !taskIds.has(id));
      const unlinkMilestone = task.milestoneId !== undefined && milestoneIds.has(task.milestoneId);
      if (dependencies.length !== task.dependencies.length || unlinkMilestone) await ctx.db.patch(task._id, { dependencies, ...(unlinkMilestone ? { milestoneId: undefined } : {}) });
    }
    // Sessions on tasks that moved out of the project keep their history, without the project.
    for (const session of await ctx.db.query("sessions").withIndex("by_owner_project", q => q.eq("owner", owner).eq("projectId", project._id)).collect()) {
      await ctx.db.patch(session._id, { projectId: undefined });
    }
    for (const row of [...scope.milestones, ...scope.phases, ...scope.docs]) await ctx.db.delete(row._id);
    // An idea that became one of these tasks goes back to being an idea; its research stays.
    for (const idea of await ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
      if (idea.taskId && taskIds.has(idea.taskId)) await ctx.db.patch(idea._id, { taskId: undefined });
    }
    for (const plan of await ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner)).collect()) {
      const kept = plan.taskIds.filter(id => !taskIds.has(id));
      if (kept.length !== plan.taskIds.length) await ctx.db.patch(plan._id, { taskIds: kept });
    }
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile?.pinnedTaskId && taskIds.has(profile.pinnedTaskId)) await ctx.db.patch(profile._id, { pinnedTaskId: undefined });
    // Proposals about the deleted records could never be approved now.
    for (const item of await ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
      if (Object.values(item.proposal).some(value => mentions(value, gone))) await ctx.db.delete(item._id);
    }
    await ctx.db.delete(project._id);
    return { tasks: scope.tasks.length, sessions: scope.sessions.length };
  },
});

// Whether a proposal field holds one of the given ids, at any depth.
function mentions(value: unknown, ids: Set<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some(item => mentions(item, ids));
  if (value && typeof value === "object") return Object.values(value).some(item => mentions(item, ids));
  return false;
}

// Everything a case-study draft needs, in time order: the project's sessions (by the
// project snapshot saved with each session, plus older sessions through their task),
// milestones, open next steps, and the evidence attached to those sessions.
export const caseStudy = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.owner !== owner) return null;
    const [tasks, milestones, snapshotSessions] = await Promise.all([
      projectTasks(ctx, owner, project._id),
      ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", project._id)).collect(),
      ctx.db.query("sessions").withIndex("by_owner_project", q => q.eq("owner", owner).eq("projectId", project._id)).collect(),
    ]);
    const byTask = await Promise.all(tasks.map(task => ctx.db.query("sessions").withIndex("by_task", q => q.eq("taskId", task._id)).collect()));
    const sessions = new Map<string, Doc<"sessions">>();
    for (const session of [...snapshotSessions, ...byTask.flat()]) {
      // A session saved under another project belongs to that project's story.
      if (session.owner === owner && (session.projectId === undefined || session.projectId === project._id)) sessions.set(String(session._id), session);
    }
    const ordered = [...sessions.values()].sort((a, b) => a.endedAt - b.endedAt);
    const artifacts = (await Promise.all(ordered.map(session => ctx.db.query("artifacts").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()))).flat().filter(item => item.owner === owner);
    return {
      project: projectSummary(project),
      progress: progress(tasks),
      milestones: milestones.map(m => ({ title: m.title, doneWhen: m.doneWhen ?? "", completedAt: m.completedAt, progress: progress(tasks.filter(task => task.milestoneId === m._id)) })),
      sessions: ordered.map(s => ({ title: s.title, lane: s.lane, outcome: s.outcome, contribution: s.contribution, endedAt: s.endedAt })),
      openSteps: tasks.filter(task => task.status !== "Done" && task.status !== "Archived").map(task => ({ title: task.title, status: task.status, nextStep: task.nextStep })),
      evidence: artifacts.map(a => ({ title: a.title, url: a.url, status: a.status, publishedUrl: a.publishedUrl, publishedOn: a.publishedOn, notes: a.notes ?? "", skills: a.skills ?? [], portfolioCandidate: a.portfolioCandidate })),
    };
  },
});

// "Start something new": a project and its first ready step, in one go.
export const createWithFirstStep = mutation({
  args: {
    title: v.string(), purpose: v.string(),
    step: v.object({ title: v.string(), lane: v.union(v.literal("Projects"), v.literal("Showcases"), v.literal("Writing")), minutes: v.number(), energy: v.number(), doneWhen: v.string() }),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const projectId = await ctx.db.insert("projects", { owner, ...projectValues({ title: args.title, purpose: args.purpose }), status: "Active" });
    const taskId = await ctx.db.insert("tasks", {
      owner, title: nonempty(args.step.title), lane: args.step.lane, ...effortValues(args.step.minutes, args.step.energy), doneWhen: nonempty(args.step.doneWhen, 1000),
      nextStep: "", dependencies: [], status: "Ready", projectId,
    });
    return { projectId, taskId };
  },
});
