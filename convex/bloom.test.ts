import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

describe("Mind Bloom and the proof pipeline", () => {
  it("grows petals from skills tagged in recaps and on evidence, privately", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    const record = async (who: typeof asA, lane: "Projects" | "Showcases", skills?: string[], evidence = "") => {
      const taskId = await who.mutation(api.tasks.create, { ...task, lane });
      const activeSessionId = await who.mutation(api.tasks.startSession, { taskId });
      return who.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence, ...(skills ? { skills } : {}) });
    };
    const since = Date.now() - 60_000;
    await record(asA, "Projects", [" Frontend ", "frontend", "Motion"]);
    await record(asA, "Showcases", ["Motion"], "https://example.test/clip");
    await record(asA, "Projects");
    await record(asB, "Projects", ["Secret skill"]);
    // Skills tagged later on the evidence count for its session, once.
    const [artifact] = (await asA.query(api.proof.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
    await asA.mutation(api.proof.update, { artifactId: artifact._id, title: artifact.title, url: artifact.url, notes: "", skills: ["Motion", "Interaction"] });

    const bloom = await asA.query(api.journey.bloom, { since });
    const count = (name: string) => bloom.petals.find(petal => petal.name === name)?.sessions;
    // Always the eight skills; counts come only from your own sessions in the window.
    expect(bloom.petals).toHaveLength(8);
    expect([count("Motion"), count("Frontend"), count("Interaction"), count("Writing")]).toEqual([2, 1, 1, 0]);
    expect(bloom).toMatchObject({ sessions: 3, tagged: 2 });
    // Nothing from before the window counts, and `until` closes it (a past month alone).
    expect((await asA.query(api.journey.bloom, { since: Date.now() + 60_000 })).sessions).toBe(0);
    expect((await asA.query(api.journey.bloom, { since, until: since + 1 })).sessions).toBe(0);
    // Journey shows the skills on each session and on its evidence.
    const history = (await asA.query(api.journey.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
    expect(history.map(session => session.skills)).toEqual([[], ["Motion"], ["Frontend", "Motion"]]);
    expect(history[1].artifacts[0].skills).toEqual(["Motion", "Interaction"]);
    // A tag outside the eight skills doesn't bloom, and A's sessions never reach B.
    expect((await asB.query(api.journey.bloom, { since })).tagged).toBe(0);
    // The contributions graph gets every end time in the window.
    expect(await asA.query(api.journey.activity, { since })).toHaveLength(3);
  });

  it("limits skills per recap and keeps them in backups", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const taskId = await asA.mutation(api.tasks.create, task);
    const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
    await expect(asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence: "", skills: ["a", "b", "c", "d", "e", "f"] })).rejects.toThrow("up to 5");
    await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence: "", skills: ["Systems"] });
    const backup = await asA.query(api.data.exportAll, {});
    expect(backup.sessions[0].skills).toEqual(["Systems"]);
  });

  it("counts the proof pipeline and names the piece closest to publishing", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    expect(await asA.query(api.proof.pipeline, {})).toEqual({ draft: 0, ready: 0, published: 0, next: null });
    for (const url of ["https://example.test/a", "https://example.test/b"]) {
      const taskId = await asA.mutation(api.tasks.create, task);
      const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
      await asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence: url });
    }
    const [newest, older] = (await asA.query(api.proof.listPage, { paginationOpts: { numItems: 5, cursor: null } })).page;
    await asA.mutation(api.proof.setStatus, { artifactId: older._id, status: "Ready to share" });
    expect(await asA.query(api.proof.pipeline, {})).toMatchObject({ draft: 1, ready: 1, published: 0, next: { _id: older._id, status: "Ready to share", imageUrl: null } });
    expect(newest.status).toBe("Draft");
  });
});
