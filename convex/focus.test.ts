import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// PLAN-one-tap-and-daily-loop, Phase 4: focus as a tool. Pause and resume, a recap without
// "what changed", starting any task at any length, and switching sessions.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { lane: "Projects" as const, minutes: 45, energy: 2, doneWhen: "It works" };
const minute = 60_000;

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
const at = (ms: number) => vi.setSystemTime(new Date(ms));
const T = Date.UTC(2026, 9, 16, 19, 0);
afterEach(() => { vi.useRealTimers(); });

describe("focus as a tool", () => {
  it("leaves paused time out of the session's minutes, paused or not when it's saved", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { t, asA, asB } = setup();
    at(T);
    const taskId = await asA.mutation(api.tasks.create, { ...task, title: "Paused one" });
    const id = await asA.mutation(api.tasks.startSession, { taskId });
    at(T + 10 * minute);
    await asA.mutation(api.focus.pause, { activeSessionId: id });
    await expect(asB.mutation(api.focus.pause, { activeSessionId: id })).rejects.toThrow();
    expect(await asA.query(api.focus.active, {})).toMatchObject({ pausedAt: T + 10 * minute, pausedMs: 0, minutes: 45 });
    at(T + 15 * minute);
    await asA.mutation(api.focus.resume, { activeSessionId: id });
    expect(await asA.query(api.focus.active, {})).toMatchObject({ pausedAt: null, pausedMs: 5 * minute });
    at(T + 30 * minute);
    await asA.mutation(api.focus.pause, { activeSessionId: id });
    at(T + 50 * minute);
    // Saved while paused: 50 minutes since the start, 25 of them paused.
    await asA.mutation(api.tasks.recordSession, { activeSessionId: id, outcome: "Made progress", contribution: "", nextStep: "Keep going", evidence: "" });
    const [session] = await t.run(ctx => ctx.db.query("sessions").collect());
    expect((session.endedAt - session.startedAt!) / minute).toBe(25);
    expect(session.contribution).toBe("");
    const focused = await t.run(ctx => ctx.db.query("taskEvents").collect());
    expect(focused.find(e => e.kind === "focused")?.note).toBeUndefined();
    expect(await asA.query(api.focus.active, {})).toBeNull();
  });

  it("starts any open task at any length, regardless of its size or energy", async () => {
    const { asA } = setup();
    const big = await asA.mutation(api.tasks.create, { ...task, title: "Big", minutes: 200, energy: 3 });
    await asA.mutation(api.tasks.startSession, { taskId: big, minutes: 15 });
    expect(await asA.query(api.focus.active, {})).toMatchObject({ taskId: big, minutes: 15, title: "Big" });
    const other = await asA.mutation(api.tasks.create, { ...task, title: "Other" });
    await expect(asA.mutation(api.tasks.startSession, { taskId: other, minutes: 3, replace: true })).rejects.toThrow("5–240 minutes");
  });

  it("switches to another task only when asked, recording nothing for the first", async () => {
    const { t, asA } = setup();
    const a = await asA.mutation(api.tasks.create, { ...task, title: "A" });
    const b = await asA.mutation(api.tasks.create, { ...task, title: "B" });
    const first = await asA.mutation(api.tasks.startSession, { taskId: a });
    await expect(asA.mutation(api.tasks.startSession, { taskId: b })).rejects.toThrow("current session first");
    expect(await asA.mutation(api.tasks.startSession, { taskId: a })).toBe(first);
    await asA.mutation(api.tasks.startSession, { taskId: b, replace: true });
    expect(await asA.query(api.focus.active, {})).toMatchObject({ taskId: b, title: "B" });
    expect(await t.run(ctx => ctx.db.query("activeSessions").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("sessions").collect())).toEqual([]);
  });

  it("keeps the chime setting, on by default", async () => {
    const { asA } = setup();
    await asA.mutation(api.settings.saveMotive, { motive: "Ship" });
    expect((await asA.query(api.settings.getProfile, {}))!.focusChime).toBe(true);
    await asA.mutation(api.settings.savePreferences, { focusChime: false });
    expect((await asA.query(api.settings.getProfile, {}))!.focusChime).toBe(false);
  });
});
