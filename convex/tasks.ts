import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isWeekKey } from "./lib/time";
import type { Doc, Id } from "./_generated/dataModel";
import { lane, outcome, swapReason } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { projectIsOpen, refreshMilestone, taskLinks } from "./lib/projects";
import { fitFor, pinnedNote, rankFocuses } from "./lib/recommend";
import { clearPinIf, dependencyValues, doneWhenValue, effortValues, nextStepValue, prerequisiteCleared, smallerStepValues } from "./lib/taskRules";
import { httpUrl, notesValue, tagList } from "./lib/validate";
import { logEvent, snapshot } from "./lib/taskEvents";
import { progressKinds } from "./lib/work";
import { archiveTask, restoreTask } from "./lib/taskArchive";
import { completionOf, finishFor, type Finish } from "./lib/finish";
import { mentions } from "./lib/mentions";

// Work shows one view at a time so finished and archived tasks don't crowd active work.
const taskView = v.union(v.literal("active"), v.literal("blocked"), v.literal("done"), v.literal("archived"));
const viewStatus = { blocked: "Blocked", done: "Done", archived: "Archived" } as const;
const candidateLimit = 200;

const taskFields = {
  title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(),
  projectId: v.optional(v.id("projects")), milestoneId: v.optional(v.id("milestones")),
  smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()),
  // Omitted keeps the current prerequisites; an array replaces them.
  dependencies: v.optional(v.array(v.id("tasks"))),
  // Omitted keeps the current skills; an array replaces them.
  skills: v.optional(v.array(v.string())),
  // Sessions the task is expected to take ("6 of 10" in the constellation); 0 clears it.
  plannedSessions: v.optional(v.number()),
};

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator, view: v.optional(taskView) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const view = args.view ?? "active";
    // Statuses sort as Archived < Blocked < Done < In progress < Ready, so one index range
    // covers exactly the two active statuses without scanning past finished work. Ascending
    // order lists In progress first, then Ready, oldest first, which is the order Today prefers.
    // A new status that sorts between "In progress" and "Ready" would need this range revisited.
    const tasks = view === "active"
      ? ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).gte("status", "In progress").lte("status", "Ready")).order("asc")
      : ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", viewStatus[view])).order("desc");
    const result = await tasks.paginate(args.paginationOpts);
    return { ...result, page: await taskCards(ctx, owner, result.page) };
  },
});

// Work's "Not in a project": open tasks (In progress, Ready, Blocked) that belong to no
// project, in progress first, with how many sessions each has had. Project tasks stay
// inside their project's page. Bounded at 200, far more than a personal workspace holds loose.
export const looseOpen = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const [working, blocked] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).gte("status", "In progress").lte("status", "Ready")).order("asc").take(400),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Blocked")).order("desc").take(200),
    ]);
    const loose = [...working, ...blocked].filter(task => !task.projectId).slice(0, 200);
    const sessions = await Promise.all(loose.map(task => ctx.db.query("sessions").withIndex("by_task", q => q.eq("taskId", task._id)).collect()));
    return (await taskCards(ctx, owner, loose)).map((card, i) => ({ ...card, sessions: sessions[i].length }));
  },
});

// One task in the same shape as a listed one, for Work's task sheet. Null when it isn't yours.
export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.owner !== owner) return null;
    const [card] = await taskCards(ctx, owner, [task]);
    return card;
  },
});

// The task UI's view of a task, with each prerequisite's title and status.
// Ownership is an authorization detail; the task UI does not need the token identifier.
async function taskCards(ctx: QueryCtx, owner: string, page: Doc<"tasks">[]) {
  // At most 10 prerequisites per task, read once each for the whole page.
  const prerequisiteIds = [...new Set(page.flatMap(task => task.dependencies))];
  const prerequisites = new Map((await Promise.all(prerequisiteIds.map(id => ctx.db.get(id))))
    .flatMap(item => item?.owner === owner ? [[String(item._id), { _id: item._id, title: item.title, status: item.status }] as const] : []));
  return page.map(task => ({
    _id: task._id,
    _creationTime: task._creationTime,
    title: task.title,
    lane: task.lane,
    status: task.status,
    projectId: task.projectId,
    milestoneId: task.milestoneId,
    ideaId: task.ideaId,
    minutes: task.minutes,
    energy: task.energy,
    doneWhen: task.doneWhen,
    nextStep: task.nextStep,
    smallerStep: task.smallerStep,
    smallerDone: task.smallerDone,
    smallerMinutes: task.smallerMinutes,
    dependencies: task.dependencies,
    prerequisites: task.dependencies.flatMap(id => prerequisites.get(String(id)) ?? []),
    archivedFrom: task.archivedFrom,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    skills: task.skills ?? [],
    plannedSessions: task.plannedSessions ?? null,
    notes: task.notes ?? "",
  }));
}

export const create = mutation({
  args: taskFields,
  handler: async (ctx, args) => createTaskFor(ctx, await requireOwner(ctx), args),
});

type TaskInput = { title: string; lane: Doc<"tasks">["lane"]; minutes: number; energy: number; doneWhen: string; projectId?: Id<"projects">; milestoneId?: Id<"milestones">; smallerStep?: string; smallerDone?: string; smallerMinutes?: number; dependencies?: Id<"tasks">[]; skills?: string[]; plannedSessions?: number };

/** A new Ready task for one owner, with every rule the form has. Shared with the Inbox. */
export async function createTaskFor(ctx: MutationCtx, owner: string, args: TaskInput, source = "app") {
    const links = await taskLinks(ctx, owner, args);
    const taskId = await ctx.db.insert("tasks", {
      owner, title: nonempty(args.title), lane: args.lane, ...effortValues(args.minutes, args.energy), doneWhen: doneWhenValue(args.doneWhen),
      ...links, ...smallerStepValues(args), nextStep: "", dependencies: await dependencyValues(ctx, owner, undefined, args.dependencies ?? []), status: "Ready",
      ...(skillValues(args.skills).length ? { skills: skillValues(args.skills) } : {}),
      ...(plannedSessionsValue(args.plannedSessions) ? { plannedSessions: plannedSessionsValue(args.plannedSessions) } : {}),
    });
    // A new open task means its milestone is no longer complete.
    await refreshMilestone(ctx, links.milestoneId);
    await logEvent(ctx, owner, { _id: taskId, projectId: links.projectId }, "created", { source });
    return taskId;
}

export const update = mutation({
  args: { taskId: v.id("tasks"), ...taskFields },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    const links = await taskLinks(ctx, owner, args, task);
    await ctx.db.patch(task._id, {
      title: nonempty(args.title), lane: args.lane, ...effortValues(args.minutes, args.energy), doneWhen: doneWhenValue(args.doneWhen),
      projectId: links.projectId, milestoneId: links.milestoneId, ...smallerStepValues(args),
      ...(args.dependencies ? { dependencies: await dependencyValues(ctx, owner, task._id, args.dependencies) } : {}),
      ...(args.skills ? { skills: skillValues(args.skills) } : {}),
      ...(args.plannedSessions !== undefined ? { plannedSessions: plannedSessionsValue(args.plannedSessions) } : {}),
    });
    if (task.milestoneId !== links.milestoneId) await refreshMilestone(ctx, task.milestoneId);
    await refreshMilestone(ctx, links.milestoneId);
    return task._id;
  },
});

// A blocked task returns to Ready. A next step is optional: without one, the task keeps the
// next step it had. The blocker itself stays in the task's history.
export const unblock = mutation({
  args: { taskId: v.id("tasks"), nextStep: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (task.status !== "Blocked") throw new ConvexError("Only a blocked task can be unblocked.");
    return (await setStatusFor(ctx, owner, { taskId: task._id, status: "Ready", note: args.nextStep })).taskId;
  },
});

export const reopen = mutation({
  args: { taskId: v.id("tasks"), nextStep: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (task.status !== "Done") throw new ConvexError("Only a finished task can be reopened.");
    return (await setStatusFor(ctx, owner, { taskId: task._id, status: "In progress", note: args.nextStep })).taskId;
  },
});

// Archive is reversible and keeps every session. Repeating it is harmless. Both return the
// event they wrote (null when nothing changed), so the app can offer Undo.
export const archive = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (task.status === "Archived") return { taskId: task._id, eventId: null };
    const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (active?.taskId === task._id) throw new ConvexError("Finish or cancel this task's session before archiving it.");
    return { taskId: task._id, eventId: await archiveTask(ctx, owner, task) };
  },
});

export const restore = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (task.status !== "Archived") return { taskId: task._id, eventId: null };
    return { taskId: task._id, eventId: await restoreTask(ctx, owner, task) };
  },
});

// ---------- One tap (PLAN-one-tap-and-daily-loop, Phase 1) ----------

/**
 * A task from just a title, typed where it belongs (a milestone, a lane, Up next). Size and
 * energy take everyday defaults and "done when" can wait; Today asks for it later. A task in
 * a project or milestone is a Projects task; a loose one takes your favoured lane.
 */
export const quickAdd = mutation({
  args: {
    title: v.string(), lane: v.optional(lane), projectId: v.optional(v.id("projects")), milestoneId: v.optional(v.id("milestones")),
    minutes: v.optional(v.number()), energy: v.optional(v.number()), doneWhen: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const profile = args.lane || args.projectId || args.milestoneId ? null : await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    const taskId = await createTaskFor(ctx, owner, {
      title: args.title, lane: args.lane ?? (args.projectId || args.milestoneId ? "Projects" : profile?.laneFocus ?? "Projects"),
      minutes: args.minutes ?? 30, energy: args.energy ?? 2, doneWhen: args.doneWhen ?? "",
      projectId: args.projectId, milestoneId: args.milestoneId,
    });
    const created = await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", taskId)).order("desc").first();
    return { taskId, eventId: created?._id ?? null };
  },
});

/** Edits in place, one field or a few: only the fields sent change. */
export const edit = mutation({
  args: {
    taskId: v.id("tasks"), title: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()),
    minutes: v.optional(v.number()), energy: v.optional(v.number()), skills: v.optional(v.array(v.string())), notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => editTaskFor(ctx, await requireOwner(ctx), args),
});

export type TaskEdit = { taskId: Id<"tasks">; title?: string; nextStep?: string; doneWhen?: string; minutes?: number; energy?: number; skills?: string[]; notes?: string };

/** The fields sent change, with the same rules wherever the edit comes from (the app, the Inbox, an assistant). */
export async function editTaskFor(ctx: MutationCtx, owner: string, args: TaskEdit) {
  const task = await ctx.db.get(args.taskId);
  assertOwner(task, owner);
  if (task.status === "Archived") throw new ConvexError(`"${task.title}" is archived. Restore it first.`);
  const nextStep = args.nextStep?.trim();
  if (nextStep !== undefined && nextStep.length > 2000) throw new ConvexError("Keep the next step under 2,000 characters.");
  await ctx.db.patch(task._id, {
    ...(args.title !== undefined ? { title: nonempty(args.title) } : {}),
    ...(nextStep !== undefined ? { nextStep } : {}),
    ...(args.doneWhen !== undefined ? { doneWhen: doneWhenValue(args.doneWhen) } : {}),
    ...(args.minutes !== undefined || args.energy !== undefined ? effortValues(args.minutes ?? task.minutes, args.energy ?? task.energy) : {}),
    ...(args.skills !== undefined ? { skills: skillValues(args.skills) } : {}),
    // Empty notes clear them.
    ...(args.notes !== undefined ? { notes: notesValue(args.notes) } : {}),
  });
  return task._id;
}

/** Adds "what changed" (or a blocker) to a move after it happened, from the toast that followed it. */
export const noteOn = mutation({
  args: { eventId: v.id("taskEvents"), note: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.owner !== owner) throw new ConvexError("That change can't be found any more.");
    const note = args.note.trim();
    if (note.length > 4000) throw new ConvexError("Keep the note under 4,000 characters.");
    await ctx.db.patch(event._id, { note: note || undefined });
    // A blocker written afterwards is what the task shows as blocking it.
    if (event.kind === "blocked" && note) {
      const task = await ctx.db.get(event.taskId);
      if (task?.owner === owner && task.status === "Blocked") await ctx.db.patch(task._id, { nextStep: nextStepValue(note) });
    }
    return null;
  },
});

/**
 * Undoes a move while it is still the task's latest event: the task goes back to exactly how
 * it was (status, next step, dates, skills, pin) and the event is removed, so history reads as
 * if it never happened. Undoing "created" deletes a task that has had no sessions.
 */
export const undo = mutation({
  args: { eventId: v.id("taskEvents") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.owner !== owner) throw new ConvexError("That change can't be found any more.");
    const task = await ctx.db.get(event.taskId);
    if (!task || task.owner !== owner) throw new ConvexError("That task can't be found any more.");
    const latest = await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).order("desc").first();
    if (latest?._id !== event._id) throw new ConvexError(`"${task.title}" changed since. Move it yourself.`);
    const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (active?.taskId === task._id) throw new ConvexError("This task has a focus session running. Finish or cancel it first.");
    if (event.kind === "created") {
      if (await ctx.db.query("sessions").withIndex("by_task", q => q.eq("taskId", task._id)).first()) throw new ConvexError(`"${task.title}" has sessions now. Archive it instead.`);
      await deleteTask(ctx, owner, task);
      return { taskId: null, status: null };
    }
    const before = event.before;
    if (!before) throw new ConvexError("This change can't be undone.");
    await ctx.db.patch(task._id, {
      status: before.status, nextStep: before.nextStep, startedAt: before.startedAt, completedAt: before.completedAt,
      archivedFrom: before.archivedFrom, archivedWithProject: before.archivedWithProject,
      // Only a finish sets skills, so only undoing one puts them back; skills added since stay.
      ...(event.kind === "done" ? { skills: before.skills } : {}),
    });
    if (before.pinned) {
      const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
      if (profile && !profile.pinnedTaskId) await ctx.db.patch(profile._id, { pinnedTaskId: task._id });
    }
    await ctx.db.delete(event._id);
    await refreshMilestone(ctx, task.milestoneId);
    return { taskId: task._id, status: before.status };
  },
});

/** Deletes an archived task for good, with its history, sessions and evidence. Archive first, then delete. */
export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (task.status !== "Archived") throw new ConvexError("Archive the task first; delete it from Archived.");
    await deleteTask(ctx, owner, task);
    return null;
  },
});

async function deleteTask(ctx: MutationCtx, owner: string, task: Doc<"tasks">) {
  const sessions = await ctx.db.query("sessions").withIndex("by_task", q => q.eq("taskId", task._id)).collect();
  for (const session of sessions) {
    for (const artifact of await ctx.db.query("artifacts").withIndex("by_session", q => q.eq("sessionId", session._id)).collect()) {
      if (artifact.imageId) await ctx.storage.delete(artifact.imageId);
      await ctx.db.delete(artifact._id);
    }
    await ctx.db.delete(session._id);
  }
  for (const event of await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).collect()) await ctx.db.delete(event._id);
  for (const other of await ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
    if (other.dependencies.includes(task._id)) await ctx.db.patch(other._id, { dependencies: other.dependencies.filter(id => id !== task._id) });
  }
  for (const idea of await ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
    if (idea.taskId === task._id) await ctx.db.patch(idea._id, { taskId: undefined });
  }
  for (const plan of await ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner)).collect()) {
    if (plan.taskIds.includes(task._id)) await ctx.db.patch(plan._id, { taskIds: plan.taskIds.filter(id => id !== task._id) });
  }
  await clearPinIf(ctx, owner, task._id);
  const gone = new Set<string>([task._id]);
  for (const item of await ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).collect()) {
    if (Object.values(item.proposal).some(value => mentions(value, gone))) await ctx.db.delete(item._id);
  }
  await ctx.db.delete(task._id);
  await refreshMilestone(ctx, task.milestoneId);
}

// Pins (or, with no task, unpins) the focus Today should offer first whenever it fits.
export const pin = mutation({
  args: { taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      assertOwner(task, owner);
      if (task.status === "Done" || task.status === "Archived") throw new ConvexError("Pin a task that is still open.");
    }
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) await ctx.db.patch(profile._id, { pinnedTaskId: args.taskId });
    else if (args.taskId) await ctx.db.insert("profiles", { owner, motive: "", pinnedTaskId: args.taskId });
    return null;
  },
});

// Choices for a task form's "waiting on" list: the newest 300 tasks that aren't archived,
// plus, when editing, every prerequisite that task already has (however old, even archived),
// so the form shows each one ticked and saving never drops one you didn't see.
export const prerequisiteOptions = query({
  args: { taskId: v.optional(v.id("tasks")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const recent = await ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(300);
    const options = recent.filter(task => task.status !== "Archived");
    const editing = args.taskId ? await ctx.db.get(args.taskId) : null;
    if (editing?.owner === owner) {
      const listed = new Set(options.map(task => String(task._id)));
      for (const id of editing.dependencies) {
        if (listed.has(String(id))) continue;
        const task = await ctx.db.get(id);
        if (task?.owner === owner) options.push(task);
      }
    }
    return options.map(task => ({ _id: task._id, title: task.title, status: task.status }));
  },
});

export const getActiveSession = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    return active ? { _id: active._id, taskId: active.taskId, startedAt: active.startedAt, smaller: active.smaller ?? false, focusTitle: active.focusTitle, focusDoneWhen: active.focusDoneWhen, focusMinutes: active.focusMinutes } : null;
  },
});

// Today asks Convex for a small, explainable set of feasible focuses. Capacity
// and energy are momentary UI choices; tasks and session history stay private.
// Optional scope from Today's "What's on your mind tonight?": one lane, one project or one
// task. Ids arrive from links, so they are strings; one that isn't an id simply matches nothing.
export const todayArgs = { minutes: v.number(), energy: v.number(), lane: v.optional(lane), projectId: v.optional(v.string()), taskId: v.optional(v.string()), week: v.optional(v.string()) };
type TodayArgs = { minutes: number; energy: number; lane?: Doc<"tasks">["lane"]; projectId?: string; taskId?: string; week?: string };

export const todayOverview = query({
  args: todayArgs,
  handler: async (ctx, args) => todayFor(ctx, await requireOwner(ctx), args),
});

/** Tonight's focus for one owner. Shared by Today and the assistant endpoint (convex/mcp.ts). */
export async function todayFor(ctx: QueryCtx, owner: string, args: TodayArgs) {
    effortValues(args.minutes, args.energy);
    // The candidate pool is bounded: the 200 oldest of each open status, which is the order
    // the ranking prefers anyway. A pinned task is always included.
    const [readyPool, inProgressPool, recent, active, anyTask, anyBlocked, profile] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Ready")).take(candidateLimit),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "In progress")).take(candidateLimit),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).order("desc").take(6),
      ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique(),
      ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).first(),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Blocked")).first(),
      ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique(),
    ]);
    const pinnedTask = profile?.pinnedTaskId ? await ctx.db.get(profile.pinnedTaskId) : null;
    // Work, not only focus: the latest task moved forward (started, finished, logged) and the latest finished.
    const moves = (await ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner)).order("desc").take(60)).filter(event => progressKinds.has(event.kind));
    const finishedEvent = moves.find(event => event.kind === "done");
    const finishedTask = finishedEvent ? await ctx.db.get(finishedEvent.taskId) : null;
    const pinnedOpen = pinnedTask?.owner === owner && (pinnedTask.status === "Ready" || pinnedTask.status === "In progress") ? pinnedTask : null;
    const ready = pinnedOpen?.status === "Ready" && !readyPool.some(task => task._id === pinnedOpen._id) ? [...readyPool, pinnedOpen] : readyPool;
    const inProgress = pinnedOpen?.status === "In progress" && !inProgressPool.some(task => task._id === pinnedOpen._id) ? [...inProgressPool, pinnedOpen] : inProgressPool;
    // Tasks in Done or Archived projects are kept but never recommended.
    const projectIds = [...new Set([...ready, ...inProgress].flatMap(task => task.projectId ? [task.projectId] : []))];
    const projects = new Map((await Promise.all(projectIds.map(id => ctx.db.get(id)))).flatMap(project => project?.owner === owner ? [[String(project._id), project] as const] : []));
    const candidates = [...ready, ...inProgress].filter(task => !task.projectId || projects.get(String(task.projectId))?.status === "Active");
    const dependencyIds = [...new Set(candidates.flatMap(task => task.dependencies))];
    const dependencies = await Promise.all(dependencyIds.map(id => ctx.db.get(id)));
    const dependencyStatus = new Map(dependencyIds.map((id, i) => { const item = dependencies[i]; return [String(id), item?.owner === owner && prerequisiteCleared(item.status)]; }));
    const eligible = candidates.filter(task => task.dependencies.every(id => dependencyStatus.get(String(id))));
    // The ranking and its plain-language reasons live in lib/recommend.ts and are tested there.
    const capacity = { minutes: args.minutes, energy: args.energy };
    // This week's lined-up steps (from the weekly review) come right after a pin.
    const plan = args.week && isWeekKey(args.week) ? await ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner).eq("week", args.week!)).unique() : null;
    const preferences = { pinnedTaskId: profile?.pinnedTaskId, laneFocus: profile?.laneFocus, linedUp: plan?.taskIds };
    const recentLanes = recent.map(session => session.lane);
    const scopeProject = args.projectId === undefined ? undefined : ctx.db.normalizeId("projects", args.projectId);
    const scopeTask = args.taskId === undefined ? undefined : ctx.db.normalizeId("tasks", args.taskId);
    const inScope = (task: Doc<"tasks">) => (!args.lane || task.lane === args.lane) && (scopeProject === undefined || task.projectId === scopeProject) && (scopeTask === undefined || task._id === scopeTask);
    const ranked = rankFocuses(eligible.filter(inScope), recentLanes, capacity, preferences);
    // "Or, explicitly": the best fit from each other lane, so a different kind of evening is one tap away.
    const overall = rankFocuses(eligible, recentLanes, capacity, preferences, 50);
    const alternativeIds = (["Projects", "Showcases", "Writing"] as const)
      .filter(laneName => laneName !== ranked[0]?.lane)
      .flatMap(laneName => { const best = overall.find(choice => choice.lane === laneName && choice.taskId !== ranked[0]?.taskId); return best ? [best] : []; })
      .slice(0, 2);
    const byId = new Map(eligible.map(task => [String(task._id), task]));
    const milestoneIds = [...new Set([...ranked, ...alternativeIds].flatMap(choice => { const id = byId.get(String(choice.taskId))?.milestoneId; return id ? [id] : []; }))];
    const milestones = new Map((await Promise.all(milestoneIds.map(id => ctx.db.get(id)))).flatMap(milestone => milestone?.owner === owner ? [[String(milestone._id), milestone.title] as const] : []));
    const describe = (choice: (typeof ranked)[number]) => {
      const task = byId.get(String(choice.taskId));
      return {
        ...choice,
        projectId: task?.projectId ?? null,
        projectTitle: task?.projectId ? projects.get(String(task.projectId))?.title ?? null : null,
        milestoneTitle: task?.milestoneId ? milestones.get(String(task.milestoneId)) ?? null : null,
        linedUp: Boolean(plan?.taskIds.includes(choice.taskId)),
      };
    };
    const choices = ranked.map(describe);
    const alternatives = alternativeIds.map(describe);
    // Each empty Today has a different honest message and next action.
    const state = choices.length ? "ready" as const
      : !anyTask ? "first-run" as const
        : candidates.length === 0 ? (anyBlocked ? "blocked-only" as const : "nothing-open" as const)
          : eligible.length === 0 ? "waiting" as const
            : "nothing-fits" as const;
    const last = recent[0];
    const activeTask = active ? await ctx.db.get(active.taskId) : null;
    // A pinned task that isn't offered tonight is explained rather than silently skipped.
    const pinned = pinnedTask?.owner === owner && pinnedTask.status !== "Done" && pinnedTask.status !== "Archived" ? {
      taskId: pinnedTask._id, title: pinnedTask.title,
      offered: choices.some(choice => choice.taskId === pinnedTask._id),
      note: pinnedTask.status === "Blocked" ? "Your pinned task is blocked. Unblock it in Work, or unpin it."
        : !candidates.some(task => task._id === pinnedTask._id) ? "Your pinned task belongs to a project that is done or archived."
          : !eligible.some(task => task._id === pinnedTask._id) ? "Your pinned task is waiting on tasks that aren't done yet."
            : fitFor(pinnedTask, capacity) ? "" : pinnedNote(pinnedTask, capacity),
    } : null;
    // For the opening screen: a spark from your ideas, a note from your weekly plan, and
    // how much is ready to share (the Publish intent).
    const [spark, readyToShare] = await Promise.all([
      ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(50).then(ideas => ideas.find(idea => idea.archivedAt === undefined && idea.taskId === undefined)),
      ctx.db.query("artifacts").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Ready to share")).take(100),
    ]);
    return {
      state,
      choices,
      alternatives,
      spark: spark ? spark.title : null,
      intention: plan?.intention || null,
      readyToShare: readyToShare.length,
      linedUpCount: plan?.taskIds.length ?? 0,
      pinned,
      laneFocus: profile?.laneFocus ?? null,
      lastWorkAt: Math.max(last?.endedAt ?? 0, moves[0]?.at ?? 0) || null,
      lastFinish: finishedEvent && finishedTask && finishedTask.owner === owner ? { title: finishedTask.title, lane: finishedTask.lane, at: finishedEvent.at } : null,
      lastSession: last ? { title: last.title, lane: last.lane, outcome: last.outcome, contribution: last.contribution, nextStep: last.nextStep, endedAt: last.endedAt, startedAt: last.startedAt ?? null, taskId: last.taskId, projectId: last.projectId ?? null } : null,
      active: active ? {
        _id: active._id, taskId: active.taskId, startedAt: active.startedAt,
        title: active.focusTitle ?? activeTask?.title ?? "Focused work",
        taskTitle: active.taskTitle ?? activeTask?.title ?? "Focused work",
        lane: active.lane ?? activeTask?.lane ?? "Projects",
        doneWhen: active.focusDoneWhen ?? activeTask?.doneWhen ?? "Record what moved forward.",
        minutes: active.focusMinutes ?? activeTask?.minutes ?? 0,
        nextStep: activeTask?.nextStep ?? "",
        smaller: active.smaller ?? false,
      } : null,
    };
}

export async function assertPrerequisitesDone(ctx: Parameters<typeof refreshMilestone>[0], owner: string, dependencies: Id<"tasks">[]) {
  for (const id of dependencies) {
    const dependency = await ctx.db.get(id);
    assertOwner(dependency, owner);
    if (!prerequisiteCleared(dependency.status)) throw new ConvexError("Complete the prerequisite first.");
  }
}

export const startSession = mutation({
  args: { taskId: v.id("tasks"), smaller: v.optional(v.boolean()), recommended: v.optional(v.boolean()), swapReason: v.optional(swapReason) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    const smaller = args.smaller ?? false;
    if (args.recommended && args.swapReason) throw new ConvexError("A swap reason only applies when you chose a different focus.");
    const current = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (current) {
      if (current.taskId === task._id && (current.smaller ?? false) === smaller) return current._id;
      throw new ConvexError("Finish or cancel your current session first.");
    }
    if (task.status !== "Ready" && task.status !== "In progress") throw new ConvexError("This task is not ready for a session.");
    if (!(await projectIsOpen(ctx, owner, task.projectId))) throw new ConvexError("This task belongs to a project that is done or archived.");
    if (smaller && (!task.smallerStep || !task.smallerDone || !task.smallerMinutes)) throw new ConvexError("Define a smaller step before starting it.");
    await assertPrerequisitesDone(ctx, owner, task.dependencies);
    return ctx.db.insert("activeSessions", {
      owner, taskId: task._id, startedAt: Date.now(), smaller,
      taskTitle: task.title, lane: task.lane,
      focusTitle: smaller ? task.smallerStep : task.title,
      focusDoneWhen: smaller ? task.smallerDone : task.doneWhen,
      focusMinutes: smaller ? task.smallerMinutes : task.minutes,
      recommended: args.recommended, swapReason: args.swapReason,
    });
  },
});

export const cancelSession = mutation({
  args: { activeSessionId: v.id("activeSessions") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const active = await ctx.db.get(args.activeSessionId);
    assertOwner(active, owner);
    await ctx.db.delete(active._id);
  },
});

// The active record supplies the task and start time. Replaying a completed recap
// finds its owner-scoped session by that same active ID and never grants credit twice.
export const recordSession = mutation({
  args: { activeSessionId: v.id("activeSessions"), outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string(), skills: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const key = String(args.activeSessionId);
    const existing = await ctx.db.query("sessions").withIndex("by_owner_key", q => q.eq("owner", owner).eq("key", key)).unique();
    if (existing) return existing._id;
    const active = await ctx.db.get(args.activeSessionId);
    assertOwner(active, owner);
    const task = await ctx.db.get(active.taskId);
    assertOwner(task, owner);
    const smaller = active.smaller ?? false;
    if (task.status !== "Ready" && task.status !== "In progress") throw new ConvexError("This task is not ready for a session.");
    await assertPrerequisitesDone(ctx, owner, task.dependencies);
    const contribution = nonempty(args.contribution, 4000);
    const nextStep = args.nextStep.trim();
    // Unfinished work needs a way back in. A finished smaller step also leaves its parent
    // task in progress, so it asks for the parent's real next step instead of filler text.
    const needsNextStep = args.outcome !== "Finished" || smaller;
    if (nextStep.length > 2000 || (needsNextStep && !nextStep)) throw new ConvexError("Add a next step or blocker (up to 2000 characters).");
    const evidence = args.evidence.trim() ? httpUrl(args.evidence, "Add a valid HTTP or HTTPS evidence link.") : "";
    const skills = skillValues(args.skills);
    const focusTitle = active.focusTitle ?? task.title;
    const id = await ctx.db.insert("sessions", {
      owner, taskId: task._id, key, outcome: args.outcome, contribution, nextStep, evidence, title: focusTitle,
      lane: active.lane ?? task.lane, startedAt: active.startedAt, endedAt: Date.now(), smaller,
      doneWhen: active.focusDoneWhen ?? task.doneWhen, plannedMinutes: active.focusMinutes, projectId: task.projectId,
      recommended: active.recommended, swapReason: active.swapReason,
      ...(skills.length ? { skills } : {}),
    });
    const finishedSmaller = smaller && args.outcome === "Finished";
    const sameSmallerStep = finishedSmaller && task.smallerStep === active.focusTitle && task.smallerDone === active.focusDoneWhen && task.smallerMinutes === active.focusMinutes;
    const status = args.outcome === "Blocked" ? "Blocked" : args.outcome === "Finished" && !smaller ? "Done" : "In progress";
    await ctx.db.patch(task._id, {
      status, nextStep,
      ...(task.startedAt ? {} : { startedAt: active.startedAt }),
      ...(status === "Done" ? { completedAt: Date.now() } : {}),
      ...(sameSmallerStep ? { smallerStep: undefined, smallerDone: undefined, smallerMinutes: undefined } : {}),
    });
    await logEvent(ctx, owner, task, "focused", { note: contribution });
    if (status !== task.status) await logEvent(ctx, owner, task, status === "Done" ? "done" : status === "Blocked" ? "blocked" : "started", { note: status === "Blocked" ? nextStep : undefined });
    await refreshMilestone(ctx, task.milestoneId);
    if (args.outcome === "Finished" && !smaller) await clearPinIf(ctx, owner, task._id);
    if (evidence) await ctx.db.insert("artifacts", { owner, sessionId: id, title: focusTitle, url: evidence, status: "Draft", portfolioCandidate: false });
    await ctx.db.delete(active._id);
    return id;
  },
});

/** Planned sessions: 1–100, or 0/absent for none. */
export function plannedSessionsValue(value: number | undefined) {
  if (value === undefined || value === 0) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new ConvexError("Planned sessions must be a whole number from 1 to 100.");
  return value;
}

/** Skills compare case-insensitively (as in the Mind Bloom); the first spelling is kept. */
export function skillValues(input: string[] | undefined) {
  const skills: string[] = [];
  for (const skill of input ? tagList(input, 5) : []) if (!skills.some(kept => kept.toLowerCase() === skill.toLowerCase())) skills.push(skill);
  return skills;
}

export type LoggedSession = { taskId: Id<"tasks">; minutes: number; outcome: Doc<"sessions">["outcome"]; contribution: string; nextStep: string; skills: string[]; evidence: string; endedAt: number; source: string; key: string };

/**
 * Work done away from the timer, reported by an assistant and approved in the Inbox. It
 * follows the recap's rules (an open task, prerequisites done, a next step unless it was
 * finished, a safe evidence link) and has the same effects on the task, milestone and Proof.
 */
export async function saveLoggedSession(ctx: MutationCtx, owner: string, entry: LoggedSession) {
  const existing = await ctx.db.query("sessions").withIndex("by_owner_key", q => q.eq("owner", owner).eq("key", entry.key)).unique();
  if (existing) return existing._id;
  const task = await ctx.db.get(entry.taskId);
  assertOwner(task, owner);
  if (task.status !== "Ready" && task.status !== "In progress") throw new ConvexError(`"${task.title}" isn't open any more, so work can't be logged on it.`);
  await assertPrerequisitesDone(ctx, owner, task.dependencies);
  if (!Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > 720) throw new ConvexError("Minutes must be a whole number from 1 to 720.");
  const contribution = nonempty(entry.contribution, 4000);
  const nextStep = entry.nextStep.trim();
  if (nextStep.length > 2000 || (entry.outcome !== "Finished" && !nextStep)) throw new ConvexError("Add a next step or blocker (up to 2000 characters).");
  const evidence = entry.evidence.trim() ? httpUrl(entry.evidence, "Add a valid HTTP or HTTPS evidence link.") : "";
  const skills = skillValues(entry.skills);
  const endedAt = Math.min(entry.endedAt, Date.now());
  const id = await ctx.db.insert("sessions", {
    owner, taskId: task._id, key: entry.key, outcome: entry.outcome, contribution, nextStep, evidence, title: task.title,
    lane: task.lane, startedAt: endedAt - entry.minutes * 60_000, endedAt, doneWhen: task.doneWhen, plannedMinutes: task.minutes,
    projectId: task.projectId, source: entry.source, ...(skills.length ? { skills } : {}),
  });
  const status = entry.outcome === "Blocked" ? "Blocked" : entry.outcome === "Finished" ? "Done" : "In progress";
  await ctx.db.patch(task._id, { status, nextStep, ...(task.startedAt ? {} : { startedAt: endedAt - entry.minutes * 60_000 }), ...(status === "Done" ? { completedAt: endedAt } : {}) });
  await refreshMilestone(ctx, task.milestoneId);
  await logEvent(ctx, owner, task, "logged", { note: contribution, source: entry.source, at: endedAt });
  if (status !== task.status) await logEvent(ctx, owner, task, status === "Done" ? "done" : status === "Blocked" ? "blocked" : "started", { note: status === "Blocked" ? nextStep : undefined, source: entry.source, at: endedAt });
  if (entry.outcome === "Finished") await clearPinIf(ctx, owner, task._id);
  if (evidence) await ctx.db.insert("artifacts", { owner, sessionId: id, title: task.title, url: evidence, status: "Draft", portfolioCandidate: false });
  return id;
}

// ---------- Moving a task freely ----------

const movable = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"));
export type StatusMove = { taskId: Id<"tasks">; status: "Ready" | "In progress" | "Blocked" | "Done"; note?: string; skills?: string[] };

/**
 * Start, finish, block or move a task back, from anywhere, with no timer and no form.
 * Every note is optional: blocking without one keeps the next step, and unblocking or
 * reopening without one picks up where it was. Finishing takes an optional "what changed"
 * and skills (which count in the Mind Bloom). A task with a running focus session changes
 * only through that session. Returns the event (for Undo) and, on Done, what the finish means.
 */
export const setStatus = mutation({
  args: { taskId: v.id("tasks"), status: movable, note: v.optional(v.string()), skills: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => setStatusFor(ctx, await requireOwner(ctx), args),
});

export type MoveResult = { taskId: Id<"tasks">; eventId: Id<"taskEvents"> | null; finish: Finish | null };

export async function setStatusFor(ctx: MutationCtx, owner: string, args: StatusMove, source = "app"): Promise<MoveResult> {
  const task = await ctx.db.get(args.taskId);
  assertOwner(task, owner);
  if (task.status === "Archived") throw new ConvexError(`"${task.title}" is archived. Restore it first.`);
  if (task.status === args.status) return { taskId: task._id, eventId: null, finish: null };
  const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  if (active?.taskId === task._id) throw new ConvexError("This task has a focus session running. Finish or cancel it first.");
  // Work on a finished or archived project stays put until the project is active again.
  if (args.status === "In progress" && !(await projectIsOpen(ctx, owner, task.projectId))) throw new ConvexError("This task's project is done or archived. Make the project active to work on it.");
  const note = (args.note ?? "").trim();
  if (note.length > 4000) throw new ConvexError("Keep the note under 4,000 characters.");
  const now = Date.now();
  const leavingDone = task.status === "Done" ? { completedAt: undefined } : {};
  // Unblocking without a note goes back to the next step the task had before it was blocked,
  // rather than keeping the blocker as its next step.
  const lastBlock = task.status === "Blocked" && !note
    ? (await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).order("desc").take(20)).find(event => event.kind === "blocked")
    : undefined;
  const nextStep = note ? { nextStep: nextStepValue(note) } : lastBlock?.before ? { nextStep: lastBlock.before.nextStep } : {};
  const profile = args.status === "Done" ? await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique() : null;
  const before = snapshot(task, profile?.pinnedTaskId === task._id);
  const completion = args.status === "Done" ? await completionOf(ctx, task) : null;
  let eventId: Id<"taskEvents">;
  switch (args.status) {
    case "In progress": {
      // From Blocked, the blocker is cleared; a note becomes the next step.
      await ctx.db.patch(task._id, { status: "In progress", ...leavingDone, ...nextStep, ...(task.startedAt ? {} : { startedAt: now }) });
      eventId = await logEvent(ctx, owner, task, task.status === "Done" ? "reopened" : task.status === "Blocked" ? "unblocked" : "started", { note, source, before });
      break;
    }
    case "Ready": {
      await ctx.db.patch(task._id, { status: "Ready", ...leavingDone, ...nextStep });
      eventId = await logEvent(ctx, owner, task, task.status === "Done" ? "reopened" : task.status === "Blocked" ? "unblocked" : "ready", { note, source, before });
      break;
    }
    case "Blocked": {
      // What's blocking it becomes the task's next step, so unblocking starts from it.
      await ctx.db.patch(task._id, { status: "Blocked", ...nextStep, ...leavingDone });
      eventId = await logEvent(ctx, owner, task, "blocked", { note, source, before });
      break;
    }
    case "Done": {
      // New skills join the ones the task already has (compared case-insensitively), up to 5.
      const skills = [...(task.skills ?? [])];
      for (const skill of skillValues(args.skills)) if (!skills.some(kept => kept.toLowerCase() === skill.toLowerCase())) skills.push(skill);
      await ctx.db.patch(task._id, { status: "Done", completedAt: now, ...(task.startedAt ? {} : { startedAt: now }), ...(skills.length ? { skills: skills.slice(0, 5) } : {}) });
      await clearPinIf(ctx, owner, task._id);
      eventId = await logEvent(ctx, owner, task, "done", { note, source, before });
      break;
    }
  }
  await refreshMilestone(ctx, task.milestoneId);
  return { taskId: task._id, eventId, finish: completion ? await finishFor(ctx, owner, task._id, completion) : null };
}
