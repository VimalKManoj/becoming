import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { reminderContent } from "./reminders";
import { weekKey } from "./lib/time";

// PLAN-one-tap-and-daily-loop, Phase 5a: the daily close, tomorrow's line on Today, and what
// the evening reminder says (in order: your line, a near finish, the week, a task).

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const ownerA = `${issuer}|user-a`;
const task = { lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };
const zone = "UTC";
const wednesday = Date.UTC(2026, 9, 14, 21, 0);
const thursday = Date.UTC(2026, 9, 15, 18, 0);

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
afterEach(() => { vi.useRealTimers(); });
const content = (t: ReturnType<typeof setup>["t"], now: number) =>
  t.run(async ctx => reminderContent(ctx, ownerA, await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", ownerA)).unique(), now));

describe("closing the day", () => {
  it("saves one line for tomorrow, replaces it the same day, and refuses an empty close or someone else's task", async () => {
    const { asA, asB } = setup();
    const taskId = await asA.mutation(api.tasks.create, { ...task, title: "Trace a session" });
    await expect(asA.mutation(api.today.close, { day: "2026-10-14", tomorrow: "  " })).rejects.toThrow("one line for tomorrow");
    await expect(asB.mutation(api.today.close, { day: "2026-10-14", tomorrow: "", taskId })).rejects.toThrow();
    await asA.mutation(api.today.close, { day: "2026-10-14", tomorrow: "Trace one session" });
    await asA.mutation(api.today.close, { day: "2026-10-14", tomorrow: "", taskId });
    const home = await asA.query(api.today.home, { today: "2026-10-14", timezone: zone });
    expect(home.closedToday).toEqual({ tomorrow: "", taskId });
    // The next day, Today opens with it (named by its task when the line is empty).
    const next = await asA.query(api.today.home, { today: "2026-10-15", timezone: zone });
    expect(next.lastNight).toEqual({ day: "2026-10-14", tomorrow: "Trace a session", task: { id: taskId, title: "Trace a session", status: "Ready" } });
    expect(next.closedToday).toBeNull();
    // Four days later it's too old to quote.
    expect((await asA.query(api.today.home, { today: "2026-10-19", timezone: zone })).lastNight).toBeNull();
  });

  it("keeps a close in the backup and removes it with the workspace data", async () => {
    const { t, asA } = setup();
    await asA.mutation(api.today.close, { day: "2026-10-14", tomorrow: "Write the post" });
    expect((await asA.query(api.data.exportAll, {})).dayCloses).toEqual([{ day: "2026-10-14", tomorrow: "Write the post", taskId: undefined }]);
    for (let i = 0; i < 20 && (await t.run(ctx => ctx.db.query("dayCloses").collect())).length; i++) await asA.mutation(api.data.deleteBatch, {});
    expect(await t.run(ctx => ctx.db.query("dayCloses").collect())).toEqual([]);
  });
});

describe("the evening reminder's words", () => {
  it("prefers your line, then a near finish, then the week, then a task", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(wednesday));
    const { t, asA } = setup();
    await asA.mutation(api.rhythm.setRhythm, { timezone: zone, weeklyTarget: 2, currentWeek: weekKey(wednesday, zone) });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Scaffold" });
    const first = await asA.mutation(api.tasks.create, { ...task, title: "First", projectId, milestoneId });
    await asA.mutation(api.tasks.create, { ...task, title: "Second", projectId, milestoneId });
    await asA.mutation(api.tasks.setStatus, { taskId: first, status: "Done" });
    await asA.mutation(api.today.close, { day: "2026-10-14", tomorrow: "Finish the scaffold" });

    vi.setSystemTime(new Date(thursday));
    expect(await content(t, thursday)).toMatchObject({ kind: "tomorrow", subject: "Last night you said: Finish the scaffold", line: "Last night you said: “Finish the scaffold”." });
    await t.run(async ctx => { for (const c of await ctx.db.query("dayCloses").collect()) await ctx.db.delete(c._id); });
    expect(await content(t, thursday)).toMatchObject({ kind: "nearFinish", line: "One task finishes Scaffold: Second." });
    await asA.mutation(api.tasks.create, { ...task, title: "Third", projectId, milestoneId });
    // Wednesday moved, the target is 2: one more day makes the week.
    expect(await content(t, thursday)).toMatchObject({ kind: "week", subject: "One more day makes your week" });
    // Without a weekly target, the reminder suggests tonight's task.
    await t.run(async ctx => { for (const c of await ctx.db.query("weeklyCommitments").collect()) await ctx.db.delete(c._id); });
    await asA.mutation(api.settings.saveCapacity, { minutes: 30, energy: 2 });
    expect(await content(t, thursday)).toMatchObject({ kind: "task", line: "Tonight's next step: Second (30 min)." });
  });

  it("gives a device its reminder's words, and nothing to an unknown device", async () => {
    const { t, asA } = setup();
    await asA.mutation(api.push.subscribe, { endpoint: "https://push.example.test/a", p256dh: "key", auth: "secret" });
    const profileId = await t.run(async ctx => (await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", ownerA)).unique())?._id
      ?? ctx.db.insert("profiles", { owner: ownerA, motive: "" }));
    await t.mutation(internal.reminders.markSent, { profileId, day: "2026-10-15", text: "Last night you said: “Ship it”. Even 15 minutes counts." });
    const ask = async (endpoint: string) => (await (await t.fetch("/reminder-line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) })).json()).body;
    expect(await ask("https://push.example.test/a")).toBe("Last night you said: “Ship it”. Even 15 minutes counts.");
    expect(await ask("https://push.example.test/other")).toBeNull();
  });
});
