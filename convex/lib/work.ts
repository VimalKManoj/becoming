import type { Doc } from "../_generated/dataModel";

// Work, not focus: what counts as progress, wherever it happened (the app, an assistant
// through MCP, or a plan backfilled from its real dates). A focus session is one kind of
// work; a task started, finished or logged is another. See PLAN-tasks-and-focus.md, Phase 2.

export const DAY = 86_400_000;

/** Task moves that make a day count: a task started, finished or logged (sessions count from their own table). */
export const progressKinds: ReadonlySet<string> = new Set(["started", "done", "logged"]);

/** Recorded more than a day after it happened: history brought in later, such as an imported plan. */
export const isBackfilled = (event: Pick<Doc<"taskEvents">, "_creationTime" | "at">) => event._creationTime - event.at > DAY;

type WithSkills = { skills?: string[] } | null | undefined;
/** A finished task's skills: its own, or else its milestone's, or else its phase's. */
export function effectiveSkills(task: WithSkills, milestone?: WithSkills, phase?: WithSkills) {
  if (task?.skills?.length) return task.skills;
  if (milestone?.skills?.length) return milestone.skills;
  return phase?.skills ?? [];
}
