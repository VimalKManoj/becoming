import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { lane } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";

function notesValue(value: string) {
  if (value.length > 10000) throw new ConvexError("Keep idea notes under 10,000 characters.");
  return value.trim();
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
    return {
      ...result,
      page: result.page.map(idea => ({
        _id: idea._id,
        _creationTime: idea._creationTime,
        title: idea.title,
        lane: idea.lane,
        notes: idea.notes,
        taskId: idea.taskId,
        archivedAt: idea.archivedAt,
      })),
    };
  },
});

export const create = mutation({
  args: { title: v.string(), lane, notes: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    return ctx.db.insert("ideas", {
      owner,
      title: nonempty(args.title),
      lane: args.lane,
      notes: notesValue(args.notes),
    });
  },
});

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

export const activate = mutation({
  args: { ideaId: v.id("ideas"), title: v.string(), minutes: v.number(), energy: v.number(), doneWhen: v.string() },
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
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
    if (![1, 2, 3].includes(args.energy)) throw new ConvexError("Choose a valid energy level.");
    const taskId = await ctx.db.insert("tasks", {
      owner,
      ideaId: idea._id,
      title: nonempty(args.title),
      lane: idea.lane,
      minutes: args.minutes,
      energy: args.energy,
      doneWhen: nonempty(args.doneWhen, 1000),
      nextStep: "",
      dependencies: [],
      status: "Ready",
    });
    await ctx.db.patch(idea._id, { taskId });
    return taskId;
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
