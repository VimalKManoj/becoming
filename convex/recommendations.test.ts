import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { pinnedNote, rankFocuses, type Candidate } from "./lib/recommend";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

let created = 0;
function candidate(fields: Partial<Candidate> & { title: string }): Candidate {
  created += 1;
  return { _id: fields.title as Id<"tasks">, _creationTime: created, lane: "Projects", status: "Ready", minutes: 30, energy: 2, doneWhen: "Done", nextStep: "", ...fields };
}

describe("pinning and lane preference in the ranking", () => {
  const roomy = { minutes: 90, energy: 3 };

  it("puts a fitting pinned task first and says why", () => {
    const writing = candidate({ title: "Writing step", lane: "Writing" });
    const project = candidate({ title: "Project step" });
    const ranked = rankFocuses([writing, project], ["Writing", "Writing", "Projects"], roomy, { pinnedTaskId: project._id });
    expect(ranked.map(focus => [focus.title, focus.pinned])).toEqual([["Project step", true], ["Writing step", false]]);
    expect(ranked[0].reason).toBe("You pinned this as your next focus. It fits your 90 minutes and high energy.");
  });

  it("favours a lane by counting it one session fewer, and says so", () => {
    const project = candidate({ title: "Project step" });
    const showcase = candidate({ title: "Showcase step", lane: "Showcases" });
    const recent = ["Projects", "Showcases", "Projects"] as const;
    expect(rankFocuses([project, showcase], [...recent], roomy).map(focus => focus.lane)).toEqual(["Showcases", "Projects"]);
    const favoured = rankFocuses([project, showcase], [...recent], roomy, { laneFocus: "Projects" });
    expect(favoured.map(focus => focus.lane)).toEqual(["Projects", "Showcases"]);
    expect(favoured[0].reason).toContain("You're favouring Projects at the moment.");
  });

  it("explains why a pinned task doesn't fit tonight", () => {
    expect(pinnedNote(candidate({ title: "Big", minutes: 90, energy: 3 }), { minutes: 30, energy: 2 })).toContain("needs 90 minutes and high energy");
    expect(pinnedNote(candidate({ title: "Big", minutes: 90, smallerStep: "Sketch", smallerDone: "Sketched", smallerMinutes: 45 }), { minutes: 30, energy: 2 })).toContain("its smaller step needs 45 minutes");
  });
});

describe("pins, choices and preferences in Convex", () => {
  it("pins open tasks only, reports a pin that can't be offered, and clears it when the task finishes", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const small = await asA.mutation(api.tasks.create, { ...task, title: "Small" });
    const big = await asA.mutation(api.tasks.create, { ...task, title: "Big", minutes: 90 });
    const foreign = await asB.mutation(api.tasks.create, { ...task, title: "Foreign" });
    await expect(asA.mutation(api.tasks.pin, { taskId: foreign })).rejects.toThrow("Record not found");
    await asA.mutation(api.tasks.pin, { taskId: big });
    const tonight = await asA.query(api.tasks.todayOverview, { minutes: 30, energy: 2 });
    expect(tonight.pinned).toMatchObject({ taskId: big, offered: false, note: expect.stringContaining("needs 90 minutes") });
    expect(tonight.choices.map(choice => choice.taskId)).toEqual([small]);
    const longer = await asA.query(api.tasks.todayOverview, { minutes: 90, energy: 2 });
    expect(longer.pinned).toMatchObject({ offered: true, note: "" });
    expect(longer.choices[0]).toMatchObject({ taskId: big, pinned: true });

    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId: big, recommended: true });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence: "" });
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ pinnedTaskId: null });
    await expect(asA.mutation(api.tasks.pin, { taskId: big })).rejects.toThrow("still open");

    await asA.mutation(api.tasks.pin, { taskId: small });
    await asA.mutation(api.tasks.archive, { taskId: small });
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ pinnedTaskId: null });
  });

  it("records whether a session followed the recommendation, and why not", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const first = await asA.mutation(api.tasks.create, { ...task, title: "First" });
    const second = await asA.mutation(api.tasks.create, { ...task, title: "Second" });
    await expect(asA.mutation(api.tasks.startSession, { taskId: first, recommended: true, swapReason: "Too big tonight" })).rejects.toThrow("swap reason only applies");
    const swapped = await asA.mutation(api.tasks.startSession, { taskId: second, recommended: false, swapReason: "Not in the mood" });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: swapped, outcome: "Made progress", contribution: "Some", nextStep: "More", evidence: "" });
    const followed = await asA.mutation(api.tasks.startSession, { taskId: first, recommended: true });
    await asA.mutation(api.tasks.recordSession, { activeSessionId: followed, outcome: "Made progress", contribution: "Some", nextStep: "More", evidence: "" });
    const history = (await asA.query(api.journey.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
    expect(history.map(session => [session.title, session.recommended, session.swapReason])).toEqual([["First", true, undefined], ["Second", false, "Not in the mood"]]);
  });

  it("saves a lane preference that Today applies and reports", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    await asA.mutation(api.tasks.create, { ...task, title: "Project step" });
    await asA.mutation(api.tasks.create, { ...task, title: "Showcase step", lane: "Showcases" });
    expect((await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 2 })).laneFocus).toBeNull();
    await asA.mutation(api.settings.saveLaneFocus, { laneFocus: "Showcases" });
    const overview = await asA.query(api.tasks.todayOverview, { minutes: 60, energy: 2 });
    expect(overview.laneFocus).toBe("Showcases");
    expect(overview.choices[0]).toMatchObject({ lane: "Showcases" });
    await asA.mutation(api.settings.saveLaneFocus, {});
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ laneFocus: null });
  });
});
