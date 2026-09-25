import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Build a cloud task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "The task persists for its owner." };

describe("cloud tasks", () => {
  it("keeps task lists and edits private to the authenticated owner", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const taskId = await asA.mutation(api.tasks.create, task);

    const pageA = await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    const pageB = await asB.query(api.tasks.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(pageA.page).toHaveLength(1);
    expect(pageA.page[0]).not.toHaveProperty("owner");
    expect(pageB.page).toEqual([]);

    await expect(asB.mutation(api.tasks.update, { taskId, ...task, title: "Stolen edit" })).rejects.toThrow("Record not found");
    await asA.mutation(api.tasks.update, { taskId, ...task, title: "Refined cloud task", minutes: 45 });
    const updated = await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(updated.page[0]).toMatchObject({ title: "Refined cloud task", minutes: 45, status: "Ready" });
  });

  it("paginates owner tasks and rejects another owner's project reference", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    for (const number of [1, 2, 3]) await asA.mutation(api.tasks.create, { ...task, title: `Task ${number}` });

    const first = await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 2, cursor: null } });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const second = await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);

    const projectId = await t.run(ctx => ctx.db.insert("projects", { owner: "https://auth.example.test|user-b", title: "Private project", purpose: "Test isolation", status: "Active" }));
    await expect(asA.mutation(api.tasks.create, { ...task, projectId })).rejects.toThrow("Record not found");
  });
});

describe("cloud focus sessions", () => {
  it("offers only owned feasible work and reflects an active focus and recap", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const smallTask = await asA.mutation(api.tasks.create, { ...task, title: "Design focus", minutes: 60, energy: 3, smallerStep: "Sketch states", smallerDone: "Three sketches exist", smallerMinutes: 15 });
    await asA.mutation(api.tasks.create, { ...task, title: "Write a post", lane: "Writing", minutes: 15, energy: 1 });
    const foreign = await asB.mutation(api.tasks.create, { ...task, title: "Private other-account task" });
    const blockedByDependency = await asA.mutation(api.tasks.create, { ...task, title: "Dependent" });
    await t.run(ctx => ctx.db.patch(blockedByDependency, { dependencies: [smallTask] }));

    const first = await asA.query(api.tasks.todayOverview, { minutes: 15, energy: 1 });
    expect(first.active).toBeNull();
    expect(first.choices.map(choice => choice.title)).toEqual(["Sketch states", "Write a post"]);
    expect(first.choices.some(choice => choice.taskId === foreign || choice.taskId === blockedByDependency)).toBe(false);
    await expect(t.query(api.tasks.todayOverview, { minutes: 15, energy: 1 })).rejects.toThrow("Sign in");

    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId: smallTask, smaller: true });
    const during = await asA.query(api.tasks.todayOverview, { minutes: 15, energy: 1 });
    expect(during.active).toMatchObject({ _id: activeSessionId, title: "Sketch states", doneWhen: "Three sketches exist", smaller: true });
    expect((await asB.query(api.tasks.todayOverview, { minutes: 15, energy: 1 })).active).toBeNull();
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Sketched the states", nextStep: "", evidence: "" });
    const after = await asA.query(api.tasks.todayOverview, { minutes: 15, energy: 1 });
    expect(after.active).toBeNull();
    expect(after.choices.map(choice => choice.title)).toEqual(["Write a post"]);
  });

  it("starts once per owner, then cancels without recording progress", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const firstTask = await asA.mutation(api.tasks.create, task);
    const secondTask = await asA.mutation(api.tasks.create, { ...task, title: "Other task" });

    await expect(t.mutation(api.tasks.startSession, { taskId: firstTask })).rejects.toThrow("Sign in");
    await expect(asB.mutation(api.tasks.startSession, { taskId: firstTask })).rejects.toThrow("Record not found");
    const activeId = await asA.mutation(api.tasks.startSession, { taskId: firstTask });
    expect(await asA.mutation(api.tasks.startSession, { taskId: firstTask })).toBe(activeId);
    await expect(asA.mutation(api.tasks.startSession, { taskId: secondTask })).rejects.toThrow("Finish or cancel");
    expect(await asB.query(api.tasks.getActiveSession, {})).toBeNull();
    expect(await asA.query(api.tasks.getActiveSession, {})).toMatchObject({ _id: activeId, taskId: firstTask });
    await expect(asB.mutation(api.tasks.cancelSession, { activeSessionId: activeId })).rejects.toThrow("Record not found");

    await asA.mutation(api.tasks.cancelSession, { activeSessionId: activeId });
    expect(await asA.query(api.tasks.getActiveSession, {})).toBeNull();
    const state = await t.run(async ctx => ({ task: await ctx.db.get(firstTask), sessions: await ctx.db.query("sessions").collect() }));
    expect(state.task?.status).toBe("Ready");
    expect(state.sessions).toHaveLength(0);
  });

  it("records a partial contribution once and keeps invalid input active", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const taskId = await asA.mutation(api.tasks.create, task);
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    const recap = { activeSessionId, outcome: "Made progress" as const, contribution: "Built the first pass", nextStep: "Test keyboard flow", evidence: "https://example.test/demo" };

    await expect(asA.mutation(api.tasks.recordSession, { ...recap, nextStep: "" })).rejects.toThrow("Add a next step");
    expect(await asA.query(api.tasks.getActiveSession, {})).toMatchObject({ _id: activeSessionId });
    await expect(asB.mutation(api.tasks.recordSession, recap)).rejects.toThrow("Record not found");

    const sessionId = await asA.mutation(api.tasks.recordSession, recap);
    expect(await asA.mutation(api.tasks.recordSession, recap)).toBe(sessionId);
    const state = await t.run(async ctx => ({
      task: await ctx.db.get(taskId),
      sessions: await ctx.db.query("sessions").collect(),
      artifacts: await ctx.db.query("artifacts").collect(),
    }));
    expect(state.task).toMatchObject({ status: "In progress", nextStep: "Test keyboard flow" });
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ _id: sessionId, taskId, contribution: "Built the first pass" });
    expect(state.sessions[0].startedAt).toEqual(expect.any(Number));
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0]).toMatchObject({ sessionId, url: "https://example.test/demo", status: "Draft" });
    expect(await asA.query(api.tasks.getActiveSession, {})).toBeNull();
  });

  it("finishes work and rejects a blocked task or unfinished prerequisite", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const prerequisite = await asA.mutation(api.tasks.create, task);
    const dependent = await asA.mutation(api.tasks.create, { ...task, title: "Dependent task" });
    await t.run(ctx => ctx.db.patch(dependent, { dependencies: [prerequisite] }));
    await expect(asA.mutation(api.tasks.startSession, { taskId: dependent })).rejects.toThrow("Complete the prerequisite");

    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId: prerequisite });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Finished the prerequisite", nextStep: "", evidence: "" });
    await expect(asA.mutation(api.tasks.startSession, { taskId: prerequisite })).rejects.toThrow("not ready");

    const nextActive = await asA.mutation(api.tasks.startSession, { taskId: dependent });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: nextActive, outcome: "Blocked", contribution: "Found an API blocker", nextStep: "Request access", evidence: "" });
    await expect(asA.mutation(api.tasks.startSession, { taskId: dependent })).rejects.toThrow("not ready");
  });

  it("snapshots smaller work, preserves a newly edited step, and never finishes the parent early", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const small = { smallerStep: "Sketch focus states", smallerDone: "Three states are documented", smallerMinutes: 15 };
    await expect(asA.mutation(api.tasks.create, { ...task, smallerStep: small.smallerStep })).rejects.toThrow("Complete all three");
    const taskId = await asA.mutation(api.tasks.create, { ...task, ...small });
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId, smaller: true });
    await expect(asA.mutation(api.tasks.startSession, { taskId, smaller: false })).rejects.toThrow("Finish or cancel");
    expect(await asA.query(api.tasks.getActiveSession, {})).toMatchObject({ smaller: true, focusTitle: small.smallerStep, focusDoneWhen: small.smallerDone, focusMinutes: 15 });

    const changed = { smallerStep: "Build keyboard flow", smallerDone: "Keyboard path works", smallerMinutes: 20 };
    await asA.mutation(api.tasks.update, { taskId, ...task, title: "Updated parent title", ...changed });
    const sessionId = await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Sketched the three states", nextStep: "", evidence: "" });
    const first = await t.run(async ctx => ({ task: await ctx.db.get(taskId), session: await ctx.db.get(sessionId) }));
    expect(first.task).toMatchObject({ status: "In progress", ...changed, nextStep: "Continue from your last recorded contribution." });
    expect(first.session).toMatchObject({ title: small.smallerStep, doneWhen: small.smallerDone, smaller: true });

    const secondActive = await asA.mutation(api.tasks.startSession, { taskId, smaller: true });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: secondActive, outcome: "Finished", contribution: "Built keyboard path", nextStep: "", evidence: "" });
    const after = await t.run(ctx => ctx.db.get(taskId));
    expect(after?.status).toBe("In progress");
    expect(after).not.toHaveProperty("smallerStep");
    expect(after).not.toHaveProperty("smallerDone");
    expect(after).not.toHaveProperty("smallerMinutes");
    await expect(asA.mutation(api.tasks.startSession, { taskId, smaller: true })).rejects.toThrow("Define a smaller step");
  });

  it("allows clearing a planned smaller step before a session starts", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, smallerStep: "Sketch", smallerDone: "Sketch exists", smallerMinutes: 15 });
    await asA.mutation(api.tasks.update, { taskId, ...task });
    const updated = await t.run(ctx => ctx.db.get(taskId));
    expect(updated).not.toHaveProperty("smallerStep");
    expect(updated).not.toHaveProperty("smallerDone");
    expect(updated).not.toHaveProperty("smallerMinutes");
  });
});
