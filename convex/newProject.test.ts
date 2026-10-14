import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// The New project page: the whole project, made in one go.

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";

const plan = {
  title: "Film desk", purpose: "Plan a short film from treatment to shot list.",
  docs: [{ code: "trt", title: "Treatment" }, { code: "SCR", title: "Script" }],
  phases: [
    { name: "Development", goal: "A story worth shooting", doneWhen: "Script locked", notes: "Keep it under ten minutes.", docCodes: ["TRT", "SCR"],
      milestones: [
        { title: "Treatment locked", doneWhen: "A friend can retell it", notes: "Two pages max", tasks: [{ title: "Write the logline", minutes: 30 }, { title: "First treatment draft", minutes: 90 }] },
        { title: "Script draft", tasks: [] },
      ] },
    { name: "Production", milestones: [{ title: "Shoot days", tasks: [{ title: "Book the location", minutes: 45 }] }] },
  ],
};

describe("creating a project from the New project page", () => {
  it("makes the project, docs, phases, milestones and tasks together, linked", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    const { projectId, firstTaskId } = await asA.mutation(api.newProject.create, { ...plan, lane: "Projects" });

    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.project).toMatchObject({ title: "Film desk", purpose: plan.purpose });
    expect(map.phases.map(p => [p.num, p.name, p.goal, p.doneWhen, p.notes])).toEqual([
      ["00", "Development", "A story worth shooting", "Script locked", "Keep it under ten minutes."], ["01", "Production", "", "", ""],
    ]);
    expect(map.phases[0].milestones.map(m => [m.code, m.title, m.doneWhen, m.notes, m.tasks.length])).toEqual([
      ["0A", "Treatment locked", "A friend can retell it", "Two pages max", 2], ["0B", "Script draft", "", "", 0],
    ]);
    expect(map.phases[1].milestones.map(m => m.title)).toEqual(["Shoot days"]);
    // Docs start planned and feed the phases chosen for them.
    expect(map.docs.map(d => [d.code, d.title, d.writtenAt, d.feeds])).toEqual([["TRT", "Treatment", null, ["00"]], ["SCR", "Script", null, ["00"]]]);
    const first = await asA.query(api.tasks.get, { taskId: firstTaskId! });
    expect(first).toMatchObject({ title: "Write the logline", minutes: 30, energy: 2, doneWhen: "", status: "Ready", lane: "Projects", projectId });
  });

  it("starts from an idea, making it active, and refuses one already used", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    const asB = t.withIdentity({ subject: "user-b", issuer });
    const ideaId = await asA.mutation(api.ideas.create, { title: "Film desk", notes: "Plan short films", lane: "Projects" });
    expect((await asA.query(api.newProject.ideas, {})).map(i => i.title)).toEqual(["Film desk"]);
    await expect(asB.mutation(api.newProject.create, { ...plan, ideaId })).rejects.toThrow();
    const { projectId, firstTaskId } = await asA.mutation(api.newProject.create, { ...plan, ideaId });
    expect((await t.run(ctx => ctx.db.get(projectId)))!.ideaId).toBe(ideaId);
    expect((await t.run(ctx => ctx.db.get(ideaId)))!.taskId).toBe(firstTaskId);
    expect(await asA.query(api.newProject.ideas, {})).toEqual([]);
    await expect(asA.mutation(api.newProject.create, { ...plan, ideaId })).rejects.toThrow("already active");
  });

  it("needs a name and why, and keeps within the limits", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer });
    await expect(asA.mutation(api.newProject.create, { ...plan, purpose: " " })).rejects.toThrow();
    const many = Array.from({ length: 41 }, (_, i) => ({ name: `P${i}`, milestones: [] }));
    await expect(asA.mutation(api.newProject.create, { ...plan, phases: many })).rejects.toThrow("40 phases");
    // A failed create leaves nothing behind.
    expect(await t.run(ctx => ctx.db.query("projects").collect())).toEqual([]);
  });
});
