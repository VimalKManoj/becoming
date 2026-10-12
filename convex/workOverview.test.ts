import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const ownerA = `${issuer}|user-a`;
const task = { title: "Task", lane: "Showcases" as const, minutes: 30, energy: 2, doneWhen: "It works" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}

describe("Work's overview reads", () => {
  it("lists only open tasks outside any project, in progress first, with their sessions", async () => {
    const { t, asA, asB } = setup();
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    await asA.mutation(api.tasks.create, { ...task, title: "Inside a project", projectId });
    const ready = await asA.mutation(api.tasks.create, { ...task, title: "Magnetic button" });
    const doing = await asA.mutation(api.tasks.create, { ...task, title: "Orb shader study", lane: "Showcases" });
    const done = await asA.mutation(api.tasks.create, { ...task, title: "Finished piece" });
    const blocked = await asA.mutation(api.tasks.create, { ...task, title: "Waiting piece", lane: "Writing" });
    await t.run(async ctx => {
      await ctx.db.patch(doing, { status: "In progress", plannedSessions: 2 });
      await ctx.db.patch(done, { status: "Done" });
      await ctx.db.patch(blocked, { status: "Blocked", nextStep: "Needs a font licence" });
      await ctx.db.insert("sessions", { owner: ownerA, taskId: doing, key: "s1", lane: "Showcases", title: "Orb", outcome: "Made progress", contribution: "Half", nextStep: "More", evidence: "", endedAt: Date.now() });
    });

    const loose = await asA.query(api.tasks.looseOpen, {});
    expect(loose.map(x => [x.title, x.status, x.sessions])).toEqual([
      ["Orb shader study", "In progress", 1], ["Magnetic button", "Ready", 0], ["Waiting piece", "Blocked", 0],
    ]);
    expect(loose[0]).toMatchObject({ plannedSessions: 2, lane: "Showcases" });
    expect(loose.find(x => x._id === ready)?.projectId).toBeUndefined();
    expect(await asB.query(api.tasks.looseOpen, {})).toEqual([]);
  });

  it("lists ideas whose genesis has begun and that aren't projects yet", async () => {
    const { t, asA, asB } = setup();
    const quiet = await asA.mutation(api.ideas.create, { title: "Just a thought", lane: "Projects", notes: "" });
    const film = await asA.mutation(api.ideas.create, { title: "Film desk", lane: "Projects", notes: "Plan a short film" });
    const shipped = await asA.mutation(api.ideas.create, { title: "Became a project", lane: "Projects", notes: "" });
    const treatments = await asA.mutation(api.genesis.addResearch, { ideaId: film, title: "Treatments" });
    await asA.mutation(api.genesis.addSource, { researchId: treatments, title: "A book", kind: "read" });
    await asA.mutation(api.genesis.addSource, { researchId: treatments, title: "A talk", kind: "read" });
    await asA.mutation(api.genesis.addResearch, { ideaId: shipped, title: "Notes" });
    await asA.mutation(api.projects.create, { title: "Shipped", purpose: "It is real now", ideaId: shipped });

    const list = await asA.query(api.genesis.inProgress, {});
    expect(list.map(x => [x.title, x.threads, x.sources, x.report, x.decision])).toEqual([["Film desk", 1, 2, false, null]]);
    expect(list[0]).toMatchObject({ purpose: "Plan a short film" });
    expect(list.some(x => x.id === quiet)).toBe(false);
    expect(await asB.query(api.genesis.inProgress, {})).toEqual([]);
    await t.run(async ctx => { await ctx.db.patch(film, { archivedAt: Date.now() }); });
    expect(await asA.query(api.genesis.inProgress, {})).toEqual([]);
  });
});
