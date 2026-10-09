import { convexTest, type TestConvexForDataModel } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import schema from "./schema";
import { addDays, weekKey } from "./lib/time";

const modules = import.meta.glob("./**/*.ts");
type Owner = TestConvexForDataModel<DataModel>;
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

// A small workspace with every kind of record and every kind of link.
async function seed(who: Owner) {
  const projectId = await who.mutation(api.projects.create, { title: "Becoming", purpose: "Practice", outcome: "A usable app" });
  const milestoneId = await who.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
  const first = await who.mutation(api.tasks.create, { ...task, title: "First", milestoneId, plannedSessions: 4 });
  const second = await who.mutation(api.tasks.create, { ...task, title: "Second", projectId, dependencies: [first] });
  const ideaId = await who.mutation(api.ideas.create, { title: "Reading corner", lane: "Writing", notes: "Calm" });
  await who.mutation(api.ideas.update, { ideaId, title: "Reading corner", lane: "Writing", notes: "Calm", brainstorm: { problem: "Articles get lost" } });
  await who.mutation(api.ideas.activate, { ideaId, title: "Outline it", minutes: 30, energy: 1, doneWhen: "An outline" });
  const activeSessionId = await who.mutation(api.tasks.startSession, { taskId: first, recommended: true });
  await who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Built it", nextStep: "", evidence: "https://example.test/demo" });
  const week = weekKey(Date.now(), "UTC");
  await who.mutation(api.rhythm.setRhythm, { timezone: "UTC", weeklyTarget: 3, currentWeek: week });
  await who.mutation(api.rhythm.saveReflection, { week, learning: "Smaller steps", intention: "Write" });
  await who.mutation(api.settings.saveMotive, { motive: "Build thoughtful work" });
  await who.mutation(api.tasks.pin, { taskId: second });
  const [artifact] = (await who.query(api.proof.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
  await who.mutation(api.proof.setCandidate, { artifactId: artifact._id, portfolioCandidate: true });
  // The constellation: phases, a milestone in a phase, a doc feeding phases, and genesis.
  const phaseId = await who.mutation(api.constellation.addPhase, { projectId, name: "Foundations", goal: "Solid ground" });
  await who.mutation(api.constellation.addPhase, { projectId, name: "Reliability" });
  await who.mutation(api.constellation.setMilestonePhase, { milestoneId, phaseId });
  await who.mutation(api.constellation.addDoc, { projectId, code: "PRD", title: "Product", link: "documents/PRD.md", sections: 6, phaseIds: [phaseId] });
  const researchId = await who.mutation(api.genesis.addResearch, { ideaId, title: "Do evenings work?" });
  await who.mutation(api.genesis.addSource, { researchId, title: "Deep Work", kind: "read", url: "https://example.test/dw" });
  await who.mutation(api.genesis.saveReport, { ideaId, title: "Findings", findings: [{ text: "Short sessions stick", basis: "Deep Work" }] });
  await who.mutation(api.genesis.setDecision, { ideaId, verdict: "Build it", kept: ["Timer"] });
  return { week };
}

describe("export and restore", () => {
  it("round-trips a workspace into an empty account with every link rebuilt", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const { week } = await seed(asA);
    const backup = await asA.query(api.data.exportAll, {});
    expect(backup).toMatchObject({ format: "becoming-backup", version: 1 });
    expect(backup.tasks).toHaveLength(3);
    expect(JSON.stringify(backup)).not.toContain("user-a");

    expect(await asB.query(api.data.isEmpty, {})).toBe(true);
    expect(await asB.mutation(api.data.importBackup, { backup })).toMatchObject({ tasks: 3, sessions: 1, ideas: 1, projects: 1, milestones: 1, artifacts: 1, weeks: 1, reflections: 1, phases: 2, docs: 1, research: 1, reports: 1 });
    const restored = await asB.query(api.data.exportAll, {});
    const byTitle = (title: string) => restored.tasks.find(item => item.title === title)!;
    expect(byTitle("First").milestoneId).toBe(restored.milestones[0].id);
    expect(byTitle("First").projectId).toBe(restored.projects[0].id);
    expect(byTitle("Second").dependencies).toEqual([byTitle("First").id]);
    expect(restored.ideas[0]).toMatchObject({ taskId: byTitle("Outline it").id, brainstorm: { problem: "Articles get lost" } });
    expect(restored.sessions[0]).toMatchObject({ taskId: byTitle("First").id, projectId: restored.projects[0].id, contribution: "Built it", recommended: true });
    expect(restored.artifacts[0]).toMatchObject({ sessionId: restored.sessions[0].id, url: "https://example.test/demo", portfolioCandidate: true });
    expect(restored.profile).toMatchObject({ motive: "Build thoughtful work", timezone: "UTC", pinnedTaskId: byTitle("Second").id });
    expect(restored.weeklyCommitments).toEqual([{ week, target: 3, paused: false }]);
    expect(restored.reflections).toEqual([{ week, learning: "Smaller steps", intention: "Write" }]);
    // The milestone's completion survives, and the original account is untouched.
    // A backed-up completion date survives, so a "first milestone" keeps its real day.
    expect(restored.milestones[0].completedAt).toBe(backup.milestones[0].completedAt);
    expect((await asA.query(api.data.exportAll, {})).tasks).toHaveLength(3);

    // The constellation comes back with its links: phases, the milestone's phase, the doc's feeds, genesis.
    expect(byTitle("First").plannedSessions).toBe(4);
    const foundations = restored.phases.find(p => p.name === "Foundations")!;
    expect(restored.phases.map(p => [p.name, p.projectId])).toEqual([["Foundations", restored.projects[0].id], ["Reliability", restored.projects[0].id]]);
    expect(restored.milestones[0].phaseId).toBe(foundations.id);
    expect(restored.projectDocs).toEqual([expect.objectContaining({ code: "PRD", link: "documents/PRD.md", sections: 6, phaseIds: [foundations.id], source: "app", writtenAt: backup.projectDocs[0].writtenAt })]);
    expect(restored.research).toEqual([expect.objectContaining({ ideaId: restored.ideas[0].id, title: "Do evenings work?", sources: [expect.objectContaining({ title: "Deep Work", kind: "read", by: "app" })] })]);
    expect(restored.reports).toEqual([expect.objectContaining({ ideaId: restored.ideas[0].id, findings: [{ text: "Short sessions stick", basis: "Deep Work" }], decision: expect.objectContaining({ verdict: "Build it", kept: ["Timer"] }) })]);
    const map = await asB.query(api.constellation.get, { projectId: restored.projects[0].id });
    expect(map!.phases[0].milestones[0].tasks.map(item => item.code)).toEqual(["0A·1"]);
    expect((await asB.query(api.genesis.forIdea, { ideaId: restored.ideas[0].id }))!.report!.decision).toMatchObject({ verdict: "Build it" });
  });

  it("restores a backup made before the constellation", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await seed(asA);
    const backup = await asA.query(api.data.exportAll, {});
    type Older = Omit<typeof backup, "phases" | "projectDocs" | "research" | "reports"> & Partial<Pick<typeof backup, "phases" | "projectDocs" | "research" | "reports">>;
    const old: Older = { ...backup, milestones: backup.milestones.map(m => ({ ...m, phaseId: undefined })) };
    for (const key of ["phases", "projectDocs", "research", "reports"] as const) delete old[key];
    expect(Object.keys(old)).not.toContain("phases");
    expect(await asB.mutation(api.data.importBackup, { backup: old })).toMatchObject({ tasks: 3, phases: 0, docs: 0, research: 0, reports: 0 });
  });

  it("refuses duplicates, other formats and versions, and broken links without writing anything", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await seed(asA);
    const backup = await asA.query(api.data.exportAll, {});
    await expect(asA.mutation(api.data.importBackup, { backup })).rejects.toThrow("empty workspace");
    await expect(asB.mutation(api.data.importBackup, { backup: { ...backup, format: "something-else" } })).rejects.toThrow("isn't a Becoming backup");
    await expect(asB.mutation(api.data.importBackup, { backup: { ...backup, version: 2 } })).rejects.toThrow("version 2");
    const broken = { ...backup, tasks: backup.tasks.map(item => item.title === "First" ? { ...item, milestoneId: "missing-milestone" } : item) };
    await expect(asB.mutation(api.data.importBackup, { backup: broken })).rejects.toThrow("missing milestone");
    expect(await asB.query(api.data.isEmpty, {})).toBe(true);
    expect(await t.run(ctx => ctx.db.query("projects").collect())).toHaveLength(1);
  });

  it("rejects an unsafe link inside a backup", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await seed(asA);
    const backup = await asA.query(api.data.exportAll, {});
    const unsafe = { ...backup, artifacts: backup.artifacts.map(item => ({ ...item, url: "javascript:alert(1)" })) };
    await expect(asB.mutation(api.data.importBackup, { backup: unsafe })).rejects.toThrow("HTTP or HTTPS");
    expect(await asB.query(api.data.isEmpty, {})).toBe(true);
  });

  it("applies the same rules as the forms, and checks rules that span records", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await seed(asA);
    const backup = await asA.query(api.data.exportAll, {});
    const refused = async (changed: typeof backup, message: string) => {
      await expect(asB.mutation(api.data.importBackup, { backup: changed })).rejects.toThrow(message);
      expect(await asB.query(api.data.isEmpty, {})).toBe(true);
    };
    const first = backup.tasks.find(item => item.title === "First")!;
    const second = backup.tasks.find(item => item.title === "Second")!;
    await refused({ ...backup, tasks: backup.tasks.map(item => item.id === first.id ? { ...item, dependencies: [second.id] } : item) }, "in a loop");
    await refused({ ...backup, tasks: backup.tasks.map(item => item.id === first.id ? { ...item, dependencies: [first.id] } : item) }, "waits on itself");
    await refused({ ...backup, tasks: backup.tasks.map(item => item.id === first.id ? { ...item, smallerStep: "Only one field" } : item) }, "all three smaller-step fields");
    await refused({ ...backup, ideas: backup.ideas.map(item => ({ ...item, brainstorm: { references: ["javascript:alert(1)"] } })) }, "HTTP or HTTPS");
    await refused({ ...backup, ideas: backup.ideas.map(item => ({ ...item, notes: "x".repeat(10001) })) }, "under 10,000");
    await refused({ ...backup, artifacts: backup.artifacts.map(item => ({ ...item, status: "Published" as const, publishedUrl: "https://example.test/post" })) }, "link and date");
    await refused({ ...backup, artifacts: backup.artifacts.map(item => ({ ...item, status: "Published" as const, publishedUrl: "https://example.test/post", publishedOn: "2026-02-30" })) }, "publication date");
    await refused({ ...backup, artifacts: backup.artifacts.map(item => ({ ...item, status: "Published" as const, publishedUrl: "https://example.test/post", publishedOn: "2999-01-01" })) }, "in the future");
    // Backup IDs are plain strings in a file; the cast only satisfies the exported type.
    const otherProject = { ...backup.projects[0], id: "other-project" as (typeof backup.projects)[number]["id"], ideaId: undefined };
    await refused({ ...backup, projects: [...backup.projects, otherProject], tasks: backup.tasks.map(item => item.id === first.id ? { ...item, projectId: otherProject.id } : item) }, "milestone belongs to another project");
    await refused({ ...backup, ideas: backup.ideas.map(item => ({ ...item, taskId: first.id })) }, "another idea's task");
    await refused({ ...backup, weeklyCommitments: [...backup.weeklyCommitments, ...backup.weeklyCommitments] }, "same week");
    await refused({ ...backup, reflections: [...backup.reflections, ...backup.reflections] }, "same week");
    await refused({ ...backup, profile: { ...backup.profile!, timezone: "not a zone!" } }, "invalid timezone");
    // The constellation's links stay inside one project, and its values follow the app's rules.
    const otherPhase = { ...backup.phases[0], id: "other-phase" as (typeof backup.phases)[number]["id"], projectId: otherProject.id };
    await refused({ ...backup, projects: [...backup.projects, otherProject], phases: [...backup.phases, otherPhase], milestones: backup.milestones.map(m => ({ ...m, phaseId: otherPhase.id })) }, "phase belongs to another project");
    await refused({ ...backup, projects: [...backup.projects, otherProject], phases: [...backup.phases, otherPhase], projectDocs: backup.projectDocs.map(d => ({ ...d, phaseIds: [otherPhase.id] })) }, "another project's phase");
    await refused({ ...backup, projectDocs: backup.projectDocs.map(d => ({ ...d, phaseIds: ["missing-phase" as (typeof d.phaseIds)[number]] })) }, "missing phase");
    await refused({ ...backup, projectDocs: [...backup.projectDocs, ...backup.projectDocs] }, "same code");
    await refused({ ...backup, projectDocs: backup.projectDocs.map(d => ({ ...d, link: "javascript:alert(1)" })) }, "HTTP or HTTPS");
    await refused({ ...backup, reports: [...backup.reports, ...backup.reports] }, "two reports for the same idea");
    await refused({ ...backup, research: backup.research.map(r => ({ ...r, sources: r.sources.map(x => ({ ...x, url: "javascript:alert(1)" })) })) }, "HTTP or HTTPS");
    await refused({ ...backup, tasks: backup.tasks.map(item => ({ ...item, plannedSessions: 500 })) }, "1 to 100");

    // A smaller-step session title can be up to 1000 characters, as recording allows.
    const long = "s".repeat(900);
    // A milestone's completion is checked against its tasks: a missing date is filled in.
    const accepted = { ...backup, sessions: backup.sessions.map(item => ({ ...item, title: long })), artifacts: backup.artifacts.map(item => ({ ...item, title: long })), milestones: backup.milestones.map(item => ({ ...item, completedAt: undefined })) };
    await asB.mutation(api.data.importBackup, { backup: accepted });
    const restored = await asB.query(api.data.exportAll, {});
    expect(restored.sessions[0].title).toBe(long);
    expect(restored.milestones[0].completedAt).toEqual(expect.any(Number));
  });
});

describe("deleting workspace data", () => {
  it("deletes everything the account owns in batches, including screenshots, and nothing else", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    await seed(asA);
    await seed(asB);
    const [artifact] = await t.run(ctx => ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", "https://auth.example.test|user-a")).collect());
    const image = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["png"], { type: "image/png" }));
      await (ctx.db as unknown as { patch: (id: unknown, value: unknown) => Promise<void> }).patch(id, { contentType: "image/png" });
      return id;
    });
    await asA.mutation(api.proof.attachImage, { artifactId: artifact._id, storageId: image });
    // More records than one batch holds, so the loop needs several calls.
    await t.run(async ctx => {
      for (let i = 0; i < 450; i += 1) await ctx.db.insert("ideas", { owner: "https://auth.example.test|user-a", title: `Idea ${i}`, notes: "", lane: "Projects" });
    });
    let rounds = 0;
    for (let done = false; !done; rounds += 1) done = (await asA.mutation(api.data.deleteBatch, {})).done;
    expect(rounds).toBeGreaterThan(1);
    expect(await asA.query(api.data.isEmpty, {})).toBe(true);
    // The profile is gone; the account looks brand new again.
    expect(await asA.query(api.settings.getProfile, {})).toMatchObject({ motive: "", needsOnboarding: true });
    expect(await t.run(ctx => ctx.db.system.get(image))).toBeNull();
    const remaining = await asB.query(api.data.exportAll, {});
    const gone = await asA.query(api.data.exportAll, {});
    expect([gone.phases, gone.projectDocs, gone.research, gone.reports]).toEqual([[], [], [], []]);
    expect([remaining.phases.length, remaining.projectDocs.length, remaining.research.length, remaining.reports.length]).toEqual([2, 1, 1, 1]);
    expect(remaining.tasks).toHaveLength(3);
    expect(remaining.sessions).toHaveLength(1);
    expect(addDays(remaining.weeklyCommitments[0].week, 0)).toBe(remaining.weeklyCommitments[0].week);
  });
});
