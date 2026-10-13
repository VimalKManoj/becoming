import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { commitmentFor, evaluateWeek, streaks, type WeekResult } from "../../convex/lib/rhythm";
import { addDays, dayKey, isSupportedTimeZone, weekKey } from "../../convex/lib/time";

/** The current time, refreshed on an interval. Starts as null so render never reads the clock. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [intervalMs]);
  return now;
}

export type Rhythm = ReturnType<typeof deriveRhythm>;

/**
 * Weekly rhythm derived in the browser from stored records: the saved timezone,
 * commitments, and the work done (sessions and task moves). `undefined` while loading.
 */
export function useRhythm() {
  const now = useNow();
  // Rounding to the hour keeps the query arguments stable, so Convex reuses one
  // subscription and still refreshes as weeks roll over.
  const hour = now === null ? null : Math.floor(now / 3_600_000) * 3_600_000;
  const data = useQuery(api.rhythm.overview, hour === null ? "skip" : { now: hour });
  return useMemo(() => (data && now !== null ? deriveRhythm(data, now) : undefined), [data, now]);
}

type Overview = FunctionReturnType<typeof api.rhythm.overview>;
/** One piece of work on the timeline: a saved session, or a task started, finished or logged. */
export type Moment = { at: number; lane: "Projects" | "Showcases" | "Writing"; kind: string; backfilled: boolean };

export function deriveRhythm(data: Overview, now: number) {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const savedZone = data.timezone && isSupportedTimeZone(data.timezone) ? data.timezone : null;
  const timezone = savedZone ?? browserZone;
  const currentWeek = weekKey(now, timezone);
  // Work, not only focus: a saved session or a task started, finished or logged, from the app,
  // an assistant or a backfilled plan. A week counts its active days (a day with any of it).
  const moments: Moment[] = [
    ...data.sessions.map(session => ({ at: session.endedAt, lane: session.lane, kind: "session", backfilled: false })),
    ...data.work.map(move => ({ at: move.at, lane: move.lane, kind: move.kind, backfilled: move.backfilled })),
  ].sort((x, y) => x.at - y.at);
  const days = new Map<string, Set<string>>();
  for (const moment of moments) {
    const week = weekKey(moment.at, timezone);
    days.set(week, (days.get(week) ?? new Set()).add(dayKey(moment.at, timezone)));
  }
  const counts = new Map([...days].map(([week, set]) => [week, set.size]));
  // Weeks start at the week of your first activity (the oldest week touching the query window
  // may be only partly loaded, so never before the first complete week after it).
  const firstWork = moments[0] ? weekKey(moments[0].at, timezone) : currentWeek;
  const loadedWeek = addDays(weekKey(data.windowStart, timezone), 7);
  const firstFullWeek = firstWork > loadedWeek ? firstWork : loadedWeek;
  // Weeks before you first chose a target are judged by that first target, so work done
  // before setting it can still make a streak instead of breaking it as "not set".
  const earliest = [...data.commitments].sort((x, y) => x.week.localeCompare(y.week))[0];
  const judged = earliest && earliest.week > firstFullWeek ? [{ week: firstFullWeek, target: earliest.target, paused: false }, ...data.commitments] : data.commitments;
  const weeks: WeekResult[] = [];
  for (let week = currentWeek; week >= firstFullWeek; week = addDays(week, -7)) {
    weeks.push(evaluateWeek(week, currentWeek, counts.get(week) ?? 0, judged));
  }
  const streak = streaks(weeks);
  // If the current run never breaks inside the loaded window, the real streak may be longer.
  const brokeAt = weeks.findIndex(week => week.status === "missed" || week.status === "not-set");
  const streakIsLowerBound = streak.current > 0 && brokeAt === -1 && firstFullWeek === loadedWeek;
  const nextWeek = addDays(currentWeek, 7);
  return {
    configured: Boolean(savedZone) && data.commitments.length > 0,
    savedTimezone: data.timezone,
    timezoneUnsupported: Boolean(data.timezone) && !savedZone,
    browserZone,
    timezone,
    today: dayKey(now, timezone),
    currentWeek,
    nextWeek,
    thisWeek: weeks[0],
    next: commitmentFor(nextWeek, data.commitments),
    weeks,
    streak,
    streakIsLowerBound,
    counts,
    moments,
    joinedAt: data.joinedAt,
    sessions: data.sessions,
    reflections: data.reflections,
    plans: data.plans,
  };
}
