import { describe, expect, it } from "vitest";
import { dateLine, daysBetween, greeting, lastWorked, sessionLine, weekLine } from "./ritual";

const at = (y: number, m: number, d: number, h = 20, min = 42) => new Date(y, m - 1, d, h, min).getTime();

describe("the Ritual design's words", () => {
  it("writes the date line", () => {
    expect(dateLine(at(2026, 9, 24))).toBe("THU · 24 SEP · 8:42 PM");
  });

  it("greets by time of day, names Sunday evening, and welcomes back after a gap", () => {
    const thursday = at(2026, 9, 24);
    expect(greeting({ now: thursday, name: "Vimal Manoj", lastSessionAt: at(2026, 9, 23) })).toBe("Good evening, Vimal.");
    expect(greeting({ now: at(2026, 9, 24, 9), name: "Vimal", lastSessionAt: at(2026, 9, 23) })).toBe("Good morning, Vimal.");
    expect(greeting({ now: at(2026, 9, 27, 19), name: "Vimal", lastSessionAt: at(2026, 9, 26) })).toBe("Sunday evening, Vimal.");
    expect(greeting({ now: thursday, name: "Vimal", lastSessionAt: at(2026, 9, 20) })).toBe("Welcome back, Vimal.");
    expect(greeting({ now: thursday, name: null, lastSessionAt: null })).toBe("Hello.");
    expect(daysBetween(at(2026, 9, 20, 23), at(2026, 9, 21, 1))).toBe(1);
  });

  it("words the week honestly", () => {
    expect(weekLine({ count: 3, target: 4, streak: 3, configured: true, paused: false })).toBe("One more makes the week. No rush.");
    expect(weekLine({ count: 1, target: 4, streak: 0, configured: true, paused: false })).toBe("3 more make the week. No rush.");
    expect(weekLine({ count: 4, target: 4, streak: 4, configured: true, paused: false })).toBe("Week met. 4 weeks in a row. Anything more is a bonus.");
    expect(weekLine({ count: 0, target: null, streak: 0, configured: false, paused: false })).toBe("Your week starts with your first session.");
    expect(weekLine({ count: 0, target: 3, streak: 2, configured: true, paused: true })).toBe("A planned pause. Your streak waits for you.");
  });

  it("describes a saved session and a project's last work", () => {
    expect(sessionLine({ endedAt: at(2026, 9, 27, 21, 0), startedAt: at(2026, 9, 27, 20, 8), outcome: "Made progress" })).toBe("SUN · 52 MIN · MADE PROGRESS");
    expect(lastWorked(null, at(2026, 9, 24))).toBe("Not started yet");
    expect(lastWorked(at(2026, 9, 20), at(2026, 9, 24))).toBe("Last worked Sunday");
    expect(lastWorked(at(2026, 9, 9), at(2026, 9, 24))).toBe("Resting for 2 weeks");
  });
});
