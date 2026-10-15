import { convexTest } from "convex-test";
import { describe, expect, it, vi, afterEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// PLAN-one-tap-and-daily-loop, Phase 3: today.home (On it now, Last time, open counts) and a
// task you chose yourself being offered even when it's bigger than tonight.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "It works" };
const zone = "UTC";

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
const at = (iso: string) => vi.setSystemTime(new Date(iso));
afterEach(() => { vi.useRealTimers(); });

describe("Today: On it now and Last time", () => {
  it("lists up to three tasks in progress, latest moved first, with their plan code and the rest counted", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Scaffold" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    const ids = [];
    for (const [i, title] of ["One", "Two", "Three", "Four"].entries()) {
      at(`2026-10-15T1${i}:00:00Z`);
      const id = await asA.mutation(api.tasks.create, { ...task, title, projectId, milestoneId });
      await asA.mutation(api.tasks.setStatus, { taskId: id, status: "In progress" });
      ids.push(id);
    }
    at("2026-10-15T20:00:00Z");
    await asA.mutation(api.tasks.edit, { taskId: ids[0], nextStep: "Add the retry" });
    await asA.mutation(api.tasks.setStatus, { taskId: ids[0], status: "Ready" });
    await asA.mutation(api.tasks.setStatus, { taskId: ids[0], status: "In progress" });

    const home = await asA.query(api.today.home, { today: "2026-10-15", timezone: zone });
    expect(home.onItNow.map(row => [row.title, row.code, row.project?.title])).toEqual([["One", "0A·1", "Becoming"], ["Four", "0A·4", "Becoming"], ["Three", "0A·3", "Becoming"]]);
    expect(home.moreInProgress).toBe(1);
    expect(home.openByLane).toEqual({ Projects: 4, Showcases: 0, Writing: 0 });
    expect((await asB.query(api.today.home, { today: "2026-10-15", timezone: zone })).onItNow).toEqual([]);
  });

  it("says what moved on the last active day, by you and by an assistant, and where you left off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { t, asA } = setup();
    at("2026-10-13T10:00:00Z");
    const old = await asA.mutation(api.tasks.create, { ...task, title: "Old" });
    await asA.mutation(api.tasks.setStatus, { taskId: old, status: "Done" });
    at("2026-10-14T18:00:00Z");
    const r1 = await asA.mutation(api.tasks.create, { ...task, title: "R1" });
    const r2 = await asA.mutation(api.tasks.create, { ...task, title: "R2" });
    await asA.mutation(api.tasks.setStatus, { taskId: r1, status: "In progress" });
    await asA.mutation(api.tasks.setStatus, { taskId: r1, status: "Done" });
    await asA.mutation(api.tasks.setStatus, { taskId: r2, status: "In progress", note: "Trace one session" });
    const token = await asA.action(api.assistants.createToken, { name: "Claude Code" });
    const r3 = await asA.mutation(api.tasks.create, { ...task, title: "R3" });
    await t.fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "complete_task", arguments: { task: r3, summary: "Shipped." } } }) });

    // Nothing moved today yet, so it's yesterday.
    const home = await asA.query(api.today.home, { today: "2026-10-15", timezone: zone });
    expect(home.lastTime).toMatchObject({
      day: "2026-10-14", isToday: false,
      groups: [
        { by: "you", finished: [{ title: "R1" }], started: [{ title: "R2" }], blocked: [], logged: [] },
        { by: "Claude Code", finished: [{ title: "R3" }], started: [] },
      ],
      pickUp: { taskId: r2, title: "R2", nextStep: "Trace one session" },
    });

    // Once something moves today, Last time is today so far.
    at("2026-10-15T19:00:00Z");
    await asA.mutation(api.tasks.setStatus, { taskId: r2, status: "Blocked", note: "No key" });
    const later = await asA.query(api.today.home, { today: "2026-10-15", timezone: zone });
    expect(later.lastTime).toMatchObject({ day: "2026-10-15", isToday: true, groups: [{ by: "you", blocked: [{ title: "R2" }] }], pickUp: null });
  });

  it("has no Last time before anything has moved", async () => {
    const { asA } = setup();
    await asA.mutation(api.tasks.create, { ...task, title: "Fresh" });
    expect((await asA.query(api.today.home, { today: "2026-10-15", timezone: zone })).lastTime).toBeNull();
    await expect(asA.query(api.today.home, { today: "15/10", timezone: zone })).rejects.toThrow("today must be a date");
  });

  it("offers a task you chose even when it needs more than tonight, with a note", async () => {
    const { asA } = setup();
    const big = await asA.mutation(api.tasks.create, { ...task, title: "Big one", minutes: 180, energy: 3 });
    const today = await asA.query(api.tasks.todayOverview, { minutes: 45, energy: 2, taskId: big });
    expect(today.choices).toEqual([expect.objectContaining({ taskId: big, minutes: 180, reason: expect.stringContaining("needs 180 minutes and high energy") })]);
    // Without choosing it, it still doesn't fit.
    expect((await asA.query(api.tasks.todayOverview, { minutes: 45, energy: 2 })).choices).toEqual([]);
  });
});
