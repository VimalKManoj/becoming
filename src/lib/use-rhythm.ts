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
 * commitments and session end times. `undefined` while loading.
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

export function deriveRhythm(data: Overview, now: number) {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const savedZone = data.timezone && isSupportedTimeZone(data.timezone) ? data.timezone : null;
  const timezone = savedZone ?? browserZone;
  const currentWeek = weekKey(now, timezone);
  const counts = new Map<string, number>();
  for (const session of data.sessions) {
    const week = weekKey(session.endedAt, timezone);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  // The oldest week touching the query window may be only partly loaded, so evaluation
  // starts at the first complete week after it.
  const firstFullWeek = addDays(weekKey(data.windowStart, timezone), 7);
  const weeks: WeekResult[] = [];
  for (let week = currentWeek; week >= firstFullWeek; week = addDays(week, -7)) {
    weeks.push(evaluateWeek(week, currentWeek, counts.get(week) ?? 0, data.commitments));
  }
  const streak = streaks(weeks);
  // If the current run never breaks inside the loaded window, the real streak may be longer.
  const brokeAt = weeks.findIndex(week => week.status === "missed" || week.status === "not-set");
  const streakIsLowerBound = streak.current > 0 && brokeAt === -1;
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
    sessions: data.sessions,
    reflections: data.reflections,
    plans: data.plans,
  };
}
