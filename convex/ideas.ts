import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./model";
import { lane } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";

function notesValue(value: string) {
  if (value.length > 10000) throw new ConvexError("Keep idea notes under 10,000 characters.");
  return value.trim();
}

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db.query("ideas")
      .withIndex("by_owner", q => q.eq("owner", owner))
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
