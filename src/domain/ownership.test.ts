import { expect, it } from "vitest";
import { assertOwner, nonempty } from "../../convex/lib/ownership";
it("rejects another user's records and missing records identically", () => {
  expect(() => assertOwner({ owner: "user-a" }, "user-b")).toThrow("Record not found");
  expect(() => assertOwner(null, "user-b")).toThrow("Record not found");
  expect(() => assertOwner({ owner: "user-a" }, "user-a")).not.toThrow();
});
it("normalizes input and rejects empty and oversized values", () => {
  expect(nonempty("  A useful step  ")).toBe("A useful step");
  expect(() => nonempty("   ")).toThrow();
  expect(() => nonempty("a".repeat(161))).toThrow();
});
