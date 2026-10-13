"use client";

import type { CSSProperties } from "react";
import { addDays, dayKey } from "../../../convex/lib/time";
import { isoWeek } from "@/lib/format";
import { weekLine } from "@/lib/ritual";
import { useRhythm, type Rhythm } from "@/lib/use-rhythm";

// The week as the Ritual design shows it: seven dots, each filled in the lane colour of
// that day's work with its initial (P, S, W), today ringed in ember. A day is filled when
// anything moved forward: a session, or a task started, finished or logged.

type Lane = "Projects" | "Showcases" | "Writing";
const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type WeekDay = { letter: string; name: string; lane: Lane | null; today: boolean; future: boolean; count: number };

export type WeekSummary = ReturnType<typeof summarise>;

export function summarise(rhythm: Rhythm) {
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(rhythm.currentWeek, index);
    // Everything that moved forward that day: sessions and tasks started, finished or logged.
    const work = rhythm.moments.filter(moment => dayKey(moment.at, rhythm.timezone) === date);
    const tally = new Map<Lane, number>();
    for (const moment of work) tally.set(moment.lane, (tally.get(moment.lane) ?? 0) + 1);
    const lane = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { letter: dayLetters[index], name: dayNames[index], lane, today: date === rhythm.today, future: date > rhythm.today, count: work.length };
  });
  const thisWeek = rhythm.thisWeek;
  // The week counts days with progress, not how many things happened on them.
  const count = days.filter(day => day.count > 0).length;
  const target = rhythm.configured ? thisWeek?.target ?? null : null;
  const paused = thisWeek?.status === "paused";
  const streak = rhythm.streak.current;
  const todayIndex = days.findIndex(day => day.today);
  return {
    days, count, target, paused, streak, configured: rhythm.configured,
    line: weekLine({ count, target, streak, configured: rhythm.configured, paused }),
    isSunday: todayIndex === 6,
    weekNumber: isoWeek(new Date(`${rhythm.currentWeek}T12:00:00Z`)),
    currentWeek: rhythm.currentWeek, nextWeek: rhythm.nextWeek,
    plan: rhythm.plans.find(plan => plan.week === rhythm.currentWeek) ?? null,
    nextPlan: rhythm.plans.find(plan => plan.week === rhythm.nextWeek) ?? null,
  };
}

/** The current week, summarised; undefined while loading. */
export function useWeek() {
  const rhythm = useRhythm();
  return rhythm ? { rhythm, week: summarise(rhythm) } : undefined;
}

/** Seven dots. Each has a text label, so the colour is never the only signal. */
export function WeekDots({ days, size = 24, labels = false }: { days: WeekDay[]; size?: number; labels?: boolean }) {
  return <ol className="r-week" aria-label="This week, day by day" style={{ listStyle: "none", margin: 0, padding: 0, ...(labels ? { justifyContent: "space-between", width: "100%" } : {}) }}>
    {days.map((day, index) => <li key={index} style={labels ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } : undefined}>
      <span className={`r-wdot${day.lane ? ` on lane-${day.lane}` : ""}${day.today ? " today" : ""}${size >= 34 ? " big" : ""}`} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden="true">{day.lane ? day.lane[0] : ""}</span>
      {labels && <span className="r-small" style={{ fontSize: 11, fontWeight: 500 }} aria-hidden="true">{day.letter}</span>}
      <span className="sr-only">{day.name}: {day.future ? "later this week" : day.count ? `${day.count} ${day.count === 1 ? "thing" : "things"} moved forward, mostly ${day.lane}` : day.today ? "today, nothing yet" : "rest"}</span>
    </li>)}
  </ol>;
}
