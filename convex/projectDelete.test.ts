import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const ownerA = `${issuer}|user-a`;
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}

const session = (taskId: Id<"tasks">, projectId: Id<"projects"> | undefined, key: string) => ({
  owner: ownerA, taskId, key, lane: "Projects" as const, title: "Worked", outcome: "Made progress" as const,
  contribution: "Some", nextStep: "More", evidence: "", endedAt: Date.now(), ...(projectId ? { projectId } : {}),
});

describe("deleting a project", () => {
  it("removes the project and everything that only exists because of it, and unlinks the rest", async () => {
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const otherId = await asA.mutation(api.projects.create, { title: "Other", purpose: "Keep" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "PRD", title: "Product", phaseIds: [phaseId] });
    const first = await asA.mutation(api.tasks.create, { ...task, title: "First", milestoneId });
    const second = await asA.mutation(api.tasks.create, { ...task, title: "Second", projectId });
    const kept = await asA.mutation(api.tasks.create, { ...task, title: "Kept", projectId: otherId });

    const ids = await t.run(async ctx => {
      // A task elsewhere that waits on one of ours, and one that moved out but kept a session here.
      await ctx.db.patch(kept, { dependencies: [first] });
      const moved = await ctx.db.insert("tasks", { owner: ownerA, ...task, title: "Moved", status: "Ready", nextStep: "", dependencies: [], projectId: otherId });
      const movedSession = await ctx.db.insert("sessions", session(moved, projectId, "moved"));
      const ourSession = await ctx.db.insert("sessions", session(first, projectId, "ours"));
      const imageId = await ctx.storage.store(new Blob(["png"]));
      await ctx.db.insert("artifacts", { owner: ownerA, sessionId: ourSession, title: "Shot", url: "https://example.test", status: "Draft", portfolioCandidate: false, imageId });
      const ideaId = await ctx.db.insert("ideas", { owner: ownerA, title: "Idea", notes: "", lane: "Projects", taskId: first });
      await ctx.db.insert("weekPlans", { owner: ownerA, week: "2026-W41", intention: "Ship", taskIds: [first, kept] });
      await ctx.db.insert("profiles", { owner: ownerA, motive: "Grow", pinnedTaskId: second });
      await ctx.db.insert("inbox", { owner: ownerA, source: "Claude Code", proposal: { kind: "nextStep", taskId: first, nextStep: "Go" } });
      await ctx.db.insert("inbox", { owner: ownerA, source: "Claude Code", proposal: { kind: "task", ...task, title: "Unrelated" } });
      return { movedSession, ideaId, imageId };
    });

    expect(await asB.query(api.projects.deletePreview, { projectId })).toBeNull();
    await expect(asB.mutation(api.projects.remove, { projectId })).rejects.toThrow("not found");
    expect(await asA.query(api.projects.deletePreview, { projectId })).toEqual({ title: "Becoming", tasks: 2, sessions: 1, evidence: 1, milestones: 1, phases: 1, docs: 1, running: false });

    expect(await asA.mutation(api.projects.remove, { projectId })).toEqual({ tasks: 2, sessions: 1 });

    const after = await t.run(async ctx => ({
      project: await ctx.db.get(projectId),
      tasks: (await ctx.db.query("tasks").collect()).map(row => [row.title, row.dependencies.length]),
      sessions: (await ctx.db.query("sessions").collect()).map(row => [row.key, row.projectId ?? null]),
      artifacts: await ctx.db.query("artifacts").collect(),
      image: await ctx.storage.get(ids.imageId),
      events: (await ctx.db.query("taskEvents").collect()).filter(row => row.taskId === first || row.taskId === second),
      rest: [...await ctx.db.query("milestones").collect(), ...await ctx.db.query("phases").collect(), ...await ctx.db.query("projectDocs").collect()],
      idea: await ctx.db.get(ids.ideaId),
      plan: (await ctx.db.query("weekPlans").collect())[0].taskIds,
      pinned: (await ctx.db.query("profiles").collect())[0].pinnedTaskId,
      inbox: (await ctx.db.query("inbox").collect()).map(row => row.proposal.kind),
    }));
    expect(after.project).toBeNull();
    expect(after.tasks).toEqual([["Kept", 0], ["Moved", 0]]);
    expect(after.sessions).toEqual([["moved", null]]);
    expect(after.artifacts).toEqual([]);
    expect(after.image).toBeNull();
    expect(after.events).toEqual([]);
    expect(after.rest).toEqual([]);
    expect(after.idea).toMatchObject({ title: "Idea" });
    expect(after.idea?.taskId).toBeUndefined();
    expect(after.plan).toEqual([kept]);
    expect(after.pinned).toBeUndefined();
    expect(after.inbox).toEqual(["task"]);
    expect((await asA.query(api.projects.list, {})).map(p => p.title)).toEqual(["Other"]);
  });

  it("archiving puts the open tasks away with the project, and making it active brings back exactly those", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const otherId = await asA.mutation(api.projects.create, { title: "Other", purpose: "Keep" });
    const make = (title: string) => asA.mutation(api.tasks.create, { ...task, title, projectId });
    const [ready, doing, blocked, done, own] = [await make("Ready"), await make("Doing"), await make("Blocked"), await make("Done"), await make("Own")];
    const waiting = await asA.mutation(api.tasks.create, { ...task, title: "Waiting", projectId: otherId });
    await t.run(async ctx => {
      await ctx.db.patch(doing, { status: "In progress" });
      await ctx.db.patch(blocked, { status: "Blocked", nextStep: "Needs a key" });
      await ctx.db.patch(done, { status: "Done" });
      await ctx.db.patch(waiting, { dependencies: [ready] });
      await ctx.db.insert("profiles", { owner: ownerA, motive: "Grow", pinnedTaskId: ready });
    });
    await asA.mutation(api.tasks.archive, { taskId: own });
    const statuses = () => t.run(async ctx => Object.fromEntries((await ctx.db.query("tasks").collect()).map(row => [row.title, [row.status, row.archivedFrom ?? null, row.archivedWithProject ?? false]])));

    await asA.mutation(api.projects.setStatus, { projectId, status: "Archived" });
    expect(await statuses()).toMatchObject({
      Ready: ["Archived", "Ready", true], Doing: ["Archived", "In progress", true], Blocked: ["Archived", "Blocked", true],
      Done: ["Done", null, false], Own: ["Archived", "Ready", false], Waiting: ["Ready", null, false],
    });
    expect((await t.run(ctx => ctx.db.query("profiles").collect()))[0].pinnedTaskId).toBeUndefined();
    // With its prerequisite archived, the task in the other project can reach Today again.
    expect((await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 2 })).choices.map(choice => choice.title)).toContain("Waiting");

    await asA.mutation(api.projects.setStatus, { projectId, status: "Active" });
    expect(await statuses()).toMatchObject({
      Ready: ["Ready", null, false], Doing: ["In progress", null, false], Blocked: ["Blocked", null, false],
      Done: ["Done", null, false], Own: ["Archived", "Ready", false],
    });
    const events = await t.run(async ctx => (await ctx.db.query("taskEvents").collect()).filter(e => e.taskId === ready).map(e => [e.kind, e.note ?? null]));
    expect(events).toEqual([["created", null], ["archived", "With its project"], ["restored", "With its project"]]);
  });

  it("waits for a running focus session on one of its tasks", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, projectId });
    await t.run(ctx => ctx.db.insert("activeSessions", { owner: ownerA, taskId, startedAt: Date.now() }));
    expect(await asA.query(api.projects.deletePreview, { projectId })).toMatchObject({ running: true });
    await expect(asA.mutation(api.projects.remove, { projectId })).rejects.toThrow("Finish or cancel");
    expect(await t.run(ctx => ctx.db.get(projectId))).not.toBeNull();
  });
});
