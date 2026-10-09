import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { bloomSkills } from "./lib/bloom";
import { requireOwner } from "./lib/ownership";

// Journey reads completed recaps, never active or cancelled focus sessions.
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db.query("sessions")
      .withIndex("by_owner_endedAt", q => q.eq("owner", owner))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async session => {
      // Evidence saved with the recap or added later, shown with the session it came from.
      const artifacts = await ctx.db.query("artifacts").withIndex("by_session", q => q.eq("sessionId", session._id)).collect();
      return {
        _id: session._id,
        taskId: session.taskId,
        title: session.title,
        lane: session.lane,
        outcome: session.outcome,
        contribution: session.contribution,
        nextStep: session.nextStep,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        smaller: session.smaller ?? false,
        evidence: session.evidence,
        plannedMinutes: session.plannedMinutes,
        recommended: session.recommended,
        swapReason: session.swapReason,
        skills: session.skills ?? [],
        source: session.source ?? null,
        artifacts: artifacts.filter(artifact => artifact.owner === owner).map(artifact => ({ _id: artifact._id, title: artifact.title, url: artifact.url, status: artifact.status, skills: artifact.skills ?? [] })),
      };
    }));
    return { ...result, page };
  },
});

// Lifetime counts and "firsts", derived from records every time they're read, so nothing
// is awarded twice and nothing appears without the record that earned it. Reads are
// bounded for a personal workspace; the limits are far above a few years of evenings.
export const summary = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const [sessions, artifacts, milestones] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).take(10000),
      ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner)).take(5000),
      ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(2000),
    ]);
    const firstIn = (lane: string) => sessions.find(session => session.lane === lane);
    const earliest = (values: (number | undefined)[]) => {
      const present = values.filter((value): value is number => value !== undefined);
      return present.length ? Math.min(...present) : undefined;
    };
    const published = artifacts.filter(artifact => artifact.status === "Published");
    const firstPublished = published.map(artifact => artifact.publishedOn).filter((value): value is string => Boolean(value)).sort()[0];
    const completed = milestones.filter(milestone => milestone.completedAt !== undefined);
    const firsts = [
      { kind: "session", label: "First saved session", at: sessions[0]?.endedAt, detail: sessions[0]?.title },
      { kind: "showcase", label: "First showcase session", at: firstIn("Showcases")?.endedAt, detail: firstIn("Showcases")?.title },
      { kind: "writing", label: "First writing session", at: firstIn("Writing")?.endedAt, detail: firstIn("Writing")?.title },
      { kind: "milestone", label: "First project milestone completed", at: earliest(completed.map(m => m.completedAt)), detail: completed.sort((a, b) => a.completedAt! - b.completedAt!)[0]?.title },
      { kind: "candidate", label: "First portfolio candidate", at: earliest(artifacts.map(a => a.candidateSince)), detail: artifacts.filter(a => a.candidateSince !== undefined).sort((a, b) => a.candidateSince! - b.candidateSince!)[0]?.title },
      { kind: "published", label: "First published piece", at: firstPublished ? Date.parse(`${firstPublished}T12:00:00Z`) : undefined, detail: published.find(a => a.publishedOn === firstPublished)?.title },
    ];
    return {
      lifetime: { sessions: sessions.length, evidence: artifacts.length, published: published.length, milestones: completed.length },
      firsts: firsts.filter(first => first.at !== undefined).map(first => ({ kind: first.kind, label: first.label, at: first.at!, detail: first.detail ?? "" })).sort((a, b) => a.at - b.at),
    };
  },
});

// The Mind Bloom for sessions saved from `since` up to `until` (the browser sends a
// month's start and, for a past month, the next month's start, in your timezone).
// Bounded: the newest 1,000 sessions in the window.
export const bloom = query({
  args: { since: v.number(), until: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const [sessions, artifacts, done] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => {
        const from = q.eq("owner", owner).gte("endedAt", args.since);
        return args.until === undefined ? from : from.lt("endedAt", args.until);
      }).order("desc").take(1000),
      ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(3000),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Done")).order("desc").take(1000),
    ]);
    const inWindow = new Set(sessions.map(session => String(session._id)));
    const finished = done.filter(task => task.completedAt !== undefined && task.completedAt >= args.since && (args.until === undefined || task.completedAt < args.until));
    return bloomSkills(
      sessions.map(session => ({ id: String(session._id), lane: session.lane, skills: session.skills, taskId: String(session.taskId) })),
      artifacts.filter(artifact => inWindow.has(String(artifact.sessionId))).map(artifact => ({ sessionId: String(artifact.sessionId), skills: artifact.skills })),
      finished.map(task => ({ taskId: String(task._id), lane: task.lane, skills: task.skills })),
    );
  },
});

// Every saved session's end time since `since` (the browser asks for about a year), for
// the contributions graph. Bounded at 5,000 sessions.
export const activity = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const sessions = await ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", args.since)).take(5000);
    return sessions.map(session => session.endedAt);
  },
});
