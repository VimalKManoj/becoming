import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { applyPlan } from "./inbox";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const ownerA = `${issuer}|user-a`;
const DAY = 86_400_000;
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}

describe("Journey tracks work, not only focus", () => {
  it("feeds every move, from the app, an assistant or a backfilled plan, with sessions and milestones", async () => {
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Data control" });
    const exportTask = await asA.mutation(api.tasks.create, { ...task, title: "JSON export", milestoneId });
    await asA.mutation(api.tasks.setStatus, { taskId: exportTask, status: "Done", note: "Every record exports" });
    const loose = await asA.mutation(api.tasks.create, { ...task, title: "Orb study", lane: "Showcases" });
    await asA.mutation(api.tasks.setStatus, { taskId: loose, status: "In progress" });
    // A plan brought in later: finished three days ago, recorded now (backfilled), by an assistant.
    const old = await asA.mutation(api.tasks.create, { ...task, title: "Pick Convex", projectId });
    await t.run(async ctx => {
      await ctx.db.patch(old, { status: "Done", completedAt: Date.now() - 3 * DAY });
      await ctx.db.insert("taskEvents", { owner: ownerA, taskId: old, projectId, kind: "done", at: Date.now() - 3 * DAY, source: "Claude Code" });
    });
    // A focus session on the loose task.
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId: loose });
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Made progress", contribution: "Half the shader", nextStep: "Tune the glow", evidence: "" });

    const feed = await asA.query(api.journey.feed, {});
    const kinds = feed.items.map(item => [item.kind, item.title]);
    expect(kinds[0]).toEqual(["focused", "Orb study"]);
    expect(kinds).toContainEqual(["done", "JSON export"]);
    expect(kinds).toContainEqual(["started", "Orb study"]);
    expect(kinds.at(-1)).toEqual(["done", "Pick Convex"]);
    const exported = feed.items.find(item => item.title === "JSON export" && item.kind === "done")!;
    expect(exported).toMatchObject({ project: "Becoming", source: "app", backfilled: false, note: "Every record exports" });
    expect(feed.items.at(-1)).toMatchObject({ source: "Claude Code", backfilled: true, project: "Becoming" });
    expect(feed.items[0]).toMatchObject({ note: "Half the shader", outcome: "Made progress", project: null });
    // The milestone completed when its only task was finished.
    expect(feed.markers.map(m => [m.kind, m.title])).toEqual([["milestone", "Data control"]]);
    expect(feed.next).toBeNull();
    // Paging back in time, and nothing reaches another account.
    const page = await asA.query(api.journey.feed, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next).not.toBeNull();
    const rest = await asA.query(api.journey.feed, { before: page.next!, limit: 60 });
    expect(rest.items.every(item => item.at < page.next!)).toBe(true);
    expect((await asB.query(api.journey.feed, {})).items).toEqual([]);
  });

  it("grows the bloom from finished tasks, with skills inherited from their milestone or phase", async () => {
    const { asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Reliability", skills: ["systems", "Shipping"] });
    const inPhase = await asA.mutation(api.projects.addMilestone, { projectId, title: "Data control" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId: inPhase, phaseId });
    const ownSkills = await asA.mutation(api.projects.addMilestone, { projectId, title: "Ritual" });
    await asA.mutation(api.projects.updateMilestone, { milestoneId: ownSkills, title: "Ritual", skills: ["Visual"] });
    const bare = await asA.mutation(api.projects.addMilestone, { projectId, title: "Notes" });
    const finish = async (milestoneId: typeof bare, title: string, skills?: string[]) => {
      const taskId = await asA.mutation(api.tasks.create, { ...task, title, milestoneId, ...(skills ? { skills } : {}) });
      await asA.mutation(api.tasks.setStatus, { taskId, status: "Done" });
    };
    await finish(inPhase, "Export");                  // inherits the phase: Systems, Shipping
    await finish(ownSkills, "Tokens");                // inherits the milestone: Visual
    await finish(ownSkills, "Copy", ["Writing"]);     // its own skills win
    await finish(bare, "Untagged one");               // nothing to inherit
    await finish(bare, "Untagged two");

    const bloom = await asA.query(api.journey.bloom, { since: Date.now() - DAY });
    const count = (name: string) => bloom.petals.find(p => p.name === name)?.sessions;
    expect([count("Systems"), count("Shipping"), count("Visual"), count("Writing")]).toEqual([1, 1, 1, 1]);
    expect(bloom).toMatchObject({ sessions: 0, finished: 3, finishedInWindow: 5, untagged: 2 });

    const untagged = await asA.query(api.journey.untagged, {});
    expect(untagged).toMatchObject({ total: 2, outside: 0, groups: [{ kind: "milestone", name: "Notes", project: "Becoming", count: 2 }] });
    // Tagging the milestone clears them.
    await asA.mutation(api.projects.updateMilestone, { milestoneId: bare, title: "Notes", skills: ["Writing"] });
    expect((await asA.query(api.journey.untagged, {})).total).toBe(0);
    // Only the eight skills, in their own spelling.
    await expect(asA.mutation(api.constellation.updatePhase, { phaseId, name: "Reliability", skills: ["Painting"] })).rejects.toThrow("isn't one of the skills");
    const phases = (await asA.query(api.constellation.get, { projectId }))!;
    expect(phases.phases[0].name).toBe("Reliability");
  });

  it("gives the week its moves (with lane and backfill) and the day you joined", async () => {
    const { t, asA } = setup();
    await asA.mutation(api.settings.saveMotive, { motive: "Grow" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, title: "Write the post", lane: "Writing" });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "In progress" });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Done" });
    await t.run(async ctx => { await ctx.db.insert("taskEvents", { owner: ownerA, taskId, kind: "done", at: Date.now() - 5 * DAY, source: "Claude Code" }); });

    const overview = await asA.query(api.rhythm.overview, { now: Date.now() });
    expect(overview.work.map(w => [w.kind, w.lane, w.backfilled]).sort()).toEqual([["done", "Writing", false], ["done", "Writing", true], ["started", "Writing", false]]);
    expect(overview.joinedAt).toEqual(expect.any(Number));
  });

  it("lets a plan carry skills, and a re-sent plan adds them where a phase or milestone has none", async () => {
    const { t, asA } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const plan = (skills?: string[]) => ({
      kind: "plan" as const, projectId,
      phases: [{ name: "Reliability", ...(skills ? { skills } : {}), milestones: [{ title: "Data control", ...(skills ? { skills: ["Systems"] } : {}), tasks: [{ ...task, title: "Export", skills: ["Shipping"] }] }] }],
      docs: [],
    });
    await t.run(ctx => applyPlan(ctx, ownerA, plan(), "Claude Code"));
    await t.run(ctx => applyPlan(ctx, ownerA, plan(["Systems", "Shipping"]), "Claude Code"));
    const saved = await t.run(async ctx => ({
      phases: (await ctx.db.query("phases").collect()).map(p => [p.name, p.skills]),
      milestones: (await ctx.db.query("milestones").collect()).map(m => [m.title, m.skills]),
      tasks: (await ctx.db.query("tasks").collect()).map(x => [x.title, x.skills]),
    }));
    expect(saved).toEqual({ phases: [["Reliability", ["Systems", "Shipping"]]], milestones: [["Data control", ["Systems"]]], tasks: [["Export", ["Shipping"]]] });
  });
});
