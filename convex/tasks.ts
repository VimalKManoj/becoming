import { v, ConvexError } from "convex/values";
import { query, mutation } from "./model";
import { lane, outcome } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";

export const list = query({ args: {}, handler: async ctx => {
  const owner = await requireOwner(ctx);
  return ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).take(200);
} });

export const create = mutation({
  args: { title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(), projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (args.projectId) assertOwner(await ctx.db.get(args.projectId), owner);
    if (!Number.isInteger(args.minutes) || args.minutes < 5 || args.minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
    if (![1, 2, 3].includes(args.energy)) throw new ConvexError("Choose a valid energy level.");
    return ctx.db.insert("tasks", { ...args, owner, title: nonempty(args.title), doneWhen: nonempty(args.doneWhen, 1000), nextStep: "", dependencies: [], status: "Ready" });
  },
});

// Starter full-task recap. Session start/cancel, partial-step records and UI wiring
// are deliberately completed together in phase 2 before enabling cloud mode.
export const recordSession = mutation({
  args: { taskId: v.id("tasks"), key: v.string(), outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const task = await ctx.db.get(args.taskId);
    assertOwner(task, owner);
    const key = nonempty(args.key);
    const existing = await ctx.db.query("sessions").withIndex("by_owner_key", q => q.eq("owner", owner).eq("key", key)).unique();
    if (existing) {
      if (existing.taskId !== args.taskId) throw new ConvexError("This session key belongs to another task.");
      return existing._id;
    }
    if (!task || task.status === "Done" || task.status === "Blocked") throw new ConvexError("This task is not ready for a session.");
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
    const id = await ctx.db.insert("sessions", { ...args, key, contribution, nextStep, evidence, owner, title: task.title, lane: task.lane, endedAt: Date.now() });
    await ctx.db.patch(task._id, { status: args.outcome === "Finished" ? "Done" : args.outcome === "Blocked" ? "Blocked" : "In progress", nextStep });
    if (evidence) await ctx.db.insert("artifacts", { owner, sessionId: id, title: task.title, url: evidence, status: "Draft", portfolioCandidate: false });
    return id;
  },
});
