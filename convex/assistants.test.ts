import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { title: "Wire the endpoint", lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "Claude can call it" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}

async function mcp(t: ReturnType<typeof convexTest>, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const response = await t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { status: response.status, body: response.status === 202 ? null : await response.json() };
}

async function call(t: ReturnType<typeof convexTest>, token: string, name: string, args: Record<string, unknown>) {
  const { body } = await mcp(t, token, "tools/call", { name, arguments: args });
  return { error: body.result.isError ? body.result.content[0].text as string : null, data: body.result.isError ? null : JSON.parse(body.result.content[0].text) };
}

describe("assistants (MCP) and the Inbox", () => {
  it("needs a valid token, shows it once and forgets it when revoked", async () => {
    const { t, asA, asB } = setup();
    expect((await mcp(t, null, "tools/list")).status).toBe(401);
    expect((await mcp(t, "bcm_not-a-real-token", "tools/list")).status).toBe(401);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    expect(token).toMatch(/^bcm_[\w-]{40,}$/);
    const listed = await asA.query(api.assistants.tokens, {});
    expect(listed).toEqual([expect.objectContaining({ name: "Claude Code", prefix: token.slice(0, 12), lastUsedAt: null })]);
    expect(JSON.stringify(listed)).not.toContain(token);
    const init = await mcp(t, token, "initialize", { protocolVersion: "2025-06-18" });
    expect(init.body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "becoming" } });
    expect((await mcp(t, token, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name)).toContain("log_session");
    await expect(asB.mutation(api.assistants.revokeToken, { tokenId: listed[0]._id })).rejects.toThrow();
    await asA.mutation(api.assistants.revokeToken, { tokenId: listed[0]._id });
    expect((await mcp(t, token, "tools/list")).status).toBe(401);
  });

  it("reads only the token owner's work", async () => {
    const { t, asA, asB } = setup();
    await asA.mutation(api.tasks.create, task);
    await asB.mutation(api.tasks.create, { ...task, title: "B's private task" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const next = await call(t, token, "whats_next", { minutes: 60, energy: "steady" });
    expect(next.data.focus).toMatchObject({ title: "Wire the endpoint", lane: "Projects" });
    const tasks = await call(t, token, "list_tasks", {});
    expect(tasks.data.map((item: { title: string }) => item.title)).toEqual(["Wire the endpoint"]);
    expect((await call(t, token, "log_session", { task: "B's private task", minutes: 10, outcome: "progress", what_changed: "x", next_step: "y" })).error).toContain("No ");
  });

  it("sends changes to the Inbox, where approving applies the app's rules and discarding saves nothing", async () => {
    const { t, asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, task);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    expect((await call(t, token, "log_session", { task: "wire", minutes: 50, outcome: "progress", what_changed: "Built the endpoint.", next_step: "Next.", skills: ["Cooking"] })).error).toContain("Unknown skill");
    expect((await call(t, token, "log_session", { task: "wire", minutes: 50, outcome: "progress", what_changed: "Built the endpoint." })).error).toContain("next_step");
    const logged = await call(t, token, "log_session", { task: "wire", minutes: 50, outcome: "progress", what_changed: "Built the endpoint.", next_step: "Add the Inbox card.", skills: ["systems", "Shipping"], evidence_url: "https://example.com/pr/1" });
    expect(logged.data.status).toBe("waiting for approval");
    await call(t, token, "capture_idea", { title: "Sound-reactive loader", lane: "Showcases" });

    // Nothing counts yet.
    expect((await call(t, token, "recent_sessions", {})).data).toEqual([]);
    const inbox = await asA.query(api.inbox.list, {});
    expect(inbox.map(item => [item.kind, item.source])).toEqual([["idea", "Claude Code"], ["session", "Claude Code"]]);
    expect(await asB.query(api.inbox.list, {})).toEqual([]);
    await expect(asB.mutation(api.inbox.approve, { itemId: inbox[1]._id })).rejects.toThrow();

    await asA.mutation(api.inbox.approve, { itemId: inbox[1]._id });
    await asA.mutation(api.inbox.discard, { itemId: inbox[0]._id });
    expect(await asA.query(api.inbox.list, {})).toEqual([]);
    const sessions = await call(t, token, "recent_sessions", {});
    expect(sessions.data).toEqual([expect.objectContaining({ title: "Wire the endpoint", outcome: "Made progress", minutes: 50, via: "Claude Code", skills: ["Systems", "Shipping"], evidence: "https://example.com/pr/1" })]);
    expect(await asA.query(api.tasks.get, { taskId })).toMatchObject({ status: "In progress", nextStep: "Add the Inbox card." });
    const proof = await asA.query(api.proof.pipeline, {});
    expect(proof.draft).toBe(1);
    const ideas = await asA.query(api.ideas.listPage, { paginationOpts: { numItems: 10, cursor: null } });
    expect(ideas.page).toEqual([]);
  });

  it("logs work on a new task in one approval, and refuses an approval the app would refuse", async () => {
    const { t, asA } = setup();
    const token = await asA.action(api.assistants.createToken, { name: "Claude" });
    await call(t, token, "log_session", { new_task_title: "Draft the launch post", new_task_lane: "Writing", new_task_done_when: "400 words", minutes: 30, outcome: "finished", what_changed: "Wrote the draft." });
    const [item] = await asA.query(api.inbox.list, {});
    expect(item).toMatchObject({ kind: "session", title: "Draft the launch post (new task)" });
    await asA.mutation(api.inbox.approve, { itemId: item._id });
    const done = await asA.query(api.tasks.listPage, { paginationOpts: { numItems: 10, cursor: null }, view: "done" });
    expect(done.page.map(task => task.title)).toEqual(["Draft the launch post"]);

    // A proposal about a task that has since finished can't be approved.
    const open = await asA.mutation(api.tasks.create, task);
    await call(t, token, "set_next_step", { task: open, next_step: "Write tests" });
    const [pending] = await asA.query(api.inbox.list, {});
    await asA.mutation(api.tasks.archive, { taskId: open });
    await expect(asA.mutation(api.inbox.approve, { itemId: pending._id })).rejects.toThrow("archived");
    expect(await asA.query(api.inbox.list, {})).toHaveLength(1);
  });

  it("deleting workspace data removes tokens and the Inbox too", async () => {
    const { t, asA } = setup();
    await asA.mutation(api.tasks.create, task);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    await call(t, token, "capture_idea", { title: "Idea", lane: "Writing" });
    let done = false;
    while (!done) done = (await asA.mutation(api.data.deleteBatch, {})).done;
    expect(await asA.query(api.assistants.tokens, {})).toEqual([]);
    expect(await asA.query(api.inbox.list, {})).toEqual([]);
    expect((await mcp(t, token, "tools/list")).status).toBe(401);
  });
});
