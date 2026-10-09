import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { refreshMilestone } from "./projects";
import { clearPinIf } from "./taskRules";
import { logEvent } from "./taskEvents";

// Archiving and restoring one task, shared by the task's own buttons and by its project
// (archiving a project archives its open tasks; making it active restores them).

export async function archiveTask(ctx: MutationCtx, owner: string, task: Doc<"tasks">, withProject = false) {
  await ctx.db.patch(task._id, { status: "Archived", archivedFrom: task.status === "Archived" ? undefined : task.status, ...(withProject ? { archivedWithProject: true } : {}) });
  await refreshMilestone(ctx, task.milestoneId);
  await clearPinIf(ctx, owner, task._id);
  await logEvent(ctx, owner, task, "archived", withProject ? { note: "With its project" } : {});
}

export async function restoreTask(ctx: MutationCtx, owner: string, task: Doc<"tasks">, withProject = false) {
  await ctx.db.patch(task._id, { status: task.archivedFrom ?? "Ready", archivedFrom: undefined, archivedWithProject: undefined });
  await refreshMilestone(ctx, task.milestoneId);
  await logEvent(ctx, owner, task, "restored", withProject ? { note: "With its project" } : {});
}
