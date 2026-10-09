import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner, nonempty } from "./ownership";

// Validation shared by every way a task is created or edited (Work, a project, or an
// idea's activation), so the same input is accepted or refused everywhere.

export function effortValues(minutes: number, energy: number) {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw new ConvexError("Choose 5–240 minutes.");
  if (![1, 2, 3].includes(energy)) throw new ConvexError("Choose a valid energy level.");
  return { minutes, energy };
}

export function nextStepValue(value: string) {
  const step = value.trim();
  if (!step || step.length > 2000) throw new ConvexError("Add a next step (up to 2000 characters).");
  return step;
}

export type SmallerStepInput = { smallerStep?: string; smallerDone?: string; smallerMinutes?: number };

/** A smaller step is all three fields or none. Empty fields clear it. */
export function smallerStepValues(args: SmallerStepInput) {
  const step = args.smallerStep?.trim() || undefined;
  const done = args.smallerDone?.trim() || undefined;
  const minutes = args.smallerMinutes;
  if (!step && !done && minutes === undefined) return { smallerStep: undefined, smallerDone: undefined, smallerMinutes: undefined };
  if (!step || !done || minutes === undefined) throw new ConvexError("Complete all three smaller-step fields or leave them empty.");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw new ConvexError("Choose 5–240 smaller-step minutes.");
  return { smallerStep: nonempty(step, 1000), smallerDone: nonempty(done, 1000), smallerMinutes: minutes };
}

const maxPrerequisites = 10;

/** A prerequisite stops holding a task back once it is Done, or archived (set aside). */
export function prerequisiteCleared(status: Doc<"tasks">["status"]) {
  return status === "Done" || status === "Archived";
}

/**
 * Prerequisites ("waiting on") for a task: owned, never the task itself, and never a loop
 * where tasks wait on each other. A newly added prerequisite can't be archived; one the
 * task already had may stay after it is archived, so saving an edit never forces you to
 * untick it. `taskId` is undefined for a new task, which can't be part of a loop yet.
 */
export async function dependencyValues(ctx: Pick<QueryCtx, "db">, owner: string, taskId: Id<"tasks"> | undefined, ids: Id<"tasks">[]) {
  const unique = [...new Set(ids)];
  if (unique.length > maxPrerequisites) throw new ConvexError(`Choose up to ${maxPrerequisites} prerequisites.`);
  const current = taskId ? (await ctx.db.get(taskId))?.dependencies ?? [] : [];
  for (const id of unique) {
    if (id === taskId) throw new ConvexError("A task can't wait on itself.");
    const dependency = await ctx.db.get(id);
    assertOwner(dependency, owner);
    if (dependency.status === "Archived" && !current.includes(id)) throw new ConvexError(`“${dependency.title}” is archived, so it can't be added as a prerequisite.`);
  }
  if (taskId) {
    // Walk everything the chosen prerequisites wait on. Meeting this task again means a loop.
    const seen = new Set<string>();
    const stack: Id<"tasks">[] = [...unique];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === taskId) throw new ConvexError("That would make tasks wait on each other in a loop.");
      if (seen.has(id)) continue;
      seen.add(id);
      const task = await ctx.db.get(id);
      if (task?.owner === owner) stack.push(...task.dependencies);
    }
  }
  return unique;
}

/** Clears the person's pin when it points at a task that is finishing or leaving active work. */
export async function clearPinIf(ctx: MutationCtx, owner: string, taskId: Id<"tasks">) {
  const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  if (profile?.pinnedTaskId === taskId) await ctx.db.patch(profile._id, { pinnedTaskId: undefined });
}

/** True when following prerequisite links from any task leads back to it. */
export function hasPrerequisiteLoop(edges: Map<string, string[]>) {
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): boolean => {
    if (state.get(id) === "done") return false;
    if (state.get(id) === "visiting") return true;
    state.set(id, "visiting");
    for (const next of edges.get(id) ?? []) if (visit(next)) return true;
    state.set(id, "done");
    return false;
  };
  return [...edges.keys()].some(visit);
}
