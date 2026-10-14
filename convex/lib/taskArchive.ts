import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { refreshMilestone } from "./projects";
import { clearPinIf } from "./taskRules";
import { logEvent, snapshot } from "./taskEvents";

// Archiving and restoring one task, shared by the task's own buttons and by its project
// (archiving a project archives its open tasks; making it active restores them).
// Both return the event they wrote, so the move can be undone.

export async function archiveTask(ctx: MutationCtx, owner: string, task: Doc<"tasks">, withProject = false) {
  const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  const before = snapshot(task, profile?.pinnedTaskId === task._id);
  await ctx.db.patch(task._id, { status: "Archived", archivedFrom: task.status === "Archived" ? undefined : task.status, ...(withProject ? { archivedWithProject: true } : {}) });
  await refreshMilestone(ctx, task.milestoneId);
  await clearPinIf(ctx, owner, task._id);
  return logEvent(ctx, owner, task, "archived", { ...(withProject ? { note: "With its project" } : {}), before });
}

export async function restoreTask(ctx: MutationCtx, owner: string, task: Doc<"tasks">, withProject = false) {
  const before = snapshot(task);
  await ctx.db.patch(task._id, { status: task.archivedFrom ?? "Ready", archivedFrom: undefined, archivedWithProject: undefined });
  await refreshMilestone(ctx, task.milestoneId);
  return logEvent(ctx, owner, task, "restored", { ...(withProject ? { note: "With its project" } : {}), before });
}
