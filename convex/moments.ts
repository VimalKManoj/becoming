import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwner } from "./lib/ownership";
import { commitmentFor } from "./lib/rhythm";
import { dayKey, weekKey, weekRange } from "./lib/time";
import { effectiveSkills, progressKinds } from "./lib/work";

// Moments and the weekly look-back (PLAN-one-tap-and-daily-loop, Phase 5b).
//
// Moments: a milestone finished, a phase finished, or the week met. Each is shown once
// (profiles.momentsSeen), the next time Becoming is opened, even when an assistant caused it.
// Only the last 7 days count, so nothing old surfaces.
//
// The look-back: a week built from records: what shipped (by milestone), what stalled (In
// progress 7+ days), where the time went (by project), and the skills that grew.

const DAY = 86_400_000;
const recent = 7 * DAY;

export type Moment = { key: string; kind: "milestone" | "phase" | "week"; title: string; project: string | null; projectId: Id<"projects"> | null; at: number; by: string | null };

export const list = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    return momentsFor(ctx, owner, profile, Date.now());
  },
});

export async function momentsFor(ctx: QueryCtx, owner: string, profile: Doc<"profiles"> | null, now: number): Promise<Moment[]> {
  const seen = new Set(profile?.momentsSeen ?? []);
  const out: Moment[] = [];
  const milestones = (await ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(300)).filter(m => m.completedAt && m.completedAt >= now - recent);
  const projects = new Map<string, Doc<"projects"> | null>();
  const projectOf = async (id: Id<"projects">) => {
    if (!projects.has(String(id))) { const p = await ctx.db.get(id); projects.set(String(id), p && p.owner === owner ? p : null); }
    return projects.get(String(id)) ?? null;
  };
  for (const milestone of milestones) {
    const project = await projectOf(milestone.projectId);
    // Who finished it: the source of the last "done" among its tasks.
    const tasks = await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestone._id)).take(60);
    let by: string | null = null, last = 0;
    for (const task of tasks) {
      const done = (await ctx.db.query("taskEvents").withIndex("by_task", q => q.eq("taskId", task._id)).order("desc").take(10)).find(e => e.kind === "done");
      if (done && done.at > last) { last = done.at; by = done.source === "app" ? null : done.source; }
    }
    const key = `m:${milestone._id}`;
    if (!seen.has(key)) out.push({ key, kind: "milestone", title: milestone.title, project: project?.title ?? null, projectId: project?._id ?? null, at: milestone.completedAt!, by });
    // A phase is finished when its last milestone is.
    if (milestone.phaseId) {
      const phaseKey = `p:${milestone.phaseId}`;
      if (seen.has(phaseKey) || out.some(m => m.key === phaseKey)) continue;
      const phase = await ctx.db.get(milestone.phaseId);
      if (!phase || phase.owner !== owner) continue;
      const peers = (await ctx.db.query("milestones").withIndex("by_phase", q => q.eq("phaseId", phase._id)).collect()).filter(m => m.owner === owner);
      if (peers.length && peers.every(m => m.completedAt)) out.push({ key: phaseKey, kind: "phase", title: phase.name, project: project?.title ?? null, projectId: project?._id ?? null, at: Math.max(...peers.map(m => m.completedAt!)), by });
    }
  }
  // The week met (this week, in your timezone).
  const zone = profile?.timezone;
  if (zone) {
    const week = weekKey(now, zone);
    const key = `w:${week}`;
    const commitments = await ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).collect();
    const inForce = commitmentFor(week, commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })));
    if (!seen.has(key) && inForce?.target && !inForce.paused) {
      const { start, end } = weekRange(week, zone);
      const [sessions, events] = await Promise.all([
        ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", start).lt("endedAt", end)).take(200),
        ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner).gte("at", start).lt("at", end)).take(500),
      ]);
      const days = new Set([...sessions.map(s => dayKey(s.endedAt, zone)), ...events.filter(e => progressKinds.has(e.kind)).map(e => dayKey(e.at, zone))]);
      if (days.size >= inForce.target) out.push({ key, kind: "week", title: `${days.size} of ${inForce.target} evenings`, project: null, projectId: null, at: now, by: null });
    }
  }
  // A phase outranks its milestone; then newest first.
  const rank = { phase: 0, milestone: 1, week: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.at - a.at).slice(0, 3);
}

/** Marks a moment as shown, so it never shows again. */
export const see = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (!/^[mpw]:[\w-]{1,80}$/.test(args.key)) throw new ConvexError("That isn't a moment.");
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    const seen = [...(profile?.momentsSeen ?? []).filter(key => key !== args.key), args.key].slice(-200);
    if (profile) await ctx.db.patch(profile._id, { momentsSeen: seen });
    else await ctx.db.insert("profiles", { owner, motive: "", momentsSeen: seen });
    return null;
  },
});

// ---------- The weekly look-back ----------

export const lookBack = query({
  args: { since: v.number(), until: v.number() },
  handler: async (ctx, args) => lookBackFor(ctx, await requireOwner(ctx), args.since, args.until),
});

export async function lookBackFor(ctx: QueryCtx, owner: string, since: number, until: number) {
  const [events, sessions, doing] = await Promise.all([
    ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner).gte("at", since).lt("at", until)).take(1000),
    ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", since).lt("endedAt", until)).take(500),
    ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "In progress")).take(100),
  ]);
  const projectTitle = new Map<string, string>();
  const milestoneTitle = new Map<string, string>();
  const nameOf = async (projectId?: Id<"projects">, milestoneId?: Id<"milestones">) => {
    let project = "";
    if (projectId) {
      if (!projectTitle.has(String(projectId))) { const p = await ctx.db.get(projectId); projectTitle.set(String(projectId), p && p.owner === owner ? p.title : ""); }
      project = projectTitle.get(String(projectId)) ?? "";
    }
    let milestone = "";
    if (milestoneId) {
      if (!milestoneTitle.has(String(milestoneId))) { const m = await ctx.db.get(milestoneId); milestoneTitle.set(String(milestoneId), m && m.owner === owner ? m.title : ""); }
      milestone = milestoneTitle.get(String(milestoneId)) ?? "";
    }
    return { project, milestone };
  };

  // What shipped: tasks finished in the week that are still Done, grouped by milestone.
  const doneIds = [...new Set(events.filter(e => e.kind === "done").map(e => String(e.taskId)))];
  const groups = new Map<string, { group: string; tasks: string[] }>();
  const skills = new Map<string, number>();
  for (const id of doneIds) {
    const task = await ctx.db.get(id as Id<"tasks">);
    if (!task || task.owner !== owner || task.status !== "Done") continue;
    const { project, milestone } = await nameOf(task.projectId, task.milestoneId);
    const group = [project, milestone].filter(Boolean).join(" › ") || task.lane;
    const entry = groups.get(group) ?? { group, tasks: [] };
    entry.tasks.push(task.title);
    groups.set(group, entry);
    // A task without its own skills counts for its milestone's, or else its phase's.
    const milestoneDoc = task.milestoneId ? await ctx.db.get(task.milestoneId) : null;
    const phaseDoc = milestoneDoc?.phaseId ? await ctx.db.get(milestoneDoc.phaseId) : null;
    for (const skill of effectiveSkills(task, milestoneDoc ?? undefined, phaseDoc ?? undefined)) skills.set(skill, (skills.get(skill) ?? 0) + 1);
  }
  for (const session of sessions) for (const skill of session.skills ?? []) skills.set(skill, (skills.get(skill) ?? 0) + 1);

  // What stalled: In progress for 7 days or more by the week's end.
  const stalled = doing.filter(task => task.startedAt && task.startedAt <= until - recent)
    .map(task => ({ id: task._id, title: task.title, days: Math.floor((until - task.startedAt!) / DAY) }))
    .sort((a, b) => b.days - a.days).slice(0, 8);

  // Where the time went: focused minutes by project (or lane).
  const time = new Map<string, number>();
  for (const session of sessions) {
    if (!session.startedAt) continue;
    const minutes = Math.max(0, Math.round((session.endedAt - session.startedAt) / 60_000));
    if (minutes > 600) continue;
    const { project } = await nameOf(session.projectId);
    const label = project || session.lane;
    time.set(label, (time.get(label) ?? 0) + minutes);
  }
  return {
    shipped: [...groups.values()].sort((a, b) => b.tasks.length - a.tasks.length),
    stalled,
    time: [...time.entries()].map(([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes),
    skills: [...skills.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
