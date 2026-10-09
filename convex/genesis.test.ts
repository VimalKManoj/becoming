import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { addResearchFor, addSourceFor } from "./genesis";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://auth.example.test";
const ownerA = `${issuer}|user-a`;

function setup() {
  const t = convexTest(schema, modules);
  return { t, asA: t.withIdentity({ subject: "user-a", issuer }), asB: t.withIdentity({ subject: "user-b", issuer }) };
}
type Who = ReturnType<typeof setup>["asA"];
const idea = (who: Who) => who.mutation(api.ideas.create, { title: "A calmer tracker", lane: "Projects", notes: "" });

describe("genesis: research, report and decision", () => {
  it("keeps each person's genesis private", async () => {
    const { asA, asB } = setup();
    const ideaId = await idea(asA);
    const researchId = await asA.mutation(api.genesis.addResearch, { ideaId, title: "Do evenings work?" });
    const reportId = await asA.mutation(api.genesis.saveReport, { ideaId, title: "Findings", findings: [] });

    expect(await asB.query(api.genesis.forIdea, { ideaId })).toBeNull();
    await expect(asB.mutation(api.genesis.addResearch, { ideaId, title: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.updateResearch, { researchId, title: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.addSource, { researchId, title: "Mine", kind: "read" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.removeSource, { researchId, index: 0 })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.removeResearch, { researchId })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.saveReport, { ideaId, title: "Mine", findings: [] })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.setDecision, { ideaId, verdict: "Mine" })).rejects.toThrow("not found");
    await expect(asB.mutation(api.genesis.removeReport, { reportId })).rejects.toThrow("not found");

    const genesis = await asA.query(api.genesis.forIdea, { ideaId });
    expect(genesis!.research.map(r => r.title)).toEqual(["Do evenings work?"]);
    expect(genesis!.report).toMatchObject({ title: "Findings" });
  });

  it("records who added each source: the app, or the assistant", async () => {
    const { t, asA } = setup();
    const ideaId = await idea(asA);
    const researchId = await asA.mutation(api.genesis.addResearch, { ideaId, title: "Do evenings work?", summary: "Short sessions" });
    await asA.mutation(api.genesis.addSource, { researchId, title: "Deep Work", kind: "read", url: "https://example.test/deep-work" });
    await expect(asA.mutation(api.genesis.addSource, { researchId, title: "Bad", kind: "read", url: "javascript:alert(1)" })).rejects.toThrow("HTTP or HTTPS");
    await t.run(ctx => addSourceFor(ctx as unknown as MutationCtx, ownerA, researchId, { title: "Summary of five posts", kind: "brief" }, "Claude Code"));
    await t.run(ctx => addResearchFor(ctx as unknown as MutationCtx, ownerA, ideaId, { title: "Competitors", sources: [{ title: "Three apps compared", kind: "brief" }] }, "Claude Code"));

    const genesis = (await asA.query(api.genesis.forIdea, { ideaId }))!;
    const [first, second] = genesis.research;
    expect(first).toMatchObject({ title: "Do evenings work?", summary: "Short sessions", source: "app" });
    expect(first.sources.map(s => [s.title, s.kind, s.by])).toEqual([["Deep Work", "read", "app"], ["Summary of five posts", "brief", "Claude Code"]]);
    expect(first.sources[0].url).toBe("https://example.test/deep-work");
    expect(second).toMatchObject({ title: "Competitors", source: "Claude Code", sources: [expect.objectContaining({ kind: "brief", by: "Claude Code" })] });

    await asA.mutation(api.genesis.removeSource, { researchId, index: 0 });
    expect((await asA.query(api.genesis.forIdea, { ideaId }))!.research[0].sources.map(s => s.title)).toEqual(["Summary of five posts"]);
    await asA.mutation(api.genesis.updateResearch, { researchId, title: "Do short evenings work?" });
    await asA.mutation(api.genesis.removeResearch, { researchId: second.id });
    expect((await asA.query(api.genesis.forIdea, { ideaId }))!.research.map(r => r.title)).toEqual(["Do short evenings work?"]);
  });

  it("keeps one report per idea: saving again updates it and keeps the decision", async () => {
    const { t, asA } = setup();
    const ideaId = await idea(asA);
    await asA.mutation(api.genesis.saveReport, { ideaId, title: "First draft", findings: [{ text: "Evenings are short", basis: "Interviews" }] });
    await asA.mutation(api.genesis.setDecision, { ideaId, verdict: "Build it", rule: "Evenings only", kept: ["Focus timer", " "], dropped: ["Teams"] });
    await asA.mutation(api.genesis.saveReport, { ideaId, title: "Final", summary: "Worth building", findings: [{ text: "Evenings are short" }, { text: "People want proof" }] });
    await expect(asA.mutation(api.genesis.saveReport, { ideaId, title: "Too many", findings: Array.from({ length: 21 }, () => ({ text: "x" })) })).rejects.toThrow("20 findings");
    await expect(asA.mutation(api.genesis.setDecision, { ideaId, verdict: "x", kept: Array.from({ length: 13 }, (_, i) => `k${i}`) })).rejects.toThrow("12 short items");

    expect(await t.run(ctx => ctx.db.query("reports").collect())).toHaveLength(1);
    const { report } = (await asA.query(api.genesis.forIdea, { ideaId }))!;
    expect(report).toMatchObject({
      title: "Final", summary: "Worth building", findings: [{ text: "Evenings are short" }, { text: "People want proof" }], source: "app",
      decision: { verdict: "Build it", rule: "Evenings only", kept: ["Focus timer"], dropped: ["Teams"], at: expect.any(Number) },
    });
  });

  it("a decision without a report starts one, and the project's map shows the whole genesis", async () => {
    const { asA } = setup();
    const ideaId = await idea(asA);
    await asA.mutation(api.genesis.setDecision, { ideaId, verdict: "Build the evening version" });
    const { report } = (await asA.query(api.genesis.forIdea, { ideaId }))!;
    expect(report).toMatchObject({ title: "Build the evening version", findings: [], decision: { verdict: "Build the evening version", kept: [], dropped: [] } });

    await asA.mutation(api.genesis.addResearch, { ideaId, title: "Thread" });
    const projectId = await asA.mutation(api.projects.create, { title: "Becoming", purpose: "Practice", ideaId });
    const map = (await asA.query(api.constellation.get, { projectId }))!;
    expect(map.genesis).toMatchObject({
      idea: { id: ideaId, title: "A calmer tracker" }, research: [expect.objectContaining({ title: "Thread", source: "app" })],
      report: { title: "Build the evening version" }, decision: { verdict: "Build the evening version" },
    });
    await asA.mutation(api.genesis.removeReport, { reportId: report!.id });
    expect((await asA.query(api.constellation.get, { projectId }))!.genesis).toMatchObject({ report: null, decision: null });
  });
});
