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
});
