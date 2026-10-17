import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { weekKey } from "./lib/time";

// PLAN-one-tap-and-daily-loop, Phase 5b: moments shown once (even when an assistant finished
// the milestone), the weekly look-back from records, and the assistant's week review draft.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 16, 19, 0);

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
type T = ReturnType<typeof setup>["t"];
afterEach(() => { vi.useRealTimers(); });
async function mcp(t: T, token: string, name: string, args: Record<string, unknown>) {
  const body = await (await t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) })).json();
  return body.result.isError ? { error: body.result.content[0].text as string } : JSON.parse(body.result.content[0].text);
}

describe("moments", () => {
  it("shows a milestone and its phase finished by an assistant once, then never again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Scaffold" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    const one = await asA.mutation(api.tasks.create, { ...task, title: "One", projectId, milestoneId });
    const two = await asA.mutation(api.tasks.create, { ...task, title: "Two", projectId, milestoneId });
    await asA.mutation(api.tasks.setStatus, { taskId: one, status: "Done" });
    expect(await asA.query(api.moments.list, {})).toEqual([]);
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    vi.setSystemTime(new Date(now + 60_000));
    await mcp(t, token, "complete_task", { task: two, summary: "Done." });

    const moments = await asA.query(api.moments.list, {});
    expect(moments.map(m => [m.kind, m.title, m.project, m.by])).toEqual([["phase", "Foundations", "Becoming", "Claude Code"], ["milestone", "Scaffold", "Becoming", "Claude Code"]]);
    expect(await asB.query(api.moments.list, {})).toEqual([]);
    await asA.mutation(api.moments.see, { key: moments[0].key });
    await asA.mutation(api.moments.see, { key: moments[1].key });
    expect(await asA.query(api.moments.list, {})).toEqual([]);
    await expect(asA.mutation(api.moments.see, { key: "anything goes" })).rejects.toThrow("isn't a moment");
    // A week later it would no longer surface even if unseen.
    vi.setSystemTime(new Date(now + 8 * DAY));
    await t.run(async ctx => { const p = await ctx.db.query("profiles").first(); if (p) await ctx.db.patch(p._id, { momentsSeen: [] }); });
    expect((await asA.query(api.moments.list, {})).filter(m => m.kind !== "week")).toEqual([]);
  });

  it("marks the week met once its target is reached", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const { asA } = setup();
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 1, currentWeek: weekKey(now, "UTC") });
    const id = await asA.mutation(api.tasks.create, { ...task, title: "Moved" });
    await asA.mutation(api.tasks.setStatus, { taskId: id, status: "In progress" });
    expect(await asA.query(api.moments.list, {})).toEqual([expect.objectContaining({ kind: "week", key: `w:${weekKey(now, "UTC")}`, title: "1 of 1 evenings" })]);
  });
});

describe("the weekly look-back", () => {
  it("lists what shipped by milestone, what stalled, where the time went and the skills that grew", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { asA } = setup();
    vi.setSystemTime(new Date(now - 10 * DAY));
    const stuck = await asA.mutation(api.tasks.create, { ...task, title: "Stuck one" });
    await asA.mutation(api.tasks.setStatus, { taskId: stuck, status: "In progress" });
    vi.setSystemTime(new Date(now - DAY));
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Scaffold" });
    const shipped = await asA.mutation(api.tasks.create, { ...task, title: "Shipped one", projectId, milestoneId });
    await asA.mutation(api.tasks.setStatus, { taskId: shipped, status: "Done", skills: ["Systems"] });
    const focused = await asA.mutation(api.tasks.create, { ...task, title: "Focused one", projectId, milestoneId });
    const session = await asA.mutation(api.tasks.startSession, { taskId: focused });
    vi.setSystemTime(new Date(now - DAY + 40 * 60_000));
    await asA.mutation(api.tasks.recordSession, { activeSessionId: session, outcome: "Made progress", contribution: "", nextStep: "More", evidence: "", skills: ["Frontend"] });

    const look = await asA.query(api.moments.lookBack, { since: now - 3 * DAY, until: now });
    expect(look.shipped).toEqual([{ group: "Becoming › Scaffold", tasks: ["Shipped one"] }]);
    expect(look.stalled).toEqual([expect.objectContaining({ title: "Stuck one", days: 10 })]);
    expect(look.time).toEqual([{ label: "Becoming", minutes: 40 }]);
    expect(look.skills.map(s => s.name).sort()).toEqual(["Frontend", "Systems"]);
  });

  it("lets an assistant draft what you learned, which waits for approval, and counts the week in days", async () => {
    const { t, asA } = setup();
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: weekKey(Date.now(), "UTC") });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const look = await mcp(t, token, "get_look_back", {});
    expect(look).toMatchObject({ shipped: [], stalled: [], time: [] });
    expect(await mcp(t, token, "draft_week_review", { learning: "Small steps beat big plans." })).toMatchObject({ status: "waiting for approval" });
    const [item] = await asA.query(api.inbox.list, {});
    expect(item).toMatchObject({ kind: "reflection", details: ["Weekly review"], body: "Small steps beat big plans." });
    await asA.mutation(api.inbox.approve, { itemId: item._id });
    expect(await t.run(ctx => ctx.db.query("reflections").collect())).toEqual([expect.objectContaining({ learning: "Small steps beat big plans.", intention: "" })]);
    expect(await mcp(t, token, "get_week", {})).toMatchObject({ daysWithProgress: 0, weeklyTarget: 3 });
  });
});
