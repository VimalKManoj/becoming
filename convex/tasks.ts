import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import { query, mutation } from "./model";
import { lane, outcome } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";

type SmallerStepInput = { smallerStep?: string; smallerDone?: string; smallerMinutes?: number };

function smallerStepValues(args: SmallerStepInput) {
  const step = args.smallerStep?.trim() || undefined;
  const done = args.smallerDone?.trim() || undefined;
  const minutes = args.smallerMinutes;
  if (!step && !done && minutes === undefined) return { smallerStep: undefined, smallerDone: undefined, smallerMinutes: undefined };
  if (!step || !done || minutes === undefined) throw new ConvexError("Complete all three smaller-step fields or leave them empty.");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw new ConvexError("Choose 5–240 smaller-step minutes.");
  return { smallerStep: nonempty(step, 1000), smallerDone: nonempty(done, 1000), smallerMinutes: minutes };
}

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db
      .query("tasks")
      .withIndex("by_owner", q => q.eq("owner", owner))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      // Ownership is an authorization detail; the task UI does not need the token identifier.
      page: result.page.map(task => ({
        _id: task._id,
        _creationTime: task._creationTime,
        title: task.title,
        lane: task.lane,
        status: task.status,
        projectId: task.projectId,
        ideaId: task.ideaId,
        minutes: task.minutes,
        energy: task.energy,
        doneWhen: task.doneWhen,
        nextStep: task.nextStep,
        smallerStep: task.smallerStep,
        smallerDone: task.smallerDone,
        smallerMinutes: task.smallerMinutes,
        dependencies: task.dependencies,
      })),
    };
  },
});

export const create = mutation({
  args: { title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(), projectId: v.optional(v.id("projects")), smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (args.projectId) assertOwner(await ctx.db.get(args.projectId), owner);
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
    if (![1, 2, 3].includes(args.energy)) throw new ConvexError("Choose a valid energy level.");
    return ctx.db.insert("tasks", { ...args, ...smallerStepValues(args), owner, title: nonempty(args.title), doneWhen: nonempty(args.doneWhen, 1000), nextStep: "", dependencies: [], status: "Ready" });
  },
});

export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
    lane,
    minutes: v.number(),
    energy: v.number(),
    doneWhen: v.string(),
    smallerStep: v.optional(v.string()),
    smallerDone: v.optional(v.string()),
    smallerMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
    if (![1, 2, 3].includes(args.energy)) throw new ConvexError("Choose a valid energy level.");
    await ctx.db.patch(task._id, {
      title: nonempty(args.title),
      lane: args.lane,
      minutes: args.minutes,
      energy: args.energy,
      doneWhen: nonempty(args.doneWhen, 1000),
      ...smallerStepValues(args),
    });
    return task._id;
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
export const todayOverview = query({
  args: { minutes: v.number(), energy: v.number() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
    if (![1, 2, 3].includes(args.energy)) throw new ConvexError("Choose a valid energy level.");
    const [ready, inProgress, recent, active] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Ready")).collect(),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "In progress")).collect(),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).order("desc").take(6),
      ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique(),
    ]);
    const candidates = [...ready, ...inProgress];
    const dependencyIds = [...new Set(candidates.flatMap(task => task.dependencies))];
    const dependencies = await Promise.all(dependencyIds.map(id => ctx.db.get(id)));
    const dependencyStatus = new Map(dependencyIds.map((id, i) => [String(id), dependencies[i]?.owner === owner && dependencies[i]?.status === "Done"]));
    const laneCount = (selected: typeof candidates[number]["lane"]) => recent.filter(session => session.lane === selected).length;
    const repeatedLane = recent.length >= 2 && recent[0].lane === recent[1].lane ? recent[0].lane : null;
    const choices = candidates
      .filter(task => task.dependencies.every(id => dependencyStatus.get(String(id))))
      .flatMap(task => {
        const smaller = task.minutes > args.minutes || task.energy > args.energy;
        if (smaller && !(task.smallerStep && task.smallerDone && task.smallerMinutes && task.smallerMinutes <= args.minutes)) return [];
        return [{
          taskId: task._id, title: smaller ? task.smallerStep! : task.title, taskTitle: task.title,
          lane: task.lane, status: task.status, minutes: smaller ? task.smallerMinutes! : task.minutes,
          doneWhen: smaller ? task.smallerDone! : task.doneWhen, nextStep: task.nextStep, smaller,
          reason: `${task.lane} has ${laneCount(task.lane)} of your last ${recent.length} sessions. ${smaller ? "This defined smaller step fits your capacity." : "This next step fits your capacity."}`,
          createdAt: task._creationTime,
        }];
      })
      .sort((a, b) => Number(a.lane === repeatedLane) - Number(b.lane === repeatedLane)
        || laneCount(a.lane) - laneCount(b.lane)
        || Number(b.status === "In progress") - Number(a.status === "In progress")
        || a.createdAt - b.createdAt)
      .slice(0, 3)
      .map(choice => ({
        taskId: choice.taskId, title: choice.title, taskTitle: choice.taskTitle,
        lane: choice.lane, status: choice.status, minutes: choice.minutes,
        doneWhen: choice.doneWhen, nextStep: choice.nextStep,
        smaller: choice.smaller, reason: choice.reason,
      }));
    const activeTask = active ? await ctx.db.get(active.taskId) : null;
    return {
      choices,
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
  },
});

export const startSession = mutation({
  args: { taskId: v.id("tasks"), smaller: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    const smaller = args.smaller ?? false;
    const current = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (current) {
      if (current.taskId === task._id && (current.smaller ?? false) === smaller) return current._id;
      throw new ConvexError("Finish or cancel your current session first.");
    }
    if (task.status === "Done" || task.status === "Blocked") throw new ConvexError("This task is not ready for a session.");
    if (smaller && (!task.smallerStep || !task.smallerDone || !task.smallerMinutes)) throw new ConvexError("Define a smaller step before starting it.");
    for (const id of task.dependencies) {
      const dependency = await ctx.db.get(id);
      assertOwner(dependency, owner);
      if (dependency.status !== "Done") throw new ConvexError("Complete the prerequisite first.");
    }
    return ctx.db.insert("activeSessions", {
      owner, taskId: task._id, startedAt: Date.now(), smaller,
      taskTitle: task.title, lane: task.lane,
      focusTitle: smaller ? task.smallerStep : task.title,
      focusDoneWhen: smaller ? task.smallerDone : task.doneWhen,
      focusMinutes: smaller ? task.smallerMinutes : task.minutes,
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
  args: { activeSessionId: v.id("activeSessions"), outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string() },
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
    if (task.status === "Done" || task.status === "Blocked") throw new ConvexError("This task is not ready for a session.");
    for (const id of task.dependencies) {
      const dependency = await ctx.db.get(id);
      assertOwner(dependency, owner);
      if (dependency?.status !== "Done") throw new ConvexError("Complete the prerequisite first.");
    }
    const contribution = nonempty(args.contribution, 4000);
    const nextStep = args.nextStep.trim();
    if (nextStep.length > 2000 || (args.outcome !== "Finished" && !nextStep)) throw new ConvexError("Add a next step or blocker (up to 2000 characters).");
    const evidence = args.evidence.trim();
    if (evidence) {
      let valid = false;
      try { valid = ["https:", "http:"].includes(new URL(evidence).protocol); } catch { /* Rejected below. */ }
      if (!valid || evidence.length > 2000) throw new ConvexError("Add a valid HTTP or HTTPS evidence link.");
    }
    const focusTitle = active.focusTitle ?? task.title;
    const id = await ctx.db.insert("sessions", { owner, taskId: task._id, key, outcome: args.outcome, contribution, nextStep, evidence, title: focusTitle, lane: active.lane ?? task.lane, startedAt: active.startedAt, endedAt: Date.now(), smaller, doneWhen: active.focusDoneWhen ?? task.doneWhen });
    const finishedSmaller = smaller && args.outcome === "Finished";
    const sameSmallerStep = finishedSmaller && task.smallerStep === active.focusTitle && task.smallerDone === active.focusDoneWhen && task.smallerMinutes === active.focusMinutes;
    await ctx.db.patch(task._id, {
      status: args.outcome === "Blocked" ? "Blocked" : args.outcome === "Finished" && !smaller ? "Done" : "In progress",
      nextStep: nextStep || (finishedSmaller ? "Continue from your last recorded contribution." : ""),
      ...(sameSmallerStep ? { smallerStep: undefined, smallerDone: undefined, smallerMinutes: undefined } : {}),
    });
    if (evidence) await ctx.db.insert("artifacts", { owner, sessionId: id, title: focusTitle, url: evidence, status: "Draft", portfolioCandidate: false });
    await ctx.db.delete(active._id);
    return id;
  },
});
