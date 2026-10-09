import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { title: "Wire the endpoint", lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "Claude can call it" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
const events = (t: ReturnType<typeof setup>["t"], taskId: Id<"tasks">) =>
  t.run(async ctx => (await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", taskId)).collect()).map(e => [e.kind, e.note ?? null, e.source]));

describe("moving tasks freely (no timer)", () => {
  it("starts, blocks, unblocks, finishes and reopens, recording each move", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" });
    const started = await asA.query(api.tasks.get, { taskId });
    expect(started).toMatchObject({ status: "In progress", completedAt: null });
    expect(started!.startedAt).toBeTypeOf("number");

    await expect(asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked" })).rejects.toThrow("blocking");
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Blocked", note: "Waiting on the API key" });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "Blocked", nextStep: "Waiting on the API key" });

    await expect(asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" })).rejects.toThrow("next step");
    await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress", note: "Wire the token check" });

    await asA.mutation(api.tasks.setStatus, { taskId, status: "Done", note: "Shipped it.", skills: ["Systems", "systems", "Shipping"] });
    const done = await asA.query(api.tasks.get, { taskId });
    expect(done).toMatchObject({ status: "Done", skills: ["Systems", "Shipping"] });
    expect(done!.completedAt).toBeTypeOf("number");

    await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress", note: "One more edge case" });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "In progress", completedAt: null, startedAt: started!.startedAt });

    expect(await events(t, taskId)).toEqual([
      ["created", null, "app"], ["started", null, "app"], ["blocked", "Waiting on the API key", "app"],
      ["unblocked", "Wire the token check", "app"], ["done", "Shipped it.", "app"], ["reopened", "One more edge case", "app"],
    ]);
  });

  it("refuses archived tasks, a task with a running focus session, and other people's tasks", async () => {
    const { asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await expect(asB.mutation(api.tasks.setStatus, { taskId, status: "Done" })).rejects.toThrow();
    await asA.mutation(api.tasks.startSession, { taskId });
    await expect(asA.mutation(api.tasks.setStatus, { taskId, status: "Done" })).rejects.toThrow("focus session");
    const other = await asA.mutation(api.tasks.create, { ...task, title: "Other" });
    await asA.mutation(api.tasks.archive, { taskId: other });
    await expect(asA.mutation(api.tasks.setStatus, { taskId: other, status: "In progress" })).rejects.toThrow("Restore");
  });

  it("finishing clears the pin and completes the milestone", async () => {
    const { asA } = setup();
    const { projectId } = await asA.mutation(api.projects.createWithFirstStep, { title: "P", purpose: "Why", step: { ...task } });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, title: "Last step", projectId, milestoneId });
    await asA.mutation(api.tasks.pin, { taskId });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Done" });
    expect((await asA.query(api.settings.getProfile, {}))!.pinnedTaskId).toBeNull();
    const project = await asA.query(api.projects.get, { projectId });
    expect(project!.milestones[0].completedAt).toBeTypeOf("number");
  });

  it("a finished task grows the bloom once per skill, without double-counting its sessions", async () => {
    const { asA } = setup();
    const since = Date.now() - 1000;
    const focused = await asA.mutation(api.tasks.create, task);
    const active = await asA.mutation(api.tasks.startSession, { taskId: focused });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: active, outcome: "Made progress", contribution: "Half.", nextStep: "Rest.", evidence: "", skills: ["Systems"] });
    await asA.mutation(api.tasks.setStatus, { taskId: focused, status: "Done", skills: ["Systems", "Shipping"] });
    const plain = await asA.mutation(api.tasks.create, { ...task, title: "No timer", lane: "Writing" });
    await asA.mutation(api.tasks.setStatus, { taskId: plain, status: "Done", skills: ["Writing"] });

    const bloom = await asA.query(api.journey.bloom, { since });
    const count = (name: string) => bloom.petals.find(petal => petal.name === name)!.sessions;
    expect([count("Systems"), count("Shipping"), count("Writing")]).toEqual([1, 1, 1]);
    expect(bloom).toMatchObject({ sessions: 1, finished: 2 });
  });

  it("deleting workspace data removes the history too", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" });
    let done = false;
    while (!done) done = (await asA.mutation(api.data.deleteBatch, {})).done;
    expect(await t.run(ctx => ctx.db.query("taskEvents").collect())).toEqual([]);
  });
});
