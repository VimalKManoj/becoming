import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("brainstorming, activation choices and moving back", () => {
  it("derives the stage and validates structured brainstorm fields", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const ideaId = await asA.mutation(api.ideas.create, { title: "Reading corner", lane: "Projects", notes: "Pasted assignment" });
    const first = async () => (await asA.query(api.ideas.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page[0];
    expect((await first()).stage).toBe("Captured");
    const update = { ideaId, title: "Reading corner", lane: "Showcases" as const, notes: "Pasted assignment" };
    await expect(asA.mutation(api.ideas.update, { ...update, brainstorm: { references: ["javascript:alert(1)"] } })).rejects.toThrow("HTTP or HTTPS");
    await expect(asA.mutation(api.ideas.update, { ...update, brainstorm: { references: Array.from({ length: 11 }, (_, i) => `https://example.test/${i}`) } })).rejects.toThrow("up to 10 references");
    await asA.mutation(api.ideas.update, { ...update, brainstorm: { problem: " Saved articles get lost. ", smallestBuild: "One list with progress", skills: ["Typography", "typography "], references: ["https://example.test/ref"] } });
    expect(await first()).toMatchObject({ lane: "Showcases", stage: "Brainstorming", brainstorm: { problem: "Saved articles get lost.", smallestBuild: "One list with progress", skills: ["Typography", "typography"], references: ["https://example.test/ref"] } });
    // Clearing every structured field returns the idea to Captured.
    await asA.mutation(api.ideas.update, { ...update, brainstorm: { problem: "  ", skills: [] } });
    expect((await first()).stage).toBe("Captured");
  });

  it("activates into an existing project's milestone with a smaller step, or starts a new project", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const firstIdea = await asA.mutation(api.ideas.create, { title: "Focus card", lane: "Projects", notes: "" });
    const step = { title: "Sketch the card", minutes: 60, energy: 2, doneWhen: "Three states", smallerStep: "Sketch one state", smallerDone: "One sketch", smallerMinutes: 15 };
    await expect(asA.mutation(api.ideas.activate, { ideaId: firstIdea, ...step, newProject: true, projectId })).rejects.toThrow("not both");
    const taskId = await asA.mutation(api.ideas.activate, { ideaId: firstIdea, ...step, milestoneId });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ ideaId: firstIdea, projectId, milestoneId, smallerStep: "Sketch one state", smallerMinutes: 15, status: "Ready" });
    // The notebook card names what the idea became.
    const listed = (await asA.query(api.ideas.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page.find(idea => idea._id === firstIdea);
    expect(listed).toMatchObject({ stage: "Active", task: { title: "Sketch the card", status: "Ready" } });

    const secondIdea = await asA.mutation(api.ideas.create, { title: "Reading corner", lane: "Writing", notes: "Calm home for articles" });
    await asA.mutation(api.ideas.update, { ideaId: secondIdea, title: "Reading corner", lane: "Writing", notes: "Calm home for articles", brainstorm: { problem: "Saved articles get lost." } });
    const newTask = await asA.mutation(api.ideas.activate, { ideaId: secondIdea, title: "Outline it", minutes: 30, energy: 1, doneWhen: "An outline", newProject: true });
    const created = await t.run(async ctx => ctx.db.get((await ctx.db.get(newTask))!.projectId!));
    expect(created).toMatchObject({ title: "Reading corner", purpose: "Saved articles get lost.", status: "Active", ideaId: secondIdea });
  });

  it("moves an active idea back, archiving open work but not finished work", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const ideaId = await asA.mutation(api.ideas.create, { title: "Motion study", lane: "Showcases", notes: "" });
    const activation = { title: "Prototype timing", minutes: 30, energy: 2, doneWhen: "A demo" };
    const taskId = await asA.mutation(api.ideas.activate, { ideaId, ...activation });
    await asA.mutation(api.tasks.pin, { taskId });
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    await expect(asA.mutation(api.ideas.deactivate, { ideaId })).rejects.toThrow("Finish or cancel");
    await asA.mutation(api.tasks.cancelSession, { activeSessionId });
    await asA.mutation(api.ideas.deactivate, { ideaId });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ status: "Archived", archivedFrom: "Ready", ideaId });
    expect(await t.run(ctx => ctx.db.get(ideaId))).not.toHaveProperty("taskId");
    // The task left active work, so it no longer holds the pin.
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ pinnedTaskId: null });
    expect((await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 3 })).choices).toEqual([]);

    const again = await asA.mutation(api.ideas.activate, { ideaId, ...activation, title: "Prototype easing" });
    expect(again).not.toBe(taskId);
    const session = await asA.mutation(api.tasks.startSession, { taskId: again });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: session, outcome: "Finished", contribution: "Easing done", nextStep: "", evidence: "" });
    await asA.mutation(api.ideas.deactivate, { ideaId });
    expect(await t.run(ctx => ctx.db.get(again))).toMatchObject({ status: "Done" });
  });
});
