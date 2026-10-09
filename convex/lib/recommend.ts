import type { Doc, Id } from "../_generated/dataModel";

// Today's recommendation rules, kept pure so they can be tested without a database.
// The caller passes only owned tasks whose prerequisites are already satisfied.

export type Lane = Doc<"tasks">["lane"];
export type Capacity = { minutes: number; energy: number };
export type Candidate = Pick<Doc<"tasks">, "_id" | "_creationTime" | "title" | "lane" | "status" | "minutes" | "energy" | "doneWhen" | "nextStep" | "smallerStep" | "smallerDone" | "smallerMinutes">;
export type Preferences = { pinnedTaskId?: Id<"tasks">; laneFocus?: Lane; linedUp?: Id<"tasks">[] };
export type Focus = {
  taskId: Id<"tasks">; title: string; taskTitle: string; lane: Lane; status: Candidate["status"];
  minutes: number; energy: number; doneWhen: string; nextStep: string; smaller: boolean; pinned: boolean; reason: string;
};

const energyLabel = ["", "low", "steady", "high"] as const;

/** Whether a task fits as is, only through its defined smaller step, or not at all. */
export function fitFor(task: Candidate, capacity: Capacity): "full" | "smaller" | null {
  if (task.status !== "Ready" && task.status !== "In progress") return null;
  if (task.minutes <= capacity.minutes && task.energy <= capacity.energy) return "full";
  const stepFits = task.smallerStep && task.smallerDone && task.smallerMinutes !== undefined && task.smallerMinutes <= capacity.minutes;
  return stepFits ? "smaller" : null;
}

/**
 * Ranks feasible focuses for the given capacity. `recentLanes` lists the lanes of
 * the latest saved sessions, newest first. Rules, in order:
 * 1. Only Ready / In progress work that fits; a too-large task appears only through its defined smaller step.
 * 2. A pinned task that fits comes first.
 * 3. Avoid a third consecutive session in the same lane when another lane has suitable work.
 * 4. Prefer the lane with the fewest recent sessions. A favoured lane counts one session fewer.
 * 5. Within a lane, resume started work first, then the oldest task.
 */
export function rankFocuses(candidates: Candidate[], recentLanes: Lane[], capacity: Capacity, preferences: Preferences = {}, limit = 3): Focus[] {
  const count = (lane: Lane) => recentLanes.filter(recent => recent === lane).length - (lane === preferences.laneFocus ? 1 : 0);
  const repeatedLane = recentLanes.length >= 2 && recentLanes[0] === recentLanes[1] ? recentLanes[0] : null;
  const pinned = (task: Candidate) => task._id === preferences.pinnedTaskId;
  const lined = (task: Candidate) => Boolean(preferences.linedUp?.includes(task._id));
  return candidates
    .flatMap(task => {
      const fit = fitFor(task, capacity);
      return fit ? [{ task, smaller: fit === "smaller" }] : [];
    })
    .sort((a, b) => Number(pinned(b.task)) - Number(pinned(a.task))
      || Number(lined(b.task)) - Number(lined(a.task))
      || Number(a.task.lane === repeatedLane) - Number(b.task.lane === repeatedLane)
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
      energy: task.energy,
      doneWhen: smaller ? task.smallerDone! : task.doneWhen,
      nextStep: task.nextStep,
      smaller,
      pinned: pinned(task),
      reason: explain(task, smaller, recentLanes, repeatedLane, capacity, preferences),
    }));
}

// Reasons are generated from the same facts the ranking used, in plain language.
export function explain(task: Candidate, smaller: boolean, recentLanes: Lane[], repeatedLane: Lane | null, capacity: Capacity, preferences: Preferences = {}) {
  const total = recentLanes.length;
  const laneSessions = recentLanes.filter(recent => recent === task.lane).length;
  const context = task._id === preferences.pinnedTaskId ? "You pinned this as your next focus."
    : preferences.linedUp?.includes(task._id) ? "You lined this up in your weekly plan."
    : total === 0 ? "A good first session."
      : laneSessions === 0 ? (total === 1 ? `Your last session was ${recentLanes[0]}, so ${task.lane} gets a turn.` : `None of your last ${total} sessions were ${task.lane}.`)
        : repeatedLane && repeatedLane !== task.lane ? `Your last two sessions were ${repeatedLane}, so ${task.lane} gets a turn.`
          : task.status === "In progress" ? "It picks up work you've already started."
            : total === 1 ? `It keeps your ${task.lane} momentum going.`
              : `${task.lane} had ${laneSessions} of your last ${total} sessions.`;
  const favoured = preferences.laneFocus === task.lane && task._id !== preferences.pinnedTaskId ? ` You're favouring ${task.lane} at the moment.` : "";
  const fit = smaller
    ? `The full task needs more time or energy, so this is its ${task.smallerMinutes}-minute smaller step.`
    : `It fits your ${capacity.minutes} minutes and ${energyLabel[capacity.energy] ?? "current"} energy.`;
  return `${context}${favoured} ${fit}`;
}

/** Why a pinned task can't be offered tonight, in plain language. */
export function pinnedNote(task: Candidate, capacity: Capacity) {
  const needs = `${task.minutes} minutes and ${energyLabel[task.energy] ?? "more"} energy`;
  return task.smallerStep && task.smallerMinutes !== undefined
    ? `Your pinned task needs ${needs}, and its smaller step needs ${task.smallerMinutes} minutes. Choose more time, or pick something else tonight.`
    : `Your pinned task needs ${needs}, which is more than you have tonight (${capacity.minutes} minutes). Choose more time, define a smaller step in Work, or pick something else.`;
}
