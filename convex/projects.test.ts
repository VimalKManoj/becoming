import { convexTest, type TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Owner = TestConvexForDataModel<DataModel>;
const task = { title: "Build the focus card", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It renders" };

async function finish(who: Owner, taskId: Id<"tasks">, contribution = "Finished it") {
  const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
  return who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution, nextStep: "", evidence: "" });
}

describe("projects and milestones", () => {
  it("creates, edits and lists private projects with derived progress", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await expect(asA.mutation(api.projects.create, { title: " ", purpose: "Why" })).rejects.toThrow("Enter between");
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "A practice worth building", outcome: "A usable Today flow" });
    await expect(asB.mutation(api.projects.update, { projectId, title: "Stolen", purpose: "No" })).rejects.toThrow("Record not found");
    expect(await asB.query(api.projects.get, { projectId })).toBeNull();
    const done = await asA.mutation(api.tasks.create, { ...task, projectId });
    await asA.mutation(api.tasks.create, { ...task, title: "Second", projectId });
    const archived = await asA.mutation(api.tasks.create, { ...task, title: "Dropped", projectId });
    await finish(asA, done);
    await asA.mutation(api.tasks.archive, { taskId: archived });
    const [listed] = await asA.query(api.projects.list, {});
    expect(listed).toMatchObject({ title: "Becoming", outcome: "A usable Today flow", status: "Active", progress: { done: 1, total: 2 } });
    expect(await asB.query(api.projects.list, {})).toEqual([]);
  });

  it("names the same next step and lane on the project's page as on its card", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    expect(await asA.query(api.projects.get, { projectId })).toMatchObject({ nextTask: null, lane: null, lastWorkedAt: null });
    await asA.mutation(api.tasks.create, { ...task, title: "Oldest ready", lane: "Writing", projectId, energy: 3, smallerStep: "Outline", smallerDone: "Three points", smallerMinutes: 15 });
    await asA.mutation(api.tasks.create, { ...task, title: "Newer ready", projectId });
    const detail = await asA.query(api.projects.get, { projectId });
    expect(detail).toMatchObject({ lane: "Writing", nextTask: { title: "Oldest ready", minutes: 30, energy: 3, smallerMinutes: 15 } });
    const [card] = await asA.query(api.projects.list, {});
    expect(card.nextTask).toEqual(detail!.nextTask);
  });

  it("orders, moves and removes milestones without leaving dangling task links", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const first = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const second = await asA.mutation(api.projects.addMilestone, { projectId, title: "Weekly rhythm", doneWhen: "Streaks show" });
    await asA.mutation(api.projects.moveMilestone, { milestoneId: second, direction: "up" });
    expect((await asA.query(api.projects.get, { projectId }))!.milestones.map(m => m.title)).toEqual(["Weekly rhythm", "Usable Today"]);
    await asA.mutation(api.projects.moveMilestone, { milestoneId: second, direction: "up" });
    expect((await asA.query(api.projects.get, { projectId }))!.milestones.map(m => m.title)).toEqual(["Weekly rhythm", "Usable Today"]);

    const taskId = await asA.mutation(api.tasks.create, { ...task, milestoneId: first });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ projectId, milestoneId: first });
    await asA.mutation(api.projects.removeMilestone, { milestoneId: first });
    const unlinked = await t.run(ctx => ctx.db.get(taskId));
    expect(unlinked).toMatchObject({ projectId });
    expect(unlinked).not.toHaveProperty("milestoneId");
    expect((await asA.query(api.projects.get, { projectId }))!.unassigned.map(item => item._id)).toEqual([taskId]);
  });

  it("validates task links and keeps an existing link to a finished project", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const otherProject = await asA.mutation(api.projects.create, { title: "Other", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const foreign = await asB.mutation(api.projects.create, { title: "Private", purpose: "B" });
    await expect(asA.mutation(api.tasks.create, { ...task, projectId: foreign })).rejects.toThrow("Record not found");
    await expect(asA.mutation(api.tasks.create, { ...task, projectId: otherProject, milestoneId })).rejects.toThrow("different project");
    const taskId = await asA.mutation(api.tasks.create, { ...task, projectId });
    await asA.mutation(api.projects.setStatus, { projectId, status: "Archived" });
    await expect(asA.mutation(api.tasks.create, { ...task, projectId })).rejects.toThrow("active project");
    await asA.mutation(api.tasks.update, { taskId, ...task, title: "Renamed while archived", projectId });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ title: "Renamed while archived", projectId });
  });

  it("completes a milestone when every linked task is done, and reopens it with new work", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const completedAt = async () => (await t.run(ctx => ctx.db.get(milestoneId)))?.completedAt;
    const one = await asA.mutation(api.tasks.create, { ...task, milestoneId });
    const two = await asA.mutation(api.tasks.create, { ...task, title: "Two", milestoneId });
    await finish(asA, one);
    expect(await completedAt()).toBeUndefined();
    const dropped = await asA.mutation(api.tasks.create, { ...task, title: "Dropped", milestoneId });
    await asA.mutation(api.tasks.archive, { taskId: dropped });
    await finish(asA, two);
    expect(await completedAt()).toEqual(expect.any(Number));
    await asA.mutation(api.tasks.reopen, { taskId: two, nextStep: "Fix the focus ring" });
    expect(await completedAt()).toBeUndefined();
    await finish(asA, two);
    expect(await completedAt()).toEqual(expect.any(Number));
    await asA.mutation(api.tasks.create, { ...task, title: "Late addition", milestoneId });
    expect(await completedAt()).toBeUndefined();
  });

  it("keeps Done and Archived projects out of Today and protects an active session", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, milestoneId });
    const today = () => asA.query(api.tasks.todayOverview, { minutes: 60, energy: 3 });
    expect((await today()).choices[0]).toMatchObject({ taskId, projectTitle: "Becoming", milestoneTitle: "Usable Today" });

    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    await expect(asA.mutation(api.projects.setStatus, { projectId, status: "Done" })).rejects.toThrow("Finish or cancel");
    await asA.mutation(api.tasks.cancelSession, { activeSessionId });
    await asA.mutation(api.projects.setStatus, { projectId, status: "Done" });
    expect(await today()).toMatchObject({ choices: [], state: "nothing-open" });
    await expect(asA.mutation(api.tasks.startSession, { taskId })).rejects.toThrow("done or archived");
    await asA.mutation(api.projects.setStatus, { projectId, status: "Active" });
    expect((await today()).choices.map(choice => choice.taskId)).toEqual([taskId]);
  });

  it("assembles case-study data from snapshot and older sessions, privately", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice", outcome: "Usable app" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, projectId });
    const sessionId = await finish(asA, taskId, "Built the card");
    expect(await t.run(ctx => ctx.db.get(sessionId))).toMatchObject({ projectId });
    // A session saved before project snapshots existed is found through its task.
    await t.run(ctx => ctx.db.insert("sessions", { owner: "https://auth.example.test|user-a", taskId, key: "older", lane: "Projects", title: "Sketch", outcome: "Made progress", contribution: "Sketched states", nextStep: "Build", evidence: "", endedAt: 1 }));
    await asA.mutation(api.proof.addToSession, { sessionId, url: "https://example.test/demo", title: "Card demo" });
    const data = await asA.query(api.projects.caseStudy, { projectId });
    expect(data!.sessions.map(s => s.contribution)).toEqual(["Sketched states", "Built the card"]);
    expect(data!.evidence).toMatchObject([{ title: "Card demo", url: "https://example.test/demo", status: "Draft" }]);
    expect(await asB.query(api.projects.caseStudy, { projectId })).toBeNull();
  });
});
