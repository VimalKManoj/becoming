// Weekly commitments and streaks, derived from stored records only.
//
// A commitment document says "from this week on, the target is N sessions", and may
// also mark that one week as a planned pause. Targets therefore inherit forward from
// the latest commitment at or before a week, while a pause applies only to its own
// week. Changing a target creates a commitment for next week, so a finished week keeps
// the target it had and its result can never be rewritten.

export type Commitment = { week: string; target: number; paused: boolean };
export type WeekStatus = "met" | "missed" | "paused" | "in-progress" | "not-set";
export type WeekResult = { week: string; status: WeekStatus; count: number; target: number | null };

/** The target and pause flag in force for a week. `commitments` may be in any order. */
export function commitmentFor(week: string, commitments: Commitment[]) {
  let latest: Commitment | null = null;
  for (const commitment of commitments) {
    if (commitment.week <= week && (!latest || commitment.week > latest.week)) latest = commitment;
  }
  if (!latest) return null;
  return { target: latest.target, paused: latest.week === week && latest.paused };
}

/** Week keys sort as dates, so plain string comparison orders them. */
export function evaluateWeek(week: string, currentWeek: string, count: number, commitments: Commitment[]): WeekResult {
  const commitment = commitmentFor(week, commitments);
  if (!commitment) return { week, status: "not-set", count, target: null };
  if (commitment.paused) return { week, status: "paused", count, target: commitment.target };
  if (count >= commitment.target) return { week, status: "met", count, target: commitment.target };
  return { week, status: week >= currentWeek ? "in-progress" : "missed", count, target: commitment.target };
}

/**
 * Current and longest streaks over weeks given newest first. A met week adds one.
 * A paused week and the unfinished current week neither add nor break. A missed week,
 * or a week before any commitment, ends a run.
 */
export function streaks(weeks: WeekResult[]) {
  let current = 0;
  let currentOpen = true;
  let run = 0;
  let longest = 0;
  for (const week of weeks) {
    if (week.status === "paused" || week.status === "in-progress") continue;
    if (week.status === "met") {
      run += 1;
      if (currentOpen) current += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
      currentOpen = false;
    }
  }
  return { current, longest };
}
