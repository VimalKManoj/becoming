import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("cloud Ideas", () => {
  it("keeps notes private and creates only one linked Ready task on activation retry", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const ideaId = await asA.mutation(api.ideas.create, { title: "  Motion study  ", lane: "Showcases", notes: "Try a quiet hover." });

    await expect(t.query(api.ideas.listPage, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow("Sign in");
    const page = await asA.query(api.ideas.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page[0]).toMatchObject({ title: "Motion study", notes: "Try a quiet hover." });
    expect(page.page[0]).not.toHaveProperty("owner");
    expect((await asB.query(api.ideas.listPage, { paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([]);
    await expect(asB.mutation(api.ideas.updateNotes, { ideaId, notes: "Foreign edit" })).rejects.toThrow("Record not found");
    await asA.mutation(api.ideas.updateNotes, { ideaId, notes: "Prototype timing and reduced motion." });

    const activation = { ideaId, title: "Build motion study", minutes: 30, energy: 2, doneWhen: "A keyboard-friendly demo runs." };
    await expect(asB.mutation(api.ideas.activate, activation)).rejects.toThrow("Record not found");
    await expect(asA.mutation(api.ideas.activate, { ...activation, minutes: 0 })).rejects.toThrow("Choose 5–240");
    const taskId = await asA.mutation(api.ideas.activate, activation);
    expect(await asA.mutation(api.ideas.activate, activation)).toBe(taskId);
    const state = await t.run(async ctx => ({ idea: await ctx.db.get(ideaId), task: await ctx.db.get(taskId), tasks: await ctx.db.query("tasks").collect() }));
    expect(state.idea).toMatchObject({ taskId, notes: "Prototype timing and reduced motion." });
    expect(state.task).toMatchObject({ ideaId, lane: "Showcases", status: "Ready", title: "Build motion study" });
    expect(state.tasks).toHaveLength(1);
  });

  it("archives and restores an idea without losing its notes, and won't activate it while archived", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const ideaId = await asA.mutation(api.ideas.create, { title: "Reading corner", lane: "Projects", notes: "Calm typography." });
    const view = (name: "notebook" | "archived") => asA.query(api.ideas.listPage, { view: name, paginationOpts: { numItems: 10, cursor: null } }).then(result => result.page.map(idea => idea.title));

    await expect(asB.mutation(api.ideas.archive, { ideaId })).rejects.toThrow("Record not found");
    await asA.mutation(api.ideas.archive, { ideaId });
    await asA.mutation(api.ideas.archive, { ideaId });
    expect(await view("notebook")).toEqual([]);
    expect(await view("archived")).toEqual(["Reading corner"]);
    await expect(asA.mutation(api.ideas.activate, { ideaId, title: "Explore it", minutes: 30, energy: 2, doneWhen: "A sketch exists" })).rejects.toThrow("Restore this idea");
    expect(await t.run(ctx => ctx.db.query("tasks").collect())).toHaveLength(0);

    await expect(asB.mutation(api.ideas.restore, { ideaId })).rejects.toThrow("Record not found");
    await asA.mutation(api.ideas.restore, { ideaId });
    expect(await view("notebook")).toEqual(["Reading corner"]);
    expect(await view("archived")).toEqual([]);
    const restored = await t.run(ctx => ctx.db.get(ideaId));
    expect(restored).toMatchObject({ notes: "Calm typography." });
    expect(restored).not.toHaveProperty("archivedAt");
  });

  it("reads one idea by a link's id, and activates into a chosen lane", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const ideaId = await asA.mutation(api.ideas.create, { title: "Type specimen", lane: "Projects", notes: "Pasted brief." });

    await expect(t.query(api.ideas.get, { ideaId })).rejects.toThrow("Sign in");
    expect(await asA.query(api.ideas.get, { ideaId })).toMatchObject({ _id: ideaId, title: "Type specimen", stage: "Captured", task: null, brainstorm: {} });
    expect(await asA.query(api.ideas.get, { ideaId })).not.toHaveProperty("owner");
    expect(await asB.query(api.ideas.get, { ideaId })).toBeNull();
    expect(await asA.query(api.ideas.get, { ideaId: "not-an-id" })).toBeNull();

    const taskId = await asA.mutation(api.ideas.activate, { ideaId, title: "Two-axis waterfall", minutes: 20, energy: 2, doneWhen: "It scrubs smoothly.", lane: "Writing" });
    expect(await t.run(ctx => ctx.db.get(taskId))).toMatchObject({ lane: "Writing", ideaId, status: "Ready" });
    expect(await asA.query(api.ideas.get, { ideaId })).toMatchObject({ lane: "Writing", stage: "Active", task: { title: "Two-axis waterfall", status: "Ready" } });
  });
});
