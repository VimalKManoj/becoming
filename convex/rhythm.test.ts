import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { addDays, weekKey } from "./lib/time";
import { assertCurrentWeek } from "./rhythm";

const modules = import.meta.glob("./**/*.ts");
const currentWeek = () => weekKey(Date.now(), "UTC");

afterEach(() => vi.useRealTimers());

describe("weekly rhythm", () => {
  it("applies the first target now and later changes from next week", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const week = currentWeek();
    const next = addDays(week, 7);
    const stored = () => t.run(ctx => ctx.db.query("weeklyCommitments").collect()).then(items => items.map(item => ({ week: item.week, target: item.target, paused: item.paused })).sort((a, b) => a.week.localeCompare(b.week)));

    expect(await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week })).toEqual({ appliesFrom: week });
    expect(await stored()).toEqual([{ week, target: 3, paused: false }]);
    expect(await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 4, currentWeek: week })).toEqual({ appliesFrom: next });
    expect(await stored()).toEqual([{ week, target: 3, paused: false }, { week: next, target: 4, paused: false }]);
    // Choosing this week's target again removes the pending change.
    expect(await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week })).toEqual({ appliesFrom: week });
    expect(await stored()).toEqual([{ week, target: 3, paused: false }]);
    const profile = await t.run(ctx => ctx.db.query("profiles").collect());
    expect(profile).toMatchObject([{ timezone: "UTC", motive: "" }]);
  });

  it("validates the week, target and timezone", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const week = currentWeek();
    await expect(t.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week })).rejects.toThrow("Sign in");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: addDays(week, 1) })).rejects.toThrow("valid week");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: "2020-01-06" })).rejects.toThrow("current week");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: addDays(week, 14) })).rejects.toThrow("current week");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 0, currentWeek: week })).rejects.toThrow("1–6");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 7, currentWeek: week })).rejects.toThrow("1–6");
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "not a zone!", weeklyTarget: 3, currentWeek: week })).rejects.toThrow("valid timezone");
  });

  it("checks the week in the person's own timezone, allowing a few minutes of clock difference", () => {
    const at = (iso: string) => Date.parse(iso);
    // Monday 00:30 in Kolkata: the new week has begun there, though it is still Sunday in UTC.
    expect(() => assertCurrentWeek("2026-10-05", "Asia/Kolkata", at("2026-10-04T19:00:00Z"))).not.toThrow();
    expect(() => assertCurrentWeek("2026-09-28", "Asia/Kolkata", at("2026-10-04T19:00:00Z"))).toThrow("current week");
    // Sunday 22:00 in Los Angeles: last week is still current there, and next week isn't yet.
    expect(() => assertCurrentWeek("2026-09-28", "America/Los_Angeles", at("2026-10-05T05:00:00Z"))).not.toThrow();
    expect(() => assertCurrentWeek("2026-10-05", "America/Los_Angeles", at("2026-10-05T05:00:00Z"))).toThrow("current week");
    // Three minutes before midnight, a browser that is slightly ahead may already send the new week.
    expect(() => assertCurrentWeek("2026-10-05", "Asia/Kolkata", at("2026-10-04T18:27:00Z"))).not.toThrow();
    expect(() => assertCurrentWeek("2026-10-05", "Asia/Kolkata", at("2026-10-04T18:00:00Z"))).toThrow("current week");
  });

  it("falls back to the week that is current somewhere on Earth when the timezone is unknown", () => {
    const check = (week: string, iso: string) => () => assertCurrentWeek(week, undefined, Date.parse(iso));
    expect(check("2026-09-21", "2026-09-30T12:00:00Z")).toThrow("current week"); // Wednesday
    expect(check("2026-10-05", "2026-09-30T12:00:00Z")).toThrow("current week");
    expect(check("2026-09-28", "2026-09-30T12:00:00Z")).not.toThrow();
    // Early Monday in UTC it is still Sunday at UTC-12; midday Sunday it is already Monday at UTC+14.
    expect(check("2026-09-28", "2026-10-05T05:00:00Z")).not.toThrow();
    expect(check("2026-10-05", "2026-10-04T12:00:00Z")).not.toThrow();
    // The exact edges: last week ends at UTC-12 at 12:00 UTC on Monday.
    expect(check("2026-09-28", "2026-10-05T12:00:00Z")).not.toThrow();
    expect(check("2026-09-28", "2026-10-05T12:00:01Z")).toThrow("current week");
    expect(check("2026-10-05", "2026-10-04T09:59:59Z")).toThrow("current week");
    // A timezone the runtime doesn't know uses the same fallback.
    expect(() => assertCurrentWeek("2026-09-28", "Mars/Olympus", Date.parse("2026-10-05T05:00:00Z"))).not.toThrow();
  });

  it("refuses last week through the mutations once it is over in the saved timezone", async () => {
    // Fake only the clock; convex-test still needs real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    vi.setSystemTime(new Date("2026-10-04T19:00:00Z")); // Monday 00:30 in Kolkata
    await asA.mutation(api.rhythm.setRhythm, { timezone: "Asia/Kolkata", weeklyTarget: 3, currentWeek: "2026-10-05" });
    await expect(asA.mutation(api.rhythm.setRhythm, { timezone: "Asia/Kolkata", weeklyTarget: 4, currentWeek: "2026-09-28" })).rejects.toThrow("current week");
    // setPause checks against the timezone saved in the profile.
    await expect(asA.mutation(api.rhythm.setPause, { currentWeek: "2026-09-28", week: "2026-09-28", paused: true })).rejects.toThrow("current week");
    await asA.mutation(api.rhythm.setPause, { currentWeek: "2026-10-05", week: "2026-10-05", paused: true });
  });

  it("plans pauses for this week or next, keeps them through a target change, and removes empty markers", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const week = currentWeek();
    const next = addDays(week, 7);
    await expect(asA.mutation(api.rhythm.setPause, { currentWeek: week, week: next, paused: true })).rejects.toThrow("target first");
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week });
    await expect(asA.mutation(api.rhythm.setPause, { currentWeek: week, week: addDays(week, 14), paused: true })).rejects.toThrow("this week or next week");

    await asA.mutation(api.rhythm.setPause, { currentWeek: week, week: next, paused: true });
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 2, currentWeek: week });
    const atNext = await t.run(ctx => ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", "https://auth.example.test|user-a").eq("week", next)).unique());
    expect(atNext).toMatchObject({ target: 2, paused: true });
    // Cancelling keeps the document because it also carries next week's new target.
    await asA.mutation(api.rhythm.setPause, { currentWeek: week, week: next, paused: false });
    expect(await t.run(ctx => ctx.db.get(atNext!._id))).toMatchObject({ target: 2, paused: false });

    await asA.mutation(api.rhythm.setPause, { currentWeek: week, week, paused: true });
    expect(await t.run(ctx => ctx.db.query("weeklyCommitments").collect())).toHaveLength(2);
    await asA.mutation(api.rhythm.setPause, { currentWeek: week, week, paused: false });
    expect(await t.run(ctx => ctx.db.query("weeklyCommitments").collect())).toEqual(expect.arrayContaining([expect.objectContaining({ week, paused: false })]));
  });

  it("returns only the owner's rhythm and recent sessions", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const week = currentWeek();
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 2, currentWeek: week });
    const taskId = await asA.mutation(api.tasks.create, { title: "Write", lane: "Writing", minutes: 30, energy: 2, doneWhen: "A draft" });
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: "Drafted", nextStep: "Edit", evidence: "" });
    await t.run(ctx => ctx.db.insert("sessions", { owner: "https://auth.example.test|user-a", taskId, key: "old", lane: "Writing", title: "Old", outcome: "Finished", contribution: "Long ago", nextStep: "", evidence: "", endedAt: Date.parse("2024-01-01T00:00:00Z") }));

    const now = Date.now();
    const mine = await asA.query(api.rhythm.overview, { now });
    expect(mine).toMatchObject({ timezone: "UTC", commitments: [{ week, target: 2, paused: false }] });
    expect(mine.sessions).toHaveLength(1);
    const theirs = await asB.query(api.rhythm.overview, { now });
    expect(theirs).toEqual({ timezone: null, commitments: [], reflections: [], sessions: [], plans: [], windowStart: theirs.windowStart });
  });

  it("saves, revises and clears a private weekly reflection", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const week = currentWeek();
    await expect(asA.mutation(api.rhythm.saveReflection, { week: addDays(week, 14), learning: "Too soon", intention: "" })).rejects.toThrow("this week or an earlier one");
    await asA.mutation(api.rhythm.saveReflection, { week, learning: " Smaller steps start faster. ", intention: "Write twice." });
    await asA.mutation(api.rhythm.saveReflection, { week, learning: "Smaller steps start faster.", intention: "Write three times." });
    const now = Date.now();
    expect((await asA.query(api.rhythm.overview, { now })).reflections).toEqual([{ week, learning: "Smaller steps start faster.", intention: "Write three times." }]);
    expect((await asB.query(api.rhythm.overview, { now })).reflections).toEqual([]);
    await asA.mutation(api.rhythm.saveReflection, { week, learning: "", intention: "  " });
    expect(await t.run(ctx => ctx.db.query("reflections").collect())).toHaveLength(0);
  });
});
