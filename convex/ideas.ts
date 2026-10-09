import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { brainstorm, lane } from "./schema";
import { brainstormValues } from "./lib/ideaRules";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { refreshMilestone, taskLinks } from "./lib/projects";
import { clearPinIf, effortValues, smallerStepValues } from "./lib/taskRules";

// Ideas are a low-pressure notebook. Saving or brainstorming never touches Today; only
// a deliberate activation creates a linked Ready task, and it can be moved back.

function notesValue(value: string) {
  if (value.length > 10000) throw new ConvexError("Keep idea notes under 10,000 characters.");
  return value.trim();
}

/** Captured → Brainstorming → Active (has a linked task), or Archived. */
function stageOf(idea: Doc<"ideas">) {
  if (idea.archivedAt !== undefined) return "Archived" as const;
  if (idea.taskId) return "Active" as const;
  return idea.brainstorm ? "Brainstorming" as const : "Captured" as const;
}

/** What the client sees of an idea: never the owner, plus its linked task's title and status. */
function ideaView(idea: Doc<"ideas">, task: { title: string; status: Doc<"tasks">["status"] } | null) {
  return {
    _id: idea._id,
    _creationTime: idea._creationTime,
    title: idea.title,
    lane: idea.lane,
    notes: idea.notes,
    taskId: idea.taskId,
    task,
    archivedAt: idea.archivedAt,
    brainstorm: idea.brainstorm ?? {},
    stage: stageOf(idea),
  };
}

async function linkedTask(ctx: QueryCtx, owner: string, idea: Doc<"ideas">) {
  const task = idea.taskId ? await ctx.db.get(idea.taskId) : null;
  return task?.owner === owner ? { title: task.title, status: task.status } : null;
}

// The notebook hides archived ideas; the Archived view shows only them.
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator, view: v.optional(v.union(v.literal("notebook"), v.literal("archived"))) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const archived = args.view === "archived";
    const result = await ctx.db.query("ideas")
      .withIndex("by_owner", q => q.eq("owner", owner))
      .filter(q => archived ? q.neq(q.field("archivedAt"), undefined) : q.eq(q.field("archivedAt"), undefined))
      .order("desc")
      .paginate(args.paginationOpts);
    // The linked task's title and status, so an active idea says what it became.
    const tasks = await Promise.all(result.page.map(idea => linkedTask(ctx, owner, idea)));
    return { ...result, page: result.page.map((idea, i) => ideaView(idea, tasks[i])) };
  },
});

// One idea, for a link such as /ideas?idea=…. A malformed, missing or foreign id is null.
export const get = query({
  args: { ideaId: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const id = ctx.db.normalizeId("ideas", args.ideaId);
    const idea = id ? await ctx.db.get(id) : null;
    if (!idea || idea.owner !== owner) return null;
    return ideaView(idea, await linkedTask(ctx, owner, idea));
  },
});

export const create = mutation({
  args: { title: v.string(), lane, notes: v.string() },
  handler: async (ctx, args) => createIdeaFor(ctx, await requireOwner(ctx), args),
});

/** A new idea for one owner. Shared with the Inbox. */
export async function createIdeaFor(ctx: MutationCtx, owner: string, args: { title: string; lane: Doc<"ideas">["lane"]; notes: string }) {
  return ctx.db.insert("ideas", { owner, title: nonempty(args.title), lane: args.lane, notes: notesValue(args.notes) });
}

export const updateNotes = mutation({
  args: { ideaId: v.id("ideas"), notes: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    await ctx.db.patch(idea._id, { notes: notesValue(args.notes) });
    return idea._id;
  },
});

// The full brainstorm: title, lane, notes and the optional structured fields. The lane of
// an already linked task isn't changed here; edit the task in Work for that.
export const update = mutation({
  args: { ideaId: v.id("ideas"), title: v.string(), lane, notes: v.string(), brainstorm },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    await ctx.db.patch(idea._id, { title: nonempty(args.title), lane: args.lane, notes: notesValue(args.notes), brainstorm: brainstormValues(args.brainstorm) });
    return idea._id;
  },
});

export const activate = mutation({
  args: {
    ideaId: v.id("ideas"), title: v.string(), minutes: v.number(), energy: v.number(), doneWhen: v.string(),
    smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()),
    // Either link an existing project (and optionally a milestone), or start a new project from this idea.
    projectId: v.optional(v.id("projects")), milestoneId: v.optional(v.id("milestones")), newProject: v.optional(v.boolean()),
    // The lane for the first task; the idea moves with it. Defaults to the idea's lane.
    lane: v.optional(lane),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    if (idea.taskId) {
      const linked = await ctx.db.get(idea.taskId);
      assertOwner(linked, owner);
      if (linked.ideaId !== idea._id) throw new ConvexError("The idea link needs repair before activation.");
      return linked._id;
    }
    if (idea.archivedAt !== undefined) throw new ConvexError("Restore this idea before making it active.");
    if (args.newProject && (args.projectId || args.milestoneId)) throw new ConvexError("Choose an existing project or a new one, not both.");
    const effort = effortValues(args.minutes, args.energy);
    const smaller = smallerStepValues(args);
    const title = nonempty(args.title);
    const doneWhen = nonempty(args.doneWhen, 1000);
    const links = args.newProject
      ? { projectId: await ctx.db.insert("projects", { owner, title: idea.title, purpose: idea.brainstorm?.problem || idea.notes.split("\n")[0]?.slice(0, 2000) || idea.title, status: "Active", ideaId: idea._id }), milestoneId: undefined }
      : await taskLinks(ctx, owner, args);
    const taskId = await ctx.db.insert("tasks", {
      owner, ideaId: idea._id, title, lane: args.lane ?? idea.lane, ...effort, doneWhen, ...smaller, ...links,
      nextStep: "", dependencies: [], status: "Ready",
    });
    await refreshMilestone(ctx, links.milestoneId);
    await ctx.db.patch(idea._id, { taskId, ...(args.lane ? { lane: args.lane } : {}) });
    return taskId;
  },
});

// "Move back to Ideas": the linked task leaves Today (archived, unless it's already done)
// and the idea can be activated again later. Every session and note is kept.
export const deactivate = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    if (!idea.taskId) return idea._id;
    const task = await ctx.db.get(idea.taskId);
    if (task && task.owner === owner && task.status !== "Archived" && task.status !== "Done") {
      const active = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
      if (active?.taskId === task._id) throw new ConvexError("Finish or cancel the session for this idea's task first.");
      await ctx.db.patch(task._id, { status: "Archived", archivedFrom: task.status });
      await refreshMilestone(ctx, task.milestoneId);
      await clearPinIf(ctx, owner, task._id);
    }
    await ctx.db.patch(idea._id, { taskId: undefined });
    return idea._id;
  },
});

// Archiving keeps the notes and any linked task; it only moves the idea out of the notebook.
export const archive = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    if (idea.archivedAt === undefined) await ctx.db.patch(idea._id, { archivedAt: Date.now() });
    return idea._id;
  },
});

export const restore = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    assertOwner(idea, owner);
    if (idea.archivedAt !== undefined) await ctx.db.patch(idea._id, { archivedAt: undefined });
    return idea._id;
  },
});
