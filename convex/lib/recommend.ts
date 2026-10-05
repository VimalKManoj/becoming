import type { Doc, Id } from "../_generated/dataModel";

// Today's recommendation rules, kept pure so they can be tested without a database.
// The caller passes only owned tasks whose prerequisites are already satisfied.

export type Lane = Doc<"tasks">["lane"];
export type Capacity = { minutes: number; energy: number };
export type Candidate = Pick<Doc<"tasks">, "_id" | "_creationTime" | "title" | "lane" | "status" | "minutes" | "energy" | "doneWhen" | "nextStep" | "smallerStep" | "smallerDone" | "smallerMinutes">;
export type Focus = {
  taskId: Id<"tasks">; title: string; taskTitle: string; lane: Lane; status: Candidate["status"];
  minutes: number; doneWhen: string; nextStep: string; smaller: boolean; reason: string;
};

const energyLabel = ["", "low", "steady", "high"] as const;

/**
 * Ranks feasible focuses for the given capacity. `recentLanes` lists the lanes of
 * the latest saved sessions, newest first. Rules, in order:
 * 1. Only Ready / In progress work that fits; a too-large task appears only through its defined smaller step.
 * 2. Avoid a third consecutive session in the same lane when another lane has suitable work.
 * 3. Prefer the lane with the fewest recent sessions.
 * 4. Within a lane, resume started work first, then the oldest task.
 */
export function rankFocuses(candidates: Candidate[], recentLanes: Lane[], capacity: Capacity, limit = 3): Focus[] {
  const count = (lane: Lane) => recentLanes.filter(recent => recent === lane).length;
  const repeatedLane = recentLanes.length >= 2 && recentLanes[0] === recentLanes[1] ? recentLanes[0] : null;
  return candidates
    .flatMap(task => {
      if (task.status !== "Ready" && task.status !== "In progress") return [];
      if (task.minutes <= capacity.minutes && task.energy <= capacity.energy) return [{ task, smaller: false }];
      const stepFits = task.smallerStep && task.smallerDone && task.smallerMinutes !== undefined && task.smallerMinutes <= capacity.minutes;
      return stepFits ? [{ task, smaller: true }] : [];
    })
    .sort((a, b) => Number(a.task.lane === repeatedLane) - Number(b.task.lane === repeatedLane)
      || count(a.task.lane) - count(b.task.lane)
      || Number(b.task.status === "In progress") - Number(a.task.status === "In progress")
      || a.task._creationTime - b.task._creationTime)
    .slice(0, limit)
    .map(({ task, smaller }) => ({
      taskId: task._id,
      title: smaller ? task.smallerStep! : task.title,
      taskTitle: task.title,
      lane: task.lane,
      status: task.status,
      minutes: smaller ? task.smallerMinutes! : task.minutes,
      doneWhen: smaller ? task.smallerDone! : task.doneWhen,
      nextStep: task.nextStep,
      smaller,
      reason: explain(task, smaller, recentLanes, repeatedLane, capacity),
    }));
}

// Reasons are generated from the same facts the ranking used, in plain language.
export function explain(task: Candidate, smaller: boolean, recentLanes: Lane[], repeatedLane: Lane | null, capacity: Capacity) {
  const total = recentLanes.length;
  const laneSessions = recentLanes.filter(recent => recent === task.lane).length;
  const context = total === 0 ? "A good first session."
    : laneSessions === 0 ? (total === 1 ? `Your last session was ${recentLanes[0]}, so ${task.lane} gets a turn.` : `None of your last ${total} sessions were ${task.lane}.`)
      : repeatedLane && repeatedLane !== task.lane ? `Your last two sessions were ${repeatedLane}, so ${task.lane} gets a turn.`
        : task.status === "In progress" ? "It picks up work you've already started."
          : total === 1 ? `It keeps your ${task.lane} momentum going.`
            : `${task.lane} had ${laneSessions} of your last ${total} sessions.`;
  const fit = smaller
    ? `The full task needs more time or energy, so this is its ${task.smallerMinutes}-minute smaller step.`
    : `It fits your ${capacity.minutes} minutes and ${energyLabel[capacity.energy] ?? "current"} energy.`;
  return `${context} ${fit}`;
}
