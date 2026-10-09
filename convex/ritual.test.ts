import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { addDays, weekKey } from "./lib/time";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };
const evening = { minutes: 60, energy: 3 };

describe("the Ritual flow's backend", () => {
  it("scopes tonight's focus to a lane or a project, with the best of the other lanes as alternatives", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const { projectId, taskId: projectStep } = await asA.mutation(api.projects.createWithFirstStep, {
      title: "Type specimen tool", purpose: "A living specimen for variable fonts.",
      step: { title: "Two-axis waterfall", lane: "Projects", minutes: 30, energy: 2, doneWhen: "Scrubs smoothly" },
    });
    await asA.mutation(api.tasks.create, { ...task, title: "Loose project task" });
    const showcase = await asA.mutation(api.tasks.create, { ...task, title: "Orbit loader", lane: "Showcases" });
    const writing = await asA.mutation(api.tasks.create, { ...task, title: "Recap note", lane: "Writing" });

    const build = await asA.query(api.tasks.todayOverview, { ...evening, projectId });
    expect(build.choices.map(choice => choice.taskId)).toEqual([projectStep]);
    expect(build.choices[0]).toMatchObject({ projectTitle: "Type specimen tool" });
    expect(build.alternatives.map(choice => choice.taskId).sort()).toEqual([showcase, writing].sort());

    const small = await asA.query(api.tasks.todayOverview, { ...evening, lane: "Showcases" });
    expect(small.choices.map(choice => choice.title)).toEqual(["Orbit loader"]);
    expect(small.alternatives.every(choice => choice.lane !== "Showcases")).toBe(true);

    // One task, from a link; and ids from a broken link (or another table) match nothing instead of failing.
    const one = await asA.query(api.tasks.todayOverview, { ...evening, taskId: writing });
    expect(one.choices.map(choice => choice.taskId)).toEqual([writing]);
    for (const scope of [{ projectId: "abc" }, { projectId: writing }, { taskId: "not-an-id" }]) {
      const broken = await asA.query(api.tasks.todayOverview, { ...evening, ...scope });
      expect(broken.choices).toEqual([]);
    }
  });

  it("offers lined-up steps from the weekly plan first, and says why", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const week = weekKey(Date.now(), "UTC");
    await asA.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week });
    await asA.mutation(api.tasks.create, { ...task, title: "Older task" });
    const later = await asA.mutation(api.tasks.create, { ...task, title: "Lined up" });
    await asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week, intention: "Finish milestone 2", taskIds: [later] });

    const overview = await asA.query(api.tasks.todayOverview, { ...evening, week });
    expect(overview.choices[0]).toMatchObject({ taskId: later, linedUp: true });
    expect(overview.choices[0].reason).toContain("lined this up");
    expect(overview).toMatchObject({ intention: "Finish milestone 2", linedUpCount: 1 });
    // Without the week, the oldest task leads as usual.
    expect((await asA.query(api.tasks.todayOverview, evening)).choices[0].title).toBe("Older task");
    // The plan shows up in the rhythm overview, and next week can be planned too.
    await asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week: addDays(week, 7), intention: "", taskIds: [] });
    expect((await asA.query(api.rhythm.overview, { now: Date.now() })).plans.map(plan => plan.week).sort()).toEqual([week, addDays(week, 7)]);
  });

  it("refuses plans for other weeks, closed tasks and long intentions", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const week = weekKey(Date.now(), "UTC");
    const done = await asA.mutation(api.tasks.create, task);
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId: done });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence: "" });
    const foreign = await asB.mutation(api.tasks.create, task);
    await expect(asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week: addDays(week, 14), intention: "", taskIds: [] })).rejects.toThrow("this week or next");
    await expect(asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week, intention: "", taskIds: [done] })).rejects.toThrow("ready or in progress");
    await expect(asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week, intention: "", taskIds: [foreign] })).rejects.toThrow("Record not found");
    await expect(asA.mutation(api.rhythm.saveWeekPlan, { currentWeek: week, week, intention: "x".repeat(121), taskIds: [] })).rejects.toThrow("120");
  });

  it("offers onboarding to a brand-new account only, and saves preferences", async () => {
    const t = convexTest(schema, modules);
    const fresh = t.withIdentity({ subject: "user-new", issuer: "https://auth.example.test" });
    const existing = t.withIdentity({ subject: "user-old", issuer: "https://auth.example.test" });
    expect(await fresh.query(api.settings.getProfile, {})).toMatchObject({ needsOnboarding: true, focusQuotes: true, focusMusic: true, reminderOn: false });
    await existing.mutation(api.tasks.create, task);
    expect(await existing.query(api.settings.getProfile, {})).toBeNull();

    await fresh.mutation(api.settings.savePreferences, { focusQuotes: false, reminderOn: true, reminderTime: "21:30" });
    await fresh.mutation(api.settings.completeOnboarding, {});
    expect(await fresh.query(api.settings.getProfile, {})).toMatchObject({ needsOnboarding: false, focusQuotes: false, focusMusic: true, reminderOn: true, reminderTime: "21:30", reminderDays: "weekdays" });
  });

  it("lists a project's next step and when it was last worked on", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const { projectId, taskId } = await asA.mutation(api.projects.createWithFirstStep, {
      title: "Becoming v1", purpose: "Picks tonight's work.", step: { title: "Wire the retry", lane: "Projects", minutes: 45, energy: 2, doneWhen: "Retry keeps the recap" },
    });
    let [project] = await asA.query(api.projects.list, {});
    expect(project).toMatchObject({ _id: projectId, nextTask: { _id: taskId, title: "Wire the retry", minutes: 45 }, lastWorkedAt: null, lane: "Projects" });
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: "Half", nextStep: "Toast copy", evidence: "" });
    [project] = await asA.query(api.projects.list, {});
    expect(project.lastWorkedAt).toEqual(expect.any(Number));
    expect(project.nextTask?.title).toBe("Wire the retry");
    await expect(asA.mutation(api.projects.createWithFirstStep, { title: "x", purpose: "y", step: { title: "s", lane: "Projects", minutes: 2, energy: 2, doneWhen: "d" } })).rejects.toThrow("5–240");
  });
});
