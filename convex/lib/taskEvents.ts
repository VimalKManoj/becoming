import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// One line in a task's history: created, started, blocked, done, focused and so on.
// Written by every mutation that moves a task, so timelines and the activity feed are
// complete without a separate bookkeeping step.

export type TaskEventKind = Doc<"taskEvents">["kind"];
export type TaskSnapshot = NonNullable<Doc<"taskEvents">["before"]>;

/** What a move changes, as it was before the move: kept on its event so the move can be undone. */
export function snapshot(task: Doc<"tasks">, pinned = false): TaskSnapshot {
  return {
    status: task.status, nextStep: task.nextStep,
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.completedAt !== undefined ? { completedAt: task.completedAt } : {}),
    ...(task.archivedFrom ? { archivedFrom: task.archivedFrom } : {}),
    ...(task.archivedWithProject ? { archivedWithProject: true } : {}),
    ...(task.skills ? { skills: task.skills } : {}),
    ...(pinned ? { pinned: true } : {}),
  };
}

export async function logEvent(ctx: Pick<MutationCtx, "db">, owner: string, task: Pick<Doc<"tasks">, "_id" | "projectId">, kind: TaskEventKind, extra: { note?: string; source?: string; at?: number; before?: TaskSnapshot } = {}) {
  const note = extra.note?.trim();
  return ctx.db.insert("taskEvents", {
    owner, taskId: task._id, kind, at: extra.at ?? Date.now(), source: extra.source ?? "app",
    ...(task.projectId ? { projectId: task.projectId } : {}),
    ...(note ? { note: note.slice(0, 4000) } : {}),
    ...(extra.before ? { before: extra.before } : {}),
  });
}
