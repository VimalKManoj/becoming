import { ConvexError, v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOwner } from "./lib/ownership";
import { dayKey } from "./lib/time";

// Today's two slim bars above the week (PLAN-one-tap-and-daily-loop, Phase 3, rethought
// 15 October): "On it now" (tasks In progress, latest moved first) and "Last time" (what
// moved today, or else on your last active day, by you and by assistants, and where you
// left off). Plus open tasks per lane, for the tiles' subtitles. All derived from records;
// nothing new is stored.

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** The moves Last time reports. "unblocked" and "reopened" count as starting again. */
const reported: Record<string, "finished" | "started" | "blocked" | "logged"> = { done: "finished", started: "started", unblocked: "started", reopened: "started", blocked: "blocked", logged: "logged" };
type Kind = (typeof reported)[string];

export const home = query({
  args: { today: v.string(), timezone: v.string() },
  handler: async (ctx, args) => homeFor(ctx, await requireOwner(ctx), args),
});

export async function homeFor(ctx: QueryCtx, owner: string, args: { today: string; timezone: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) throw new ConvexError("today must be a date like 2026-10-15.");
  let zone = args.timezone;
  try { dayKey(0, zone); } catch { zone = "UTC"; }

  const [doing, ready, events] = await Promise.all([
    ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "In progress")).take(50),
    ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Ready")).take(500),
    ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner)).order("desc").take(300),
  ]);

  // ----- On it now: the 3 latest moved -----
  const movedAt = new Map<string, { at: number; source: string }>();
  for (const event of events) if (!movedAt.has(String(event.taskId))) movedAt.set(String(event.taskId), { at: event.at, source: event.source });
  const latestMove = (task: Doc<"tasks">) => movedAt.get(String(task._id))?.at ?? task.startedAt ?? task._creationTime;
  const onItNow = await Promise.all([...doing].sort((a, b) => latestMove(b) - latestMove(a)).slice(0, 3).map(async task => {
    const project = task.projectId ? await ctx.db.get(task.projectId) : null;
    return {
      taskId: task._id, title: task.title, status: task.status, lane: task.lane, minutes: task.minutes,
      nextStep: task.nextStep || null,
      project: project && project.owner === owner ? { id: project._id, title: project.title } : null,
      code: await codeOf(ctx, owner, task),
      by: movedAt.get(String(task._id))?.source ?? "app",
    };
  }));

  // ----- Last time: today, or else the last day something moved -----
  const moves = events.filter(event => event.kind in reported);
  let lastTime = null;
  if (moves.length) {
    const day = moves.some(event => dayKey(event.at, zone) === args.today) ? args.today : dayKey(moves[0].at, zone);
    const inDay = moves.filter(event => dayKey(event.at, zone) === day);
    // One line per task: its latest move that day ("started then finished" reads as finished).
    const seen = new Set<string>();
    const latest = inDay.filter(event => (seen.has(String(event.taskId)) ? false : (seen.add(String(event.taskId)), true)));
    const tasks = new Map((await Promise.all(latest.map(event => ctx.db.get(event.taskId)))).flatMap(task => (task && task.owner === owner ? [[String(task._id), task] as const] : [])));
    const groups = new Map<string, Record<Kind, { taskId: Id<"tasks">; title: string }[]>>();
    for (const event of latest) {
      const task = tasks.get(String(event.taskId));
      if (!task) continue;
      const by = event.source === "app" ? "you" : event.source;
      const group = groups.get(by) ?? { finished: [], started: [], blocked: [], logged: [] };
      group[reported[event.kind]].push({ taskId: task._id, title: task.title });
      groups.set(by, group);
    }
    // Where you left off: the latest task that's still open and has a next step.
    const open = latest.map(event => tasks.get(String(event.taskId))).find(task => task && (task.status === "In progress" || task.status === "Ready") && task.nextStep);
    lastTime = {
      day, isToday: day === args.today, at: inDay[0].at,
      groups: [...groups.entries()].sort(([a], [b]) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b))).map(([by, kinds]) => ({ by, ...kinds })),
      pickUp: open ? { taskId: open._id, title: open.title, nextStep: open.nextStep } : null,
    };
  }

  const openByLane = { Projects: 0, Showcases: 0, Writing: 0 };
  for (const task of [...doing, ...ready]) openByLane[task.lane] += 1;
  return { onItNow, moreInProgress: Math.max(0, doing.length - 3), lastTime, openByLane };
}

/** A task's code in its project's plan ("0B·2"), the same as the constellation's, or null. */
async function codeOf(ctx: QueryCtx, owner: string, task: Doc<"tasks">) {
  if (!task.projectId || !task.milestoneId) return null;
  const [phases, milestones, siblings] = await Promise.all([
    ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", task.projectId!)).collect(),
    ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", task.projectId!)).collect(),
    ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", task.milestoneId!)).collect(),
  ]);
  const ownPhases = phases.filter(p => p.owner === owner).sort((a, b) => a.order - b.order);
  const ownMilestones = milestones.filter(m => m.owner === owner).sort((a, b) => a.order - b.order);
  const milestone = ownMilestones.find(m => m._id === task.milestoneId);
  if (!milestone) return null;
  const phaseIndex = milestone.phaseId ? ownPhases.findIndex(p => p._id === milestone.phaseId) : -1;
  const peers = ownMilestones.filter(m => (phaseIndex >= 0 ? m.phaseId === milestone.phaseId : !m.phaseId || !ownPhases.some(p => p._id === m.phaseId)));
  const j = peers.findIndex(m => m._id === milestone._id);
  const milestoneCode = `${phaseIndex >= 0 ? phaseIndex : ""}${letters[j] ?? j}`;
  const k = siblings.filter(t => t.owner === owner && t.status !== "Archived").sort((a, b) => a._creationTime - b._creationTime).findIndex(t => t._id === task._id);
  return `${milestoneCode}·${k + 1}`;
}
