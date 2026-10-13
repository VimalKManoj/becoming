import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { bloomSkills } from "./lib/bloom";
import { effectiveSkills, isBackfilled } from "./lib/work";
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
    const [sessions, artifacts, milestones, done] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).take(10000),
      ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner)).take(5000),
      ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(2000),
      ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Done")).take(10000),
    ]);
    const finished = done.filter(task => task.completedAt !== undefined).sort((a, b) => a.completedAt! - b.completedAt!);
    const firstIn = (lane: string) => sessions.find(session => session.lane === lane);
    const earliest = (values: (number | undefined)[]) => {
      const present = values.filter((value): value is number => value !== undefined);
      return present.length ? Math.min(...present) : undefined;
    };
    const published = artifacts.filter(artifact => artifact.status === "Published");
    const firstPublished = published.map(artifact => artifact.publishedOn).filter((value): value is string => Boolean(value)).sort()[0];
    const completed = milestones.filter(milestone => milestone.completedAt !== undefined);
    const firsts = [
      { kind: "finished", label: "First task finished", at: finished[0]?.completedAt, detail: finished[0]?.title },
      { kind: "session", label: "First saved session", at: sessions[0]?.endedAt, detail: sessions[0]?.title },
      { kind: "showcase", label: "First showcase session", at: firstIn("Showcases")?.endedAt, detail: firstIn("Showcases")?.title },
      { kind: "writing", label: "First writing session", at: firstIn("Writing")?.endedAt, detail: firstIn("Writing")?.title },
      { kind: "milestone", label: "First project milestone completed", at: earliest(completed.map(m => m.completedAt)), detail: completed.sort((a, b) => a.completedAt! - b.completedAt!)[0]?.title },
      { kind: "candidate", label: "First portfolio candidate", at: earliest(artifacts.map(a => a.candidateSince)), detail: artifacts.filter(a => a.candidateSince !== undefined).sort((a, b) => a.candidateSince! - b.candidateSince!)[0]?.title },
      { kind: "published", label: "First published piece", at: firstPublished ? Date.parse(`${firstPublished}T12:00:00Z`) : undefined, detail: published.find(a => a.publishedOn === firstPublished)?.title },
    ];
    return {
      lifetime: { finished: finished.length, sessions: sessions.length, evidence: artifacts.length, published: published.length, milestones: completed.length },
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
    // A finished task's skills are its own, or else its milestone's, or else its phase's.
    const skillsOf = await inheritedSkills(ctx, finished);
    const bloom = bloomSkills(
      sessions.map(session => ({ id: String(session._id), lane: session.lane, skills: session.skills, taskId: String(session.taskId) })),
      artifacts.filter(artifact => inWindow.has(String(artifact.sessionId))).map(artifact => ({ sessionId: String(artifact.sessionId), skills: artifact.skills })),
      finished.map(task => ({ taskId: String(task._id), lane: task.lane, skills: skillsOf(task) })),
    );
    return { ...bloom, finishedInWindow: finished.length, untagged: finished.filter(task => skillsOf(task).length === 0).length };
  },
});

// The contributions graph since `since` (the browser asks for about a year): every saved
// session (weight 1), every task finished (2) and started (1), wherever it happened.
// Backfilled moves (recorded more than a day later, like an imported plan) are flagged so the
// graph can show them lighter. Logged work is already a session, so it isn't counted twice.
export const activity = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const [sessions, events] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", args.since)).take(5000),
      ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner).gte("at", args.since)).take(8000),
    ]);
    return [
      ...sessions.map(session => ({ at: session.endedAt, weight: 1, backfilled: false })),
      ...events.filter(event => event.kind === "done" || event.kind === "started").map(event => ({ at: event.at, weight: event.kind === "done" ? 2 : 1, backfilled: isBackfilled(event) })),
    ];
  },
});

/** For each finished task, the skills it counts for: its own, its milestone's, or its phase's. */
async function inheritedSkills(ctx: QueryCtx, tasks: Doc<"tasks">[]) {
  const milestones = new Map<string, Doc<"milestones"> | null>();
  for (const id of new Set(tasks.flatMap(task => !task.skills?.length && task.milestoneId ? [String(task.milestoneId)] : []))) milestones.set(id, await ctx.db.get(id as Id<"milestones">));
  const phases = new Map<string, Doc<"phases"> | null>();
  for (const m of milestones.values()) if (m?.phaseId && !m.skills?.length && !phases.has(String(m.phaseId))) phases.set(String(m.phaseId), await ctx.db.get(m.phaseId));
  return (task: Doc<"tasks">) => {
    const milestone = task.milestoneId ? milestones.get(String(task.milestoneId)) : null;
    return effectiveSkills(task, milestone, milestone?.phaseId ? phases.get(String(milestone.phaseId)) : null);
  };
}

// ---------- What you did: the work feed ----------

const feedKinds = new Set(["done", "started", "blocked", "unblocked", "reopened"]);

/**
 * Journey's feed, newest first: tasks finished, started, blocked, unblocked and reopened
 * (from the app, an assistant, or a backfilled plan), every saved session (focus or logged),
 * and milestones and phases completed. `before` pages back in time; `next` is the cursor for
 * the following page, or null at the start of your history.
 */
export const feed = query({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const limit = Math.min(Math.max(args.limit ?? 30, 1), 60);
    const before = args.before ?? Number.MAX_SAFE_INTEGER;
    const [events, sessions] = await Promise.all([
      ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner).lt("at", before)).order("desc").take(limit * 4),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).lt("endedAt", before)).order("desc").take(limit),
    ]);
    const moves = events.filter(event => feedKinds.has(event.kind));
    const merged = [
      ...moves.map(event => ({ type: "move" as const, at: event.at, event })),
      ...sessions.map(session => ({ type: "session" as const, at: session.endedAt, session })),
    ].sort((a, b) => b.at - a.at).slice(0, limit);
    const more = merged.length === limit || events.length === limit * 4;
    const floor = more && merged.length ? merged[merged.length - 1].at : 0;

    const tasks = new Map<string, Doc<"tasks"> | null>();
    const getTask = async (id: Id<"tasks">) => { if (!tasks.has(String(id))) tasks.set(String(id), await ctx.db.get(id)); const task = tasks.get(String(id)); return task && task.owner === owner ? task : null; };
    const projects = new Map<string, string | null>();
    const projectTitle = async (id: Id<"projects"> | undefined) => {
      if (!id) return null;
      if (!projects.has(String(id))) { const project = await ctx.db.get(id); projects.set(String(id), project && project.owner === owner ? project.title : null); }
      return projects.get(String(id)) ?? null;
    };

    const items = [];
    for (const entry of merged) {
      if (entry.type === "move") {
        const task = await getTask(entry.event.taskId);
        if (!task) continue;
        items.push({ key: String(entry.event._id), kind: entry.event.kind, at: entry.at, source: entry.event.source, backfilled: isBackfilled(entry.event), note: entry.event.note ?? null,
          taskId: task._id, title: task.title, lane: task.lane, project: await projectTitle(task.projectId), minutes: null as number | null, outcome: null as string | null });
      } else {
        const s = entry.session;
        const task = await getTask(s.taskId);
        items.push({ key: String(s._id), kind: s.source ? "logged" : "focused", at: entry.at, source: s.source ?? "app", backfilled: false, note: s.contribution || null,
          taskId: s.taskId, title: s.title, lane: s.lane, project: await projectTitle(s.projectId ?? task?.projectId),
          minutes: s.startedAt !== undefined ? Math.round((s.endedAt - s.startedAt) / 60_000) : s.plannedMinutes ?? null, outcome: s.outcome as string | null });
      }
    }
    // Milestones and phases completed inside this page's span of time.
    const allMilestones = await ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(2000);
    const milestones = allMilestones.filter(m => m.completedAt !== undefined);
    const markers: { key: string; kind: "milestone" | "phase"; at: number; title: string; project: string | null }[] = [];
    for (const m of milestones) if (m.completedAt! < before && m.completedAt! >= floor) markers.push({ key: `m:${m._id}`, kind: "milestone", at: m.completedAt!, title: m.title, project: await projectTitle(m.projectId) });
    const byPhase = new Map<string, Doc<"milestones">[]>();
    for (const m of allMilestones) if (m.phaseId) byPhase.set(String(m.phaseId), [...(byPhase.get(String(m.phaseId)) ?? []), m]);
    for (const [phaseId, list] of byPhase) {
      if (!list.every(m => m.completedAt !== undefined)) continue;
      const at = Math.max(...list.map(m => m.completedAt!));
      if (at >= before || at < floor) continue;
      const phase = await ctx.db.get(phaseId as Id<"phases">);
      if (phase && phase.owner === owner) markers.push({ key: `p:${phase._id}`, kind: "phase", at, title: phase.name, project: await projectTitle(phase.projectId) });
    }
    return { items, markers, next: more && merged.length ? floor : null };
  },
});

/**
 * Finished tasks that count for no skill yet (none of their own, their milestone's or their
 * phase's), grouped by the phase or milestone that could carry the skills for them: Journey's
 * tidy-up card. Tasks outside any milestone are counted apart; they're tagged one by one.
 */
export const untagged = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const done = await ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Done")).take(5000);
    const skillsOf = await inheritedSkills(ctx, done);
    const bare = done.filter(task => skillsOf(task).length === 0);
    const groups = new Map<string, { kind: "phase" | "milestone"; id: string; name: string; project: string; count: number; order: number }>();
    let outside = 0;
    for (const task of bare) {
      const milestone = task.milestoneId ? await ctx.db.get(task.milestoneId) : null;
      if (!milestone) { outside += 1; continue; }
      const phase = milestone.phaseId ? await ctx.db.get(milestone.phaseId) : null;
      const project = await ctx.db.get(milestone.projectId);
      const key = phase ? `p:${phase._id}` : `m:${milestone._id}`;
      const group = groups.get(key) ?? (phase
        ? { kind: "phase" as const, id: String(phase._id), name: phase.name, project: project?.title ?? "", count: 0, order: phase.order }
        : { kind: "milestone" as const, id: String(milestone._id), name: milestone.title, project: project?.title ?? "", count: 0, order: 1000 + milestone.order });
      group.count += 1;
      groups.set(key, group);
    }
    return { total: bare.length, outside, groups: [...groups.values()].sort((a, b) => a.project.localeCompare(b.project) || a.order - b.order) };
  },
});
