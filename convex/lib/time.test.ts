import { expect, it } from "vitest";
import { weekKey } from "./time";

it("uses Monday and the person's timezone at a UTC week boundary", () => {
  const time = Date.parse("2026-09-13T20:00:00Z");
  expect(weekKey(time, "Asia/Kolkata")).toBe("2026-09-14");
  expect(weekKey(time, "America/New_York")).toBe("2026-09-07");
});
