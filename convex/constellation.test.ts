import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
type Who = ReturnType<typeof setup>["asA"];

const project = (who: Who, title = "Becoming", ideaId?: Id<"ideas">) => who.mutation(api.projects.create, { title, purpose: "Practice", ...(ideaId ? { ideaId } : {}) });
const phasesOf = async (who: Who, projectId: Id<"projects">) => (await who.query(api.constellation.get, { projectId }))!.phases.map(p => [p.num, p.name]);

describe("the constellation: owner isolation", () => {
  it("never shows or changes another person's map", async () => {
    const { asA, asB } = setup();
    const projectId = await project(asA);
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable" });
    const taskId = await asA.mutation(api.tasks.create, { ...task, milestoneId });
    const docId = await asA.mutation(api.constellation.addDoc, { projectId, code: "PRD", title: "Product", phaseIds: [phaseId] });

    expect(await asB.query(api.constellation.get, { projectId })).toBeNull();
    expect(await asB.query(api.constellation.taskStory, { taskId })).toBeNull();
    await expect(asB.mutation(api.constellation.addPhase, { projectId, name: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.updatePhase, { phaseId, name: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.movePhase, { phaseId, direction: 1 })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.removePhase, { phaseId })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId: null })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.addDoc, { projectId, code: "SYS", title: "System" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.updateDoc, { docId, code: "PRD", title: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.constellation.removeDoc, { docId })).rejects.toThrow("not found");
    // B's own project can't borrow A's phase.
    const other = await project(asB, "B's");
    await expect(asB.mutation(api.constellation.addDoc, { projectId: other, code: "PRD", title: "Product", phaseIds: [phaseId] })).rejects.toThrow("not found");

    const map = await asA.query(api.constellation.get, { projectId });
    expect(map!.phases.map(p => p.name)).toEqual(["Foundations"]);
    expect(map!.docs.map(d => d.title)).toEqual(["Product"]);
    expect(await asA.query(api.constellation.taskStory, { taskId })).toEqual([expect.objectContaining({ kind: "created", source: "app" })]);
  });
});

describe("phases", () => {
  it("adds in order, updates, moves and removes, keeping milestones and clearing doc links", async () => {
    const { asA } = setup();
    const projectId = await project(asA);
    const first = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations", goal: "Solid ground" });
    const second = await asA.mutation(api.constellation.addPhase, { projectId, name: "Reliability" });
    const third = await asA.mutation(api.constellation.addPhase, { projectId, name: "Real use" });
    expect(await phasesOf(asA, projectId)).toEqual([["00", "Foundations"], ["01", "Reliability"], ["02", "Real use"]]);
    await expect(asA.mutation(api.constellation.addPhase, { projectId, name: "  " })).rejects.toThrow("between 1 and 120");

    await asA.mutation(api.constellation.updatePhase, { phaseId: second, name: "Reliability & real use", nextStep: "Log ten evenings", doneWhen: "Ten evenings logged" });
    await asA.mutation(api.constellation.movePhase, { phaseId: third, direction: -1 });
    // Moving past either end does nothing.
    await asA.mutation(api.constellation.movePhase, { phaseId: first, direction: -1 });
    expect(await phasesOf(asA, projectId)).toEqual([["00", "Foundations"], ["01", "Real use"], ["02", "Reliability & real use"]]);
    const moved = (await asA.query(api.constellation.get, { projectId }))!.phases[2];
    expect(moved).toMatchObject({ nextStep: "Log ten evenings", doneWhen: "Ten evenings logged", goal: "" });

    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Ten evenings" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId: second });
    await asA.mutation(api.tasks.create, { ...task, milestoneId });
    const docId = await asA.mutation(api.constellation.addDoc, { projectId, code: "QA", title: "QA plan", phaseIds: [second, first] });
    await asA.mutation(api.constellation.removePhase, { phaseId: second });

    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.phases.map(p => p.name)).toEqual(["Foundations", "Real use"]);
    expect(map.loose.milestones).toEqual([expect.objectContaining({ id: milestoneId, code: "A", total: 1 })]);
    expect(map.docs.find(d => d.id === docId)).toMatchObject({ phaseIds: [String(first)], feeds: ["00"] });
  });

  it("refuses a milestone's phase from another project, and can take it out of any phase", async () => {
    const { asA } = setup();
    const one = await project(asA, "One");
    const two = await project(asA, "Two");
    const phaseOfTwo = await asA.mutation(api.constellation.addPhase, { projectId: two, name: "Elsewhere" });
    const phaseOfOne = await asA.mutation(api.constellation.addPhase, { projectId: one, name: "Here" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId: one, title: "Usable" });
    await expect(asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId: phaseOfTwo })).rejects.toThrow("another project");
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId: phaseOfOne });
    expect((await asA.query(api.constellation.get, { projectId: one }))!.phases[0].milestones.map(m => m.id)).toEqual([milestoneId]);
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId: null });
    const map = (await asA.query(api.constellation.get, { projectId: one }))!;
    expect(map.phases[0].milestones).toEqual([]);
    expect(map.loose.milestones.map(m => m.id)).toEqual([milestoneId]);
  });
});

describe("docs", () => {
  it("checks codes, uniqueness, links, sections and the phases a doc feeds", async () => {
    const { asA } = setup();
    const projectId = await project(asA);
    const otherProject = await project(asA, "Other");
    const otherPhase = await asA.mutation(api.constellation.addPhase, { projectId: otherProject, name: "Theirs" });
    const add = (fields: Partial<{ code: string; title: string; link: string; sections: number; phaseIds: Id<"phases">[]; written: boolean }>) =>
      asA.mutation(api.constellation.addDoc, { projectId, code: "DOC", title: "A doc", ...fields });

    await expect(add({ code: "TOOLONG" })).rejects.toThrow("1 to 4 letters");
    await expect(add({ code: "P-1" })).rejects.toThrow("1 to 4 letters");
    await expect(add({ link: "javascript:alert(1)" })).rejects.toThrow("HTTP or HTTPS");
    await expect(add({ link: "data:text/html,hi" })).rejects.toThrow("HTTP or HTTPS");
    await expect(add({ link: "//evil.example/x" })).rejects.toThrow("HTTP or HTTPS");
    await expect(add({ link: "https://" })).rejects.toThrow("HTTP or HTTPS");
    await expect(add({ link: "my docs/PRD.md" })).rejects.toThrow("no spaces");
    await expect(add({ sections: 1000 })).rejects.toThrow("0 to 999");
    await expect(add({ sections: 2.5 })).rejects.toThrow("0 to 999");
    await expect(add({ phaseIds: [otherPhase] })).rejects.toThrow("its own project");

    const prd = await add({ code: " prd ", title: "Product requirements", link: "documents/PRD.md", sections: 9 });
    const api_ = await add({ code: "API", title: "API & MCP", link: "https://example.test/api", written: false });
    await expect(add({ code: "PRD" })).rejects.toThrow("already has a doc coded PRD");
    await expect(asA.mutation(api.constellation.updateDoc, { docId: api_, code: "prd", title: "API" })).rejects.toThrow("already has a doc coded PRD");

    let docs = (await asA.query(api.constellation.get, { projectId }))!.docs;
    expect(docs.find(d => d.id === prd)).toMatchObject({ code: "PRD", link: "documents/PRD.md", sections: 9, writtenAt: expect.any(Number), source: "app" });
    expect(docs.find(d => d.id === api_)).toMatchObject({ code: "API", writtenAt: null });

    await asA.mutation(api.constellation.updateDoc, { docId: api_, code: "API", title: "API & MCP", written: true });
    await asA.mutation(api.constellation.updateDoc, { docId: prd, code: "PRD", title: "Product requirements", written: false });
    docs = (await asA.query(api.constellation.get, { projectId }))!.docs;
    expect(docs.find(d => d.id === api_)!.writtenAt).toEqual(expect.any(Number));
    expect(docs.find(d => d.id === prd)!.writtenAt).toBeNull();
    await asA.mutation(api.constellation.removeDoc, { docId: prd });
    expect((await asA.query(api.constellation.get, { projectId }))!.docs.map(d => d.code)).toEqual(["API"]);
  });
});

describe("the map (constellation.get)", () => {
  it("derives codes, progress, loose work, doc feeds, genesis and activity from records", async () => {
    const { asA } = setup();
    const ideaId = await asA.mutation(api.ideas.create, { title: "A calmer tracker", lane: "Projects", notes: "Evenings only" });
    const projectId = await project(asA, "Becoming", ideaId);
    const p0 = await asA.mutation(api.constellation.addPhase, { projectId, name: "Foundations" });
    const p1 = await asA.mutation(api.constellation.addPhase, { projectId, name: "Reliability" });
    await asA.mutation(api.constellation.addPhase, { projectId, name: "Later" });
    const m0a = await asA.mutation(api.projects.addMilestone, { projectId, title: "Schema" });
    const m0b = await asA.mutation(api.projects.addMilestone, { projectId, title: "Auth" });
    const m1a = await asA.mutation(api.projects.addMilestone, { projectId, title: "Ten evenings" });
    const loose = await asA.mutation(api.projects.addMilestone, { projectId, title: "Someday" });
    for (const [m, p] of [[m0a, p0], [m0b, p0], [m1a, p1]] as const) await asA.mutation(api.constellation.setMilestonePhase, { milestoneId: m, phaseId: p });

    const t1 = await asA.mutation(api.tasks.create, { ...task, title: "Tables", milestoneId: m0a, plannedSessions: 3 });
    const t2 = await asA.mutation(api.tasks.create, { ...task, title: "Indexes", milestoneId: m0a });
    await asA.mutation(api.tasks.create, { ...task, title: "Sign in", milestoneId: m0b });
    const t4 = await asA.mutation(api.tasks.create, { ...task, title: "Evening one", milestoneId: m1a });
    await asA.mutation(api.tasks.create, { ...task, title: "Maybe", milestoneId: loose });
    await asA.mutation(api.tasks.create, { ...task, title: "Stray", projectId });
    const archived = await asA.mutation(api.tasks.create, { ...task, title: "Gone", projectId });
    await asA.mutation(api.tasks.archive, { taskId: archived });
    await asA.mutation(api.tasks.setStatus, { taskId: t1, status: "Done", note: "Tables in." });
    await asA.mutation(api.tasks.setStatus, { taskId: t2, status: "In progress" });
    await asA.mutation(api.tasks.setStatus, { taskId: t4, status: "Blocked", note: "Waiting on a real evening" });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "SYS", title: "System design", phaseIds: [p0, p1] });
    await asA.mutation(api.constellation.addDoc, { projectId, code: "UI", title: "UI flow", written: false });

    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.project).toMatchObject({ id: projectId, title: "Becoming", status: "Active" });
    expect(map.phases.map(p => [p.num, p.name, p.done, p.total, p.pct, p.state])).toEqual([
      ["00", "Foundations", 1, 3, 33, "active"], ["01", "Reliability", 0, 1, 0, "active"], ["02", "Later", 0, 0, 0, "ahead"],
    ]);
    const foundations = map.phases[0];
    expect(foundations.milestones.map(m => [m.code, m.title, m.tasks.map(t => [t.code, t.title, t.state])])).toEqual([
      ["0A", "Schema", [["0A·1", "Tables", "done"], ["0A·2", "Indexes", "doing"]]],
      ["0B", "Auth", [["0B·1", "Sign in", "ready"]]],
    ]);
    expect(foundations.milestones[0].tasks[0]).toMatchObject({ plannedSessions: 3, sessions: 0, completedAt: expect.any(Number) });
    expect(foundations.startedAt).toEqual(expect.any(Number));
    expect(foundations.endedAt).toBeNull();
    expect(map.phases[1].milestones[0].tasks[0]).toMatchObject({ code: "1A·1", state: "blocked", blockedAt: expect.any(Number), nextStep: "Waiting on a real evening" });
    expect(map.loose.milestones.map(m => [m.code, m.title, m.tasks.map(t => t.code)])).toEqual([["A", "Someday", ["A·1"]]]);
    expect(map.loose.tasks.map(t => [t.code, t.title])).toEqual([["·1", "Stray"]]);
    expect(map.docs.map(d => [d.code, d.feeds, d.tasksInformed, d.writtenAt === null])).toEqual([["SYS", ["00", "01"], 4, false], ["UI", [], 0, true]]);
    expect(map.genesis).toMatchObject({ idea: { id: ideaId, title: "A calmer tracker" }, research: [], report: null, decision: null });
    expect(map.stats).toMatchObject({ total: 6, done: 1, doing: 1, blocked: 1, phases: 3, phasesDone: 0, docs: 2 });
    // Activity comes from taskEvents, newest first, with each task's code.
    expect(map.activity[0]).toMatchObject({ kind: "blocked", taskCode: "1A·1", source: "app", note: "Waiting on a real evening" });
    expect(map.activity.map(a => a.kind)).toEqual(expect.arrayContaining(["created", "done", "started", "blocked", "archived"]));
    expect(map.timeline.start).toBeLessThanOrEqual(map.timeline.now);
  });

  it("works for a project with no phases, docs or idea", async () => {
    const { asA } = setup();
    const projectId = await project(asA);
    await asA.mutation(api.tasks.create, { ...task, projectId });
    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map).toMatchObject({ phases: [], docs: [], genesis: { idea: null, research: [], report: null, decision: null }, stats: { total: 1, phases: 0 } });
    expect(map.loose.tasks).toHaveLength(1);
  });

  it("dates a finished phase by its last finished task", async () => {
    const { asA } = setup();
    const projectId = await project(asA);
    const phaseId = await asA.mutation(api.constellation.addPhase, { projectId, name: "Done one" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "M" });
    await asA.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
    const taskId = await asA.mutation(api.tasks.create, { ...task, milestoneId });
    await asA.mutation(api.tasks.setStatus, { taskId, status: "Done" });
    const phase = (await asA.query(api.constellation.get, { projectId }))!.phases[0];
    expect(phase).toMatchObject({ state: "done", pct: 100, endedAt: expect.any(Number) });
  });
});
