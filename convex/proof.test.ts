import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Design a component", lane: "Showcases" as const, minutes: 30, energy: 2, doneWhen: "A demo exists" };

describe("cloud Proof gallery", () => {
  it("shows only owned evidence with its owned session story and paginates", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const aTask = await asA.mutation(api.tasks.create, task);
    const bTask = await asB.mutation(api.tasks.create, { ...task, title: "Another person's work" });

    await expect(t.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("Sign in");
    const cancelled = await asA.mutation(api.tasks.startSession, { taskId: aTask });
    await asA.mutation(api.tasks.cancelSession, { activeSessionId: cancelled });
    expect((await asA.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);

    for (const [index, who, taskId] of [[1, asA, aTask], [2, asB, bTask], [3, asA, aTask]] as const) {
      const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
      await who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: `Contribution ${index}`, nextStep: "Continue", evidence: `https://example.test/evidence-${index}` });
    }

    const first = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 1, cursor: null } });
    expect(first.page[0]).toMatchObject({ url: "https://example.test/evidence-3", status: "Draft", source: { contribution: "Contribution 3", lane: "Showcases" } });
    expect(first.page[0]).not.toHaveProperty("owner");
    expect(first.isDone).toBe(false);
    const second = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 1, cursor: first.continueCursor } });
    expect(second.page.map(artifact => artifact.url)).toEqual(["https://example.test/evidence-1"]);
    expect(second.isDone).toBe(true);
    const other = await asB.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(other.page.map(artifact => artifact.url)).toEqual(["https://example.test/evidence-2"]);
  });

  it("does not reveal a foreign session through a malformed owned artifact", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const bTask = await asB.mutation(api.tasks.create, task);
    const activeSessionId = await asB.mutation(api.tasks.startSession, { taskId: bTask });
    const foreignSession = await asB.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: "Private detail", nextStep: "Continue", evidence: "" });
    await t.run(ctx => ctx.db.insert("artifacts", { owner: "https://auth.example.test|user-a", sessionId: foreignSession, title: "Broken reference", url: "https://example.test/broken", status: "Draft", portfolioCandidate: false }));

    const page = await asA.query(api.proof.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page[0].source).toBeNull();
    expect(JSON.stringify(page.page)).not.toContain("Private detail");
  });
});
