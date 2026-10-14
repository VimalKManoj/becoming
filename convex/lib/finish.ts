import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { prerequisiteCleared } from "./taskRules";
import { effectiveSkills } from "./work";

// What finishing a task means beyond the task: the skills it grew, how far its milestone
// got, whether the milestone or its phase just completed, and what's next in the same
// place. Wherever a finish happens, the app shows it (PLAN-one-tap-and-daily-loop, Phase 1).

type Ctx = Pick<QueryCtx, "db">;

export type Completion = { milestone: boolean; phase: boolean };
export type Finish = {
  skills: string[];
  milestone: { id: Id<"milestones">; title: string; done: number; total: number; completedNow: boolean } | null;
  phase: { id: Id<"phases">; name: string; completedNow: boolean } | null;
  next: { id: Id<"tasks">; title: string; minutes: number; status: Doc<"tasks">["status"] } | null;
};

const open = (task: Doc<"tasks">) => task.status === "Ready" || task.status === "In progress";

async function phaseComplete(ctx: Ctx, phaseId: Id<"phases"> | undefined) {
  if (!phaseId) return false;
  const milestones = await ctx.db.query("milestones").withIndex("by_phase", q => q.eq("phaseId", phaseId)).collect();
  return milestones.length > 0 && milestones.every(m => m.completedAt !== undefined);
}

/** Whether the task's milestone and phase were complete, read before a move changes them. */
export async function completionOf(ctx: Ctx, task: Doc<"tasks">): Promise<Completion> {
  const milestone = task.milestoneId ? await ctx.db.get(task.milestoneId) : null;
  return { milestone: milestone?.completedAt !== undefined && milestone !== null, phase: await phaseComplete(ctx, milestone?.phaseId) };
}

/** The open task to offer next: In progress first, then the oldest Ready whose prerequisites are done. */
async function firstOpen(ctx: Ctx, tasks: Doc<"tasks">[], except: Id<"tasks">) {
  const candidates = tasks.filter(t => t._id !== except && open(t))
    .sort((a, b) => (a.status === "In progress" ? 0 : 1) - (b.status === "In progress" ? 0 : 1) || a._creationTime - b._creationTime);
  for (const task of candidates) {
    const prerequisites = await Promise.all(task.dependencies.map(id => ctx.db.get(id)));
    if (prerequisites.every(p => !p || prerequisiteCleared(p.status))) return task;
  }
  return null;
}

export async function finishFor(ctx: Ctx, owner: string, taskId: Id<"tasks">, before: Completion): Promise<Finish | null> {
  const task = await ctx.db.get(taskId);
  if (!task || task.owner !== owner) return null;
  const milestone = task.milestoneId ? await ctx.db.get(task.milestoneId) : null;
  const phase = milestone?.phaseId ? await ctx.db.get(milestone.phaseId) : null;
  const siblings = milestone
    ? (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestone._id)).collect()).filter(t => t.owner === owner && t.status !== "Archived")
    : [];
  let next = await firstOpen(ctx, siblings, task._id);
  // The milestone is finished: offer the first open task of the phase's next unfinished milestone.
  if (!next && phase) {
    const milestones = (await ctx.db.query("milestones").withIndex("by_phase", q => q.eq("phaseId", phase._id)).collect())
      .filter(m => m._id !== milestone?._id && m.completedAt === undefined).sort((a, b) => a.order - b.order);
    for (const m of milestones) {
      const tasks = (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", m._id)).collect()).filter(t => t.owner === owner);
      next = await firstOpen(ctx, tasks, task._id);
      if (next) break;
    }
  }
  return {
    skills: effectiveSkills(task, milestone, phase),
    milestone: milestone ? {
      id: milestone._id, title: milestone.title,
      done: siblings.filter(t => t.status === "Done").length, total: siblings.length,
      completedNow: !before.milestone && milestone.completedAt !== undefined,
    } : null,
    phase: phase ? { id: phase._id, name: phase.name, completedNow: !before.phase && await phaseComplete(ctx, phase._id) } : null,
    next: next ? { id: next._id, title: next.title, minutes: next.minutes, status: next.status } : null,
  };
}
