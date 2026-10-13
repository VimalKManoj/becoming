import { describe, expect, it } from "vitest";
import { deriveRhythm } from "./use-rhythm";

const DAY = 86_400_000;
// Monday 12 October 2026, 14:00 UTC; the account's timezone is UTC so weeks are easy to read.
const NOW = Date.UTC(2026, 9, 12, 14);
const at = (month: number, day: number, hour = 15) => Date.UTC(2026, month - 1, day, hour);
const work = (when: number, kind: "done" | "started" = "done", backfilled = true) => ({ at: when, kind, lane: "Projects" as const, backfilled });

function rhythm(moves: ReturnType<typeof work>[], commitments: { week: string; target: number; paused: boolean }[]) {
  return deriveRhythm({
    timezone: "UTC", commitments, reflections: [], sessions: [], plans: [], work: moves,
    joinedAt: at(10, 10), windowStart: NOW - 27 * 7 * DAY,
  }, NOW);
}

describe("the week counts work, from your first activity", () => {
  it("starts at the week of the first activity and judges earlier weeks by the first target", () => {
    // Two weeks of backfilled work before the target was set this week: 3 days, then 2 days.
    const r = rhythm([
      work(at(9, 21)), work(at(9, 23)), work(at(9, 23, 18)), work(at(9, 25)),
      work(at(9, 28)), work(at(9, 30)),
    ], [{ week: "2026-10-12", target: 3, paused: false }]);
    expect(r.weeks.map(w => [w.week, w.count, w.status])).toEqual([
      ["2026-10-12", 0, "in-progress"], ["2026-10-05", 0, "missed"], ["2026-09-28", 2, "missed"], ["2026-09-21", 3, "met"],
    ]);
    // Two things on one day count as one day.
    expect(r.counts.get("2026-09-21")).toBe(3);
    expect(r.streak).toEqual({ current: 0, longest: 1 });
  });

  it("makes a streak from weeks that met the target, even before the target was chosen", () => {
    const r = rhythm([
      work(at(9, 28)), work(at(9, 29)), work(at(10, 1)),
      work(at(10, 5)), work(at(10, 7)), work(at(10, 9)),
      work(at(10, 12, 9), "started", false),
    ], [{ week: "2026-10-12", target: 3, paused: false }]);
    expect(r.weeks.map(w => w.status)).toEqual(["in-progress", "met", "met"]);
    expect(r.streak.current).toBe(2);
    expect(r.thisWeek.count).toBe(1);
  });

  it("has nothing to judge before any work", () => {
    const r = rhythm([], [{ week: "2026-10-12", target: 3, paused: false }]);
    expect(r.weeks.map(w => w.week)).toEqual(["2026-10-12"]);
  });
});
