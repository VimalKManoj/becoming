import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { httpUrl, optionalText } from "./lib/validate";

// Genesis: what came before a project. An idea's research threads (each with its sources),
// the report they produced, and the decision to build. Added in the app (an idea's
// brainstorm) or by an assistant through MCP; the constellation draws them as its first column.

type SourceKind = Doc<"research">["sources"][number]["kind"];
const sourceKinds: SourceKind[] = ["read", "interview", "tried", "brief"];

async function ownedIdea(ctx: Pick<MutationCtx, "db">, owner: string, ideaId: Id<"ideas">) {
  const idea = await ctx.db.get(ideaId);
  assertOwner(idea, owner);
  return idea;
}

export const forIdea = query({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.owner !== owner) return null;
    const [research, reports] = await Promise.all([
      ctx.db.query("research").withIndex("by_idea", q => q.eq("ideaId", idea._id)).collect(),
      ctx.db.query("reports").withIndex("by_idea", q => q.eq("ideaId", idea._id)).collect(),
    ]);
    const report = reports.sort((a, b) => b.writtenAt - a.writtenAt)[0] ?? null;
    return {
      research: research.map(r => ({ id: r._id, title: r.title, summary: r.summary ?? "", sources: r.sources, source: r.source, createdAt: r._creationTime })),
      report: report ? { id: report._id, title: report.title, summary: report.summary ?? "", findings: report.findings, decision: report.decision ?? null, source: report.source, writtenAt: report.writtenAt } : null,
    };
  },
});

// ---------- Research ----------

export type SourceInput = { title: string; url?: string; kind: SourceKind };
function sourceValue(input: SourceInput, by: string) {
  if (!sourceKinds.includes(input.kind)) throw new ConvexError("A source is read, interview, tried or brief.");
  const url = input.url?.trim() ? httpUrl(input.url, "A source link must be an HTTP or HTTPS address.") : undefined;
  return { title: nonempty(input.title, 200), ...(url ? { url } : {}), kind: input.kind, by, at: Date.now() };
}

export async function addResearchFor(ctx: MutationCtx, owner: string, ideaId: Id<"ideas">, args: { title: string; summary?: string; sources?: SourceInput[] }, source = "app") {
  const idea = await ownedIdea(ctx, owner, ideaId);
  const threads = await ctx.db.query("research").withIndex("by_idea", q => q.eq("ideaId", idea._id)).take(21);
  if (threads.length >= 20) throw new ConvexError("An idea can have up to 20 research threads.");
  const sources = (args.sources ?? []).map(item => sourceValue(item, source));
  if (sources.length > 50) throw new ConvexError("A thread can have up to 50 sources.");
  return ctx.db.insert("research", { owner, ideaId: idea._id, title: nonempty(args.title, 120), summary: optionalText(args.summary, 2000, "the summary"), sources, source });
}

export const addResearch = mutation({
  args: { ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()) },
  handler: async (ctx, args) => addResearchFor(ctx, await requireOwner(ctx), args.ideaId, args),
});

export const updateResearch = mutation({
  args: { researchId: v.id("research"), title: v.string(), summary: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const thread = await ctx.db.get(args.researchId);
    assertOwner(thread, owner);
    await ctx.db.patch(thread._id, { title: nonempty(args.title, 120), summary: optionalText(args.summary, 2000, "the summary") });
  },
});

export async function addSourceFor(ctx: MutationCtx, owner: string, researchId: Id<"research">, input: SourceInput, by = "app") {
  const thread = await ctx.db.get(researchId);
  assertOwner(thread, owner);
  if (thread.sources.length >= 50) throw new ConvexError("A thread can have up to 50 sources.");
  await ctx.db.patch(thread._id, { sources: [...thread.sources, sourceValue(input, by)] });
}

export const addSource = mutation({
  args: { researchId: v.id("research"), title: v.string(), url: v.optional(v.string()), kind: v.union(v.literal("read"), v.literal("interview"), v.literal("tried"), v.literal("brief")) },
  handler: async (ctx, args) => addSourceFor(ctx, await requireOwner(ctx), args.researchId, args),
});

export const removeSource = mutation({
  args: { researchId: v.id("research"), index: v.number() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const thread = await ctx.db.get(args.researchId);
    assertOwner(thread, owner);
    await ctx.db.patch(thread._id, { sources: thread.sources.filter((_, i) => i !== args.index) });
  },
});

export const removeResearch = mutation({
  args: { researchId: v.id("research") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const thread = await ctx.db.get(args.researchId);
    assertOwner(thread, owner);
    await ctx.db.delete(thread._id);
  },
});

// ---------- Report and decision (one report per idea) ----------

export type ReportInput = { title: string; summary?: string; findings: { text: string; basis?: string }[] };

export async function saveReportFor(ctx: MutationCtx, owner: string, ideaId: Id<"ideas">, args: ReportInput, source = "app") {
  const idea = await ownedIdea(ctx, owner, ideaId);
  if (args.findings.length > 20) throw new ConvexError("A report can have up to 20 findings.");
  const values = {
    title: nonempty(args.title, 160), summary: optionalText(args.summary, 4000, "the summary"),
    findings: args.findings.map(f => ({ text: nonempty(f.text, 600), ...(f.basis?.trim() ? { basis: nonempty(f.basis, 200) } : {}) })),
  };
  const existing = await ctx.db.query("reports").withIndex("by_idea", q => q.eq("ideaId", idea._id)).first();
  if (existing) { await ctx.db.patch(existing._id, { ...values, source, writtenAt: Date.now() }); return existing._id; }
  return ctx.db.insert("reports", { owner, ideaId: idea._id, ...values, source, writtenAt: Date.now() });
}

export const saveReport = mutation({
  args: { ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()), findings: v.array(v.object({ text: v.string(), basis: v.optional(v.string()) })) },
  handler: async (ctx, args) => saveReportFor(ctx, await requireOwner(ctx), args.ideaId, args),
});

export type DecisionInput = { verdict: string; rule?: string; kept?: string[]; dropped?: string[] };

/** The decision the research led to. Without a report yet, it starts one named after the decision. */
export async function setDecisionFor(ctx: MutationCtx, owner: string, ideaId: Id<"ideas">, args: DecisionInput, source = "app") {
  const idea = await ownedIdea(ctx, owner, ideaId);
  const list = (items: string[] | undefined, label: string) => {
    const clean = (items ?? []).map(item => item.trim()).filter(Boolean);
    if (clean.length > 12 || clean.some(item => item.length > 200)) throw new ConvexError(`Keep ${label} to 12 short items.`);
    return clean;
  };
  const decision = { verdict: nonempty(args.verdict, 200), ...(args.rule?.trim() ? { rule: nonempty(args.rule, 600) } : {}), kept: list(args.kept, "what was kept"), dropped: list(args.dropped, "what was dropped"), at: Date.now() };
  const existing = await ctx.db.query("reports").withIndex("by_idea", q => q.eq("ideaId", idea._id)).first();
  if (existing) await ctx.db.patch(existing._id, { decision });
  else await ctx.db.insert("reports", { owner, ideaId: idea._id, title: decision.verdict, findings: [], decision, source, writtenAt: Date.now() });
}

export const setDecision = mutation({
  args: { ideaId: v.id("ideas"), verdict: v.string(), rule: v.optional(v.string()), kept: v.optional(v.array(v.string())), dropped: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => setDecisionFor(ctx, await requireOwner(ctx), args.ideaId, args),
});

export const removeReport = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const report = await ctx.db.get(args.reportId);
    assertOwner(report, owner);
    await ctx.db.delete(report._id);
  },
});
