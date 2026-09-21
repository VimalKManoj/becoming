import { expect, it } from "vitest";
import { assertOwner, nonempty, requireOwner } from "../../convex/lib/ownership";
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

it("requires a trusted identity and uses its token identifier for ownership", async () => {
  await expect(requireOwner({ auth: { getUserIdentity: async () => null } })).rejects.toThrow("Sign in to access this workspace");
  const identity = { subject: "user-a", issuer: "https://auth.example.test", tokenIdentifier: "https://auth.example.test|user-a" };
  await expect(requireOwner({ auth: { getUserIdentity: async () => identity } })).resolves.toBe(identity.tokenIdentifier);
});
