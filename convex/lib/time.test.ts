import { describe, expect, it } from "vitest";
import { addDays, dayKey, isSupportedTimeZone, isWeekKey, weekKey, weekRange, zonedStartOfDay } from "./time";

const hours = (range: { start: number; end: number }) => (range.end - range.start) / 3_600_000;

describe("week keys", () => {
  it("uses Monday and the person's timezone at a UTC week boundary", () => {
    const time = Date.parse("2026-09-13T20:00:00Z");
    expect(weekKey(time, "Asia/Kolkata")).toBe("2026-09-14");
    expect(weekKey(time, "America/New_York")).toBe("2026-09-07");
    expect(dayKey(time, "Asia/Kolkata")).toBe("2026-09-14");
  });

  it("does calendar arithmetic and recognises real Mondays only", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-03-02", -7)).toBe("2026-02-23");
    expect(isWeekKey("2026-09-28")).toBe(true);
    expect(isWeekKey("2026-09-29")).toBe(false);
    expect(isWeekKey("2026-02-30")).toBe(false);
    expect(isWeekKey("not-a-week")).toBe(false);
  });
});

describe("local day starts and week ranges", () => {
  it("finds local midnight as a UTC instant", () => {
    expect(new Date(zonedStartOfDay("2026-09-14", "Asia/Kolkata")).toISOString()).toBe("2026-09-13T18:30:00.000Z");
    expect(new Date(zonedStartOfDay("2026-03-02", "America/New_York")).toISOString()).toBe("2026-03-02T05:00:00.000Z");
    expect(new Date(zonedStartOfDay("2026-03-09", "America/New_York")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
    // Auckland's daylight saving ended at 3 a.m. on Sunday 5 April 2026, while UTC was still on 4 April.
    expect(new Date(zonedStartOfDay("2026-04-05", "Pacific/Auckland")).toISOString()).toBe("2026-04-04T11:00:00.000Z");
    expect(new Date(zonedStartOfDay("2026-04-06", "Pacific/Auckland")).toISOString()).toBe("2026-04-05T12:00:00.000Z");
  });

  it("gives daylight-saving weeks their true length", () => {
    expect(hours(weekRange("2026-09-14", "Asia/Kolkata"))).toBe(168);
    expect(hours(weekRange("2026-03-02", "America/New_York"))).toBe(167);
    expect(hours(weekRange("2026-10-26", "America/New_York"))).toBe(169);
    expect(hours(weekRange("2026-03-30", "Pacific/Auckland"))).toBe(169);
  });

  it("keeps an instant inside the week its key names", () => {
    const time = Date.parse("2026-11-01T06:30:00Z"); // 01:30 EST, the repeated hour on 1 November
    const week = weekKey(time, "America/New_York");
    const range = weekRange(week, "America/New_York");
    expect(week).toBe("2026-10-26");
    expect(time >= range.start && time < range.end).toBe(true);
  });

  it("reports unsupported timezone names", () => {
    expect(isSupportedTimeZone("Europe/London")).toBe(true);
    expect(isSupportedTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});
