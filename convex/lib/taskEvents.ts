import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// One line in a task's history: created, started, blocked, done, focused and so on.
// Written by every mutation that moves a task, so timelines and the activity feed are
// complete without a separate bookkeeping step.

export type TaskEventKind = Doc<"taskEvents">["kind"];

export async function logEvent(ctx: Pick<MutationCtx, "db">, owner: string, task: Pick<Doc<"tasks">, "_id" | "projectId">, kind: TaskEventKind, extra: { note?: string; source?: string; at?: number } = {}) {
  const note = extra.note?.trim();
  await ctx.db.insert("taskEvents", {
    owner, taskId: task._id, kind, at: extra.at ?? Date.now(), source: extra.source ?? "app",
    ...(task.projectId ? { projectId: task.projectId } : {}),
    ...(note ? { note: note.slice(0, 4000) } : {}),
  });
}
