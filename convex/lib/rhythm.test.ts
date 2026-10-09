import { describe, expect, it } from "vitest";
import { commitmentFor, evaluateWeek, streaks, type Commitment, type WeekResult } from "./rhythm";

const commitments: Commitment[] = [
  { week: "2026-09-07", target: 3, paused: false },
  { week: "2026-09-21", target: 2, paused: true },
  { week: "2026-10-05", target: 4, paused: false },
];

describe("commitments", () => {
  it("inherits a target forward and applies a pause to its own week only", () => {
    expect(commitmentFor("2026-08-31", commitments)).toBeNull();
    expect(commitmentFor("2026-09-14", commitments)).toEqual({ target: 3, paused: false });
    expect(commitmentFor("2026-09-21", commitments)).toEqual({ target: 2, paused: true });
    expect(commitmentFor("2026-09-28", commitments)).toEqual({ target: 2, paused: false });
    expect(commitmentFor("2026-10-12", [...commitments].reverse())).toEqual({ target: 4, paused: false });
  });

  it("evaluates met, missed, paused, in-progress and unset weeks", () => {
    const current = "2026-10-05";
    expect(evaluateWeek("2026-08-31", current, 5, commitments).status).toBe("not-set");
    expect(evaluateWeek("2026-09-07", current, 3, commitments)).toEqual({ week: "2026-09-07", status: "met", count: 3, target: 3 });
    expect(evaluateWeek("2026-09-14", current, 1, commitments).status).toBe("missed");
    expect(evaluateWeek("2026-09-21", current, 0, commitments).status).toBe("paused");
    expect(evaluateWeek(current, current, 1, commitments).status).toBe("in-progress");
    expect(evaluateWeek(current, current, 4, commitments).status).toBe("met");
  });
});

describe("streaks", () => {
  const week = (status: WeekResult["status"]): WeekResult => ({ week: "", status, count: 0, target: 1 });

  it("lets pauses and the unfinished week neither add nor break", () => {
    expect(streaks(["in-progress", "met", "paused", "met", "missed", "met"].map(s => week(s as WeekResult["status"])))).toEqual({ current: 2, longest: 2 });
    expect(streaks(["met", "met", "met"].map(s => week(s as WeekResult["status"])))).toEqual({ current: 3, longest: 3 });
  });

  it("ends a run at a missed week or the start of the rhythm", () => {
    expect(streaks(["missed", "met", "met"].map(s => week(s as WeekResult["status"])))).toEqual({ current: 0, longest: 2 });
    expect(streaks(["in-progress"].map(s => week(s as WeekResult["status"])))).toEqual({ current: 0, longest: 0 });
    expect(streaks(["met", "not-set", "met", "met"].map(s => week(s as WeekResult["status"])))).toEqual({ current: 1, longest: 2 });
  });
});
