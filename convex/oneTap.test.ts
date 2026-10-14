import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// PLAN-one-tap-and-daily-loop, Phase 1: moves without forms, Undo, quick add, edits in
// place, what a finish means, and deleting archived tasks.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { title: "Wire the endpoint", lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "Claude can call it" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
const kinds = (t: ReturnType<typeof setup>["t"], taskId: Id<"tasks">) =>
  t.run(async ctx => (await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", taskId)).collect()).map(e => e.kind));

/** A project with one phase holding two milestones: A (two tasks) and B (one task). */
async function plan(asA: ReturnType<typeof setup>["asA"]) {
  const { projectId, taskId: first } = await asA.mutation(api.projects.createWithFirstStep, { title: "P", purpose: "Why", step: { ...task, title: "Loose first step" } });
  const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundation", skills: ["Systems"] });
  const a = await asA.mutation(api.projects.addMilestone, { projectId, title: "A" });
  const b = await asA.mutation(api.projects.addMilestone, { projectId, title: "B" });
  await asA.mutation(api.constellation.setMilestonePhase, { milestoneId: a, phaseId });
  await asA.mutation(api.constellation.setMilestonePhase, { milestoneId: b, phaseId });
  const a1 = await asA.mutation(api.tasks.create, { ...task, title: "A1", projectId, milestoneId: a });
  const a2 = await asA.mutation(api.tasks.create, { ...task, title: "A2", projectId, milestoneId: a });
  const b1 = await asA.mutation(api.tasks.create, { ...task, title: "B1", projectId, milestoneId: b });
  return { projectId, phaseId, a, b, a1, a2, b1, first };
}

describe("one tap: moves, Undo and what a finish means", () => {
  it("undoes a finish exactly: status, dates, skills, pin and the milestone", async () => {
    const { t, asA } = setup();
    const { a, a1, a2 } = await plan(asA);
    await asA.mutation(api.tasks.setStatus, { taskId: a1, status: "Done" });
    await asA.mutation(api.tasks.pin, { taskId: a2 });
    const before = await t.run(ctx => ctx.db.get(a2));
    const move = await asA.mutation(api.tasks.setStatus, { taskId: a2, status: "Done", skills: ["Motion"] });
    expect(await t.run(ctx => ctx.db.get(a))).toMatchObject({ completedAt: expect.any(Number) });
    expect((await asA.query(api.settings.getProfile, {}))!.pinnedTaskId).toBeNull();

    expect(await asA.mutation(api.tasks.undo, { eventId: move.eventId! })).toEqual({ taskId: a2, status: "Ready" });
    const after = await t.run(ctx => ctx.db.get(a2));
    expect(after).toMatchObject({ status: "Ready", nextStep: before!.nextStep });
    expect(after!.completedAt).toBeUndefined();
    expect(after!.startedAt).toBeUndefined();
    expect(after!.skills).toBeUndefined();
    expect((await asA.query(api.settings.getProfile, {}))!.pinnedTaskId).toBe(a2);
    expect((await t.run(ctx => ctx.db.get(a)))!.completedAt).toBeUndefined();
    expect(await kinds(t, a2)).toEqual(["created"]);
  });

  it("refuses an Undo once the task has moved again, and other people's moves", async () => {
    const { asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const started = await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" });
    await expect(asB.mutation(api.tasks.undo, { eventId: started.eventId! })).rejects.toThrow("can't be found");
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked", note: "Waiting" });
    await expect(asA.mutation(api.tasks.undo, { eventId: started.eventId! })).rejects.toThrow("changed since");
  });

  it("undoes blocking, archiving and restoring", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.edit, { taskId, nextStep: "Read the docs" });
    const blocked = await asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked", note: "No key yet" });
    await asA.mutation(api.tasks.undo, { eventId: blocked.eventId! });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ status: "Ready", nextStep: "Read the docs" });

    const archived = await asA.mutation(api.tasks.archive, { taskId });
    await asA.mutation(api.tasks.undo, { eventId: archived.eventId! });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ status: "Ready" });
    const again = await asA.mutation(api.tasks.archive, { taskId });
    const restored = await asA.mutation(api.tasks.restore, { taskId });
    await asA.mutation(api.tasks.undo, { eventId: restored.eventId! });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ status: "Archived", archivedFrom: "Ready" });
    expect(again.eventId).not.toBeNull();
  });

  it("a finish reports its skills, the milestone's progress and what's next", async () => {
    const { asA } = setup();
    const { a, phaseId, a1, a2, b1 } = await plan(asA);
    const first = await asA.mutation(api.tasks.setStatus, { taskId: a1, status: "Done" });
    expect(first.finish).toMatchObject({
      skills: ["Systems"], milestone: { id: a, title: "A", done: 1, total: 2, completedNow: false },
      phase: { id: phaseId, name: "Foundation", completedNow: false }, next: { id: a2, title: "A2" },
    });
    // The milestone completes: the next one's first task is offered.
    const second = await asA.mutation(api.tasks.setStatus, { taskId: a2, status: "Done", skills: ["Motion"] });
    expect(second.finish).toMatchObject({ skills: ["Motion"], milestone: { done: 2, total: 2, completedNow: true }, next: { id: b1 } });
    const third = await asA.mutation(api.tasks.setStatus, { taskId: b1, status: "Done" });
    expect(third.finish).toMatchObject({ milestone: { completedNow: true }, phase: { completedNow: true }, next: null });
    // A loose task finishes with no milestone or phase.
    const loose = await asA.mutation(api.tasks.create, { ...task, lane: "Writing" });
    expect((await asA.mutation(api.tasks.setStatus, { taskId: loose, status: "Done" })).finish).toEqual({ skills: [], milestone: null, phase: null, next: null });
  });
});

describe("one tap: quick add, edits in place and deleting", () => {
  it("adds a task from a title, with defaults, and an Undo deletes it", async () => {
    const { t, asA } = setup();
    const { a, projectId } = await plan(asA);
    const added = await asA.mutation(api.tasks.quickAdd, { title: "  A3  ", milestoneId: a });
    expect(await t.run(ctx => ctx.db.get(added.taskId))).toMatchObject({ title: "A3", lane: "Projects", minutes: 30, energy: 2, doneWhen: "", projectId, milestoneId: a, status: "Ready" });
    await asA.mutation(api.tasks.undo, { eventId: added.eventId! });
    expect(await t.run(ctx => ctx.db.get(added.taskId))).toBeNull();

    await asA.mutation(api.settings.saveLaneFocus, { laneFocus: "Writing" });
    const loose = await asA.mutation(api.tasks.quickAdd, { title: "A note" });
    const looseTask = await t.run(ctx => ctx.db.get(loose.taskId));
    expect(looseTask).toMatchObject({ lane: "Writing" });
    expect(looseTask!.projectId).toBeUndefined();
    await expect(asA.mutation(api.tasks.quickAdd, { title: "   " })).rejects.toThrow();
  });

  it("edits one field at a time and validates it", async () => {
    const { t, asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.edit, { taskId, nextStep: "  Wire the retry  " });
    await asA.mutation(api.tasks.edit, { taskId, minutes: 90, skills: ["Systems", "systems"] });
    await asA.mutation(api.tasks.edit, { taskId, doneWhen: "" });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ title: task.title, nextStep: "Wire the retry", minutes: 90, energy: 2, skills: ["Systems"], doneWhen: "" });
    await expect(asA.mutation(api.tasks.edit, { taskId, minutes: 500 })).rejects.toThrow("5–240");
    await expect(asA.mutation(api.tasks.edit, { taskId, title: " " })).rejects.toThrow();
    await expect(asB.mutation(api.tasks.edit, { taskId, title: "Mine" })).rejects.toThrow();
  });

  it("unblocking without a note goes back to the next step from before the block", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.edit, { taskId, nextStep: "Wire the slider" });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked", note: "Waiting on the licence" });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ nextStep: "Waiting on the licence" });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Ready" });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ status: "Ready", nextStep: "Wire the slider" });
  });

  it("keeps free notes on a task, clears them when emptied, and backs them up", async () => {
    const { t, asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.quickAdd, { title: "Sketch the specimen" });
    await asA.mutation(api.tasks.edit, { taskId: taskId.taskId, notes: "  Try Recursive first.\nThen Inter.  " });
    expect(await asA.query(api.tasks.get, { taskId: taskId.taskId })).toMatchObject({ notes: "Try Recursive first.\nThen Inter.", doneWhen: "" });
    await expect(asA.mutation(api.tasks.edit, { taskId: taskId.taskId, notes: "x".repeat(10001) })).rejects.toThrow("10,000");
    // A backup with notes and an empty done-when restores into another account.
    const backup = await asA.query(api.data.exportAll, {});
    await asB.mutation(api.data.importBackup, { backup });
    expect((await asB.query(api.data.exportAll, {})).tasks[0]).toMatchObject({ notes: "Try Recursive first.\nThen Inter.", doneWhen: "" });
    await asA.mutation(api.tasks.edit, { taskId: taskId.taskId, notes: "" });
    expect((await t.run(ctx => ctx.db.get(taskId.taskId)))!.notes).toBeUndefined();
  });

  it("adds a note to a move afterwards; a blocker becomes the next step", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const blocked = await asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked" });
    await asA.mutation(api.tasks.noteOn, { eventId: blocked.eventId!, note: "Waiting on the key" });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ nextStep: "Waiting on the key" });
    expect(await t.run(ctx => ctx.db.get(blocked.eventId!))).toMatchObject({ note: "Waiting on the key" });
  });

  it("won't start a task whose project is done, and records a new project's first task", async () => {
    const { t, asA } = setup();
    const { projectId, taskId } = await asA.mutation(api.projects.createWithFirstStep, { title: "P", purpose: "Why", step: { ...task, doneWhen: "" } });
    expect(await kinds(t, taskId)).toEqual(["created"]);
    await asA.mutation(api.projects.setStatus, { projectId, status: "Done" });
    await expect(asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" })).rejects.toThrow("Make the project active");
  });

  it("deletes only archived tasks, with their history, and unlinks them elsewhere", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const waiting = await asA.mutation(api.tasks.create, { ...task, title: "Later", dependencies: [taskId] });
    await asA.mutation(api.tasks.pin, { taskId });
    await expect(asA.mutation(api.tasks.remove, { taskId })).rejects.toThrow("Archive the task first");
    await asA.mutation(api.tasks.archive, { taskId });
    await asA.mutation(api.tasks.remove, { taskId });
    expect(await t.run(ctx => ctx.db.get(taskId))).toBeNull();
    expect(await kinds(t, taskId)).toEqual([]);
    expect((await t.run(ctx => ctx.db.get(waiting)))!.dependencies).toEqual([]);
  });
});
