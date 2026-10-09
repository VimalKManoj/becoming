import { describe, expect, it } from "vitest";
import { dateLines, emphasiseLast, isoWeek } from "./format";

describe("header formatting", () => {
  it("numbers weeks the ISO way", () => {
    expect(isoWeek(new Date(2026, 8, 24))).toBe(39);
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });

  it("writes the date lines and the part of the day", () => {
    const lines = dateLines(new Date(2026, 8, 24, 19, 30).getTime());
    expect(lines).toEqual({ long: "THURSDAY · 24 SEPTEMBER · WEEK 39", short: "THU · 24 SEP", part: "Thursday evening" });
    expect(dateLines(new Date(2026, 8, 24, 8).getTime()).part).toBe("Thursday morning");
  });

  it("emphasises the last word of a motive", () => {
    expect(emphasiseLast("Ship things people can touch.")).toEqual({ before: "Ship things people can ", emphasis: "touch." });
    expect(emphasiseLast("Grow")).toEqual({ before: "", emphasis: "Grow" });
  });
});
