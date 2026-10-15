import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// PLAN-one-tap-and-daily-loop, Phase 2: the app records itself. An assistant's everyday work
// applies at once (by the token's trust), plan changes wait, and a move can be undone.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { title: "Wire the endpoint", lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "Claude can call it" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
type T = ReturnType<typeof setup>["t"];

async function mcp(t: T, token: string, method: string, params: Record<string, unknown> = {}) {
  const response = await t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return response.json();
}
async function call(t: T, token: string, name: string, args: Record<string, unknown>) {
  const body = await mcp(t, token, "tools/call", { name, arguments: args });
  return { error: body.result.isError ? body.result.content[0].text as string : null, data: body.result.isError ? null : JSON.parse(body.result.content[0].text) };
}

describe("assistants record the work themselves", () => {
  it("applies everyday work at once by default, from start to finish, and the user can undo it", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    expect((await asA.query(api.assistants.tokens, {}))[0].trust).toBe("work");

    const started = await call(t, token, "start_task", { task: "wire" });
    expect(started.data).toMatchObject({ status: "applied", taskId });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "In progress" });
    // The task's history offers Undo on the assistant's move, the latest one, and only there.
    const story = (await asA.query(api.constellation.taskStory, { taskId }))!;
    expect(story.map(e => [e.kind, e.source, e.undoable])).toEqual([["created", "app", false], ["started", "Claude Code", true]]);

    await call(t, token, "update_task", { task: taskId, next_step: "Add the retry", notes: "Use exponential backoff" });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ nextStep: "Add the retry", notes: "Use exponential backoff" });
    expect((await call(t, token, "update_task", { task: taskId })).error).toContain("at least one field");

    const done = await call(t, token, "complete_task", { task: taskId, summary: "Endpoint live.", skills: ["Systems"], evidence_url: "https://github.com/x/pr/1" });
    expect(done.data.status).toBe("applied");
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "Done", skills: ["Systems"] });
    const events = await t.run(ctx => ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", taskId)).collect());
    const doneEvent = events.find(e => e.kind === "done")!;
    expect(doneEvent).toMatchObject({ source: "Claude Code", note: "Endpoint live.\nhttps://github.com/x/pr/1" });
    expect(await asA.query(api.inbox.list, {})).toEqual([]);

    // The user can undo the assistant's finish from the task's history.
    await asA.mutation(api.tasks.undo, { eventId: doneEvent._id });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "In progress" });
  });

  it("blocks a task, and finishing with real minutes also logs the work with its evidence", async () => {
    const { t, asA } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    await call(t, token, "block_task", { task: taskId, reason: "Waiting on the API key" });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "Blocked", nextStep: "Waiting on the API key" });
    expect((await call(t, token, "complete_task", { task: taskId, minutes: 30, summary: "Done" })).error).toContain("blocked");
    await call(t, token, "start_task", { task: taskId });
    expect((await call(t, token, "complete_task", { task: taskId, minutes: 30 })).error).toContain("summary");
    await call(t, token, "complete_task", { task: taskId, minutes: 40, summary: "Shipped it.", evidence_url: "https://example.test/demo", skills: ["Shipping"] });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "Done" });
    const sessions = await t.run(ctx => ctx.db.query("sessions").collect());
    expect(sessions).toEqual([expect.objectContaining({ taskId, outcome: "Finished", contribution: "Shipped it.", source: "Claude Code" })]);
    expect(await t.run(ctx => ctx.db.query("artifacts").collect())).toEqual([expect.objectContaining({ url: "https://example.test/demo", status: "Draft" })]);
  });

  it("keeps plan changes for approval at the default trust, and applies them when trusted with all", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    expect((await call(t, token, "add_phase", { project: "Becoming", name: "Foundations" })).data.status).toBe("waiting for approval");
    const [row] = await asA.query(api.assistants.tokens, {});
    await asA.mutation(api.assistants.setTrust, { tokenId: row._id, trust: "all" });
    expect((await call(t, token, "add_phase", { project: "Becoming", name: "Reliability" })).data.status).toBe("applied");
    expect((await asA.query(api.constellation.get, { projectId }))!.phases.map(p => p.name)).toEqual(["Reliability"]);
  });

  it("asks first for everything when trusted to ask, and approval applies the move", async () => {
    const { t, asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const token = await asA.action(api.assistants.createToken, { name: "Claude", trust: "ask" });
    const [row] = await asA.query(api.assistants.tokens, {});
    await expect(asB.mutation(api.assistants.setTrust, { tokenId: row._id, trust: "all" })).rejects.toThrow();
    expect((await call(t, token, "start_task", { task: taskId })).data.status).toBe("waiting for approval");
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "Ready" });
    const [item] = await asA.query(api.inbox.list, {});
    expect(item).toMatchObject({ kind: "move", title: task.title, details: ["Start it"] });
    await asA.mutation(api.inbox.approve, { itemId: item._id });
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "In progress" });
  });

  it("reads one task with its plan and docs, and the recent activity", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations", goal: "An app you own" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Scaffold" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "PRD", title: "Product brief", link: "documents/PRD.md", phaseIds: [phaseId] });
    const taskId = await asA.mutation(api.tasks.create, { ...task, projectId, milestoneId });
    await asA.mutation(api.tasks.edit, { taskId, notes: "Keep it small" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    await call(t, token, "start_task", { task: taskId });

    const got = (await call(t, token, "get_task", { task: "wire" })).data;
    expect(got).toMatchObject({
      id: taskId, status: "In progress", code: "0A·1", notes: "Keep it small", doneWhen: task.doneWhen,
      project: { id: projectId, title: "Becoming" }, milestone: "0A Scaffold", phase: { num: "00", name: "Foundations", goal: "An app you own" },
      builtFrom: [{ code: "PRD", title: "Product brief", link: "documents/PRD.md", written: true }],
    });
    expect(got.history[0]).toMatchObject({ kind: "started", by: "Claude Code" });

    const activity = (await call(t, token, "get_activity", { limit: 5 })).data;
    expect(activity.items[0]).toMatchObject({ kind: "started", task: task.title, by: "Claude Code", project: "Becoming" });
  });

  it("offers a prompt to work on a task, filled with the task when given", async () => {
    const { t, asA } = setup();
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const listed = (await mcp(t, token, "prompts/list")).result.prompts;
    expect(listed.find((p: { name: string }) => p.name === "work_on_task")).toMatchObject({ arguments: [expect.objectContaining({ name: "task", required: false })] });
    const named = (await mcp(t, token, "prompts/get", { name: "work_on_task", arguments: { task: "Wire the endpoint" } })).result.messages[0].content.text;
    expect(named).toContain(`get_task for "Wire the endpoint"`);
    expect(named).toContain("complete_task");
    const open = (await mcp(t, token, "prompts/get", { name: "work_on_task" })).result.messages[0].content.text;
    expect(open).toContain("ask me which task");
    expect((await mcp(t, token, "initialize", {})).result.instructions).toContain(`"applied"`);
  });
});
