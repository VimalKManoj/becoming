import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Build a case study", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "A draft exists" };

describe("cloud Journey history", () => {
  it("lists only the owner's completed recaps, newest first, with pagination", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const aTask = await asA.mutation(api.tasks.create, task);
    const bTask = await asB.mutation(api.tasks.create, { ...task, title: "Other person's work" });

    await expect(t.query(api.journey.listPage, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("Sign in");
    const cancelled = await asA.mutation(api.tasks.startSession, { taskId: aTask });
    await asA.mutation(api.tasks.cancelSession, { activeSessionId: cancelled });
    expect((await asA.query(api.journey.listPage, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);

    for (const [index, who, taskId] of [[1, asA, aTask], [2, asB, bTask], [3, asA, aTask]] as const) {
      const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
      await who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: `Contribution ${index}`, nextStep: "Continue", evidence: "" });
    }

    const first = await asA.query(api.journey.listPage, { paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page).toHaveLength(1);
    expect(first.page[0]).toMatchObject({ contribution: "Contribution 3", lane: "Projects" });
    expect(first.page[0]).not.toHaveProperty("owner");
    expect(first.isDone).toBe(false);
    const second = await asA.query(api.journey.listPage, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(second.page.map(session => session.contribution)).toEqual(["Contribution 1"]);
    expect(second.isDone).toBe(true);
    const other = await asB.query(api.journey.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(other.page.map(session => session.contribution)).toEqual(["Contribution 2"]);
  });
});
