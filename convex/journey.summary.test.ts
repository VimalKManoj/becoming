import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const task = { title: "Task", lane: "Projects" as const, minutes: 30, energy: 2, doneWhen: "It works" };

describe("lifetime counts and firsts", () => {
  it("derives each first once from its record, in time order, privately", async () => {
    const t = convexTest(schema, modules);
    const asA = t.withIdentity({ subject: "user-a", issuer: "https://auth.example.test" });
    const asB = t.withIdentity({ subject: "user-b", issuer: "https://auth.example.test" });
    expect(await asA.query(api.journey.summary, {})).toEqual({ lifetime: { sessions: 0, evidence: 0, published: 0, milestones: 0 }, firsts: [] });

    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice" });
    const milestoneId = await asA.mutation(api.projects.addMilestone, { projectId, title: "Usable Today" });
    const projectTask = await asA.mutation(api.tasks.create, { ...task, title: "Focus card", milestoneId });
    const showcase = await asA.mutation(api.tasks.create, { ...task, title: "Card demo", lane: "Showcases" });
    const record = async (taskId: typeof showcase, evidence = "") => {
      const activeSessionId = await asA.mutation(api.tasks.startSession, { taskId });
      return asA.mutation(api.tasks.recordSession, { activeSessionId, outcome: "Finished", contribution: "Done", nextStep: "", evidence });
    };
    await record(projectTask);
    await record(showcase, "https://example.test/demo");
    const [artifact] = await t.run(ctx => ctx.db.query("artifacts").collect());
    await asA.mutation(api.proof.setCandidate, { artifactId: artifact._id, portfolioCandidate: true });
    await asA.mutation(api.proof.setStatus, { artifactId: artifact._id, status: "Published", publishedUrl: "https://example.test/post", publishedOn: "2026-09-30" });

    const summary = await asA.query(api.journey.summary, {});
    expect(summary.lifetime).toEqual({ sessions: 2, evidence: 1, published: 1, milestones: 1 });
    expect(summary.firsts.map(first => first.kind).sort()).toEqual(["candidate", "milestone", "published", "session", "showcase"]);
    expect(summary.firsts.find(first => first.kind === "session")).toMatchObject({ detail: "Focus card" });
    expect(summary.firsts.find(first => first.kind === "milestone")).toMatchObject({ detail: "Usable Today" });
    expect(summary.firsts.map(first => first.at)).toEqual([...summary.firsts.map(first => first.at)].sort((a, b) => a - b));
    expect((await asB.query(api.journey.summary, {})).firsts).toEqual([]);

    // A first exists only while its record does: removing the flag removes that first.
    await asA.mutation(api.proof.setCandidate, { artifactId: artifact._id, portfolioCandidate: false });
    expect(await t.run(ctx => ctx.db.get(artifact._id))).not.toHaveProperty("candidateSince");
    expect((await asA.query(api.journey.summary, {})).firsts.some(first => first.kind === "candidate")).toBe(false);
  });
});
