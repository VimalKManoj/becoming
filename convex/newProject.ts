import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { lane } from "./schema";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { notesValue } from "./lib/validate";
import { addDocFor, addPhaseFor } from "./constellation";
import { addMilestoneFor } from "./projects";
import { createTaskFor } from "./tasks";

// The New project page (Work → New project, the owner's Setup design): a name and why, the
// docs it stands on, its phases with their milestones (each with details, notes and tasks),
// and the first evening, created together in one transaction, so a half-made project never
// appears. Docs start as planned (not yet written) and feed the phases chosen for them.

const task = v.object({ title: v.string(), minutes: v.number() });
const milestone = v.object({ title: v.string(), doneWhen: v.optional(v.string()), notes: v.optional(v.string()), tasks: v.array(task) });
const phase = v.object({
  name: v.string(), goal: v.optional(v.string()), doneWhen: v.optional(v.string()), notes: v.optional(v.string()),
  // Codes of the docs (from `docs`) that feed this phase.
  docCodes: v.optional(v.array(v.string())),
  milestones: v.array(milestone),
});

export const create = mutation({
  args: {
    title: v.string(), purpose: v.string(), ideaId: v.optional(v.id("ideas")),
    /** The lane its tasks take: Writing for a writing project, Projects otherwise. */
    lane: v.optional(lane),
    docs: v.array(v.object({ code: v.string(), title: v.string() })),
    phases: v.array(phase),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const milestones = args.phases.reduce((n, p) => n + p.milestones.length, 0);
    const tasks = args.phases.reduce((n, p) => n + p.milestones.reduce((k, m) => k + m.tasks.length, 0), 0);
    if (args.phases.length > 40) throw new ConvexError("A project can have up to 40 phases.");
    if (args.docs.length > 40) throw new ConvexError("A project can have up to 40 docs.");
    if (milestones > 120) throw new ConvexError("Plan up to 120 milestones to start with.");
    if (tasks > 200) throw new ConvexError("Plan up to 200 tasks to start with.");
    const idea = args.ideaId ? await ctx.db.get(args.ideaId) : null;
    if (args.ideaId) {
      assertOwner(idea, owner);
      if (idea!.archivedAt || idea!.taskId) throw new ConvexError("That idea is already active or archived.");
    }

    const projectId = await ctx.db.insert("projects", {
      owner, title: nonempty(args.title), purpose: nonempty(args.purpose, 2000), status: "Active", ...(args.ideaId ? { ideaId: args.ideaId } : {}),
    });

    const phaseIds: Id<"phases">[] = [];
    for (const p of args.phases) {
      const phaseId = await addPhaseFor(ctx, owner, projectId, { name: p.name, goal: p.goal, doneWhen: p.doneWhen });
      const notes = p.notes ? notesValue(p.notes) : undefined;
      if (notes) await ctx.db.patch(phaseId, { notes });
      phaseIds.push(phaseId);
    }

    for (const d of args.docs) {
      const code = d.code.trim().toUpperCase();
      const feeds = args.phases.flatMap((p, i) => (p.docCodes ?? []).some(c => c.trim().toUpperCase() === code) ? [phaseIds[i]] : []);
      await addDocFor(ctx, owner, projectId, { code, title: d.title, phaseIds: feeds, written: false });
    }

    let firstTaskId: Id<"tasks"> | null = null;
    for (const [i, p] of args.phases.entries()) {
      for (const m of p.milestones) {
        const milestoneId = await addMilestoneFor(ctx, owner, { projectId, title: m.title, doneWhen: m.doneWhen });
        const notes = m.notes ? notesValue(m.notes) : undefined;
        await ctx.db.patch(milestoneId, { phaseId: phaseIds[i], ...(notes ? { notes } : {}) });
        for (const t of m.tasks) {
          const taskId = await createTaskFor(ctx, owner, { title: t.title, lane: args.lane ?? "Projects", minutes: t.minutes, energy: 2, doneWhen: "", projectId, milestoneId });
          firstTaskId ??= taskId;
        }
      }
    }

    // An idea that became this project is active from here, through its first task.
    if (idea && firstTaskId) await ctx.db.patch(idea._id, { taskId: firstTaskId });
    return { projectId, firstTaskId };
  },
});

/** Ideas a new project can start from: not archived and not already active, newest first. */
export const ideas = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const ideas = await ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(200);
    return ideas.filter(idea => !idea.archivedAt && !idea.taskId).slice(0, 30)
      .map(idea => ({ id: idea._id, title: idea.title, purpose: idea.brainstorm?.problem || idea.notes.split("\n")[0] || "" }));
  },
});
