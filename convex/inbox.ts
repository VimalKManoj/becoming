import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { refreshMilestone } from "./lib/projects";
import { logEvent } from "./lib/taskEvents";
import { nextStepValue } from "./lib/taskRules";
import { addDocFor, addPhaseFor, ownedProject, setMilestonePhaseFor, updateDocFor } from "./constellation";
import { addResearchFor, addSourceFor, saveReportFor, setDecisionFor } from "./genesis";
import { createIdeaFor } from "./ideas";
import { addMilestoneFor } from "./projects";
import { createTaskFor, saveLoggedSession } from "./tasks";

// The Inbox on Today: what assistants proposed through the MCP endpoint (convex/mcp.ts).
// Nothing counts until you approve it, and approving runs the same rules as the app, so
// an assistant can never write anything the app wouldn't accept from you.

export const inboxLimit = 100;
const energyName = ["", "Low", "Steady", "High"];

type Db = Pick<QueryCtx, "db">;
type Proposal = Doc<"inbox">["proposal"];
export type PlanProposal = Extract<Proposal, { kind: "plan" }>;
type PlanTask = PlanProposal["phases"][number]["milestones"][number]["tasks"][number];

// A plan's size limits, checked when it's proposed and again at approval.
export const planLimits = { phases: 40, milestonesPerPhase: 26, milestones: 120, tasksPerMilestone: 40, tasks: 200, docs: 40 };

async function titleOf(ctx: Db, owner: string, id: Id<"tasks"> | Id<"projects"> | Id<"ideas"> | undefined) {
  if (!id) return null;
  const doc = await ctx.db.get(id);
  return doc && doc.owner === owner ? doc.title : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Plan for Becoming: 8 phases, 22 milestones, 76 tasks, 6 docs". */
export function planCounts(p: Pick<PlanProposal, "phases" | "docs">) {
  const milestones = p.phases.reduce((n, phase) => n + phase.milestones.length, 0);
  const tasks = p.phases.reduce((n, phase) => n + phase.milestones.reduce((k, m) => k + m.tasks.length, 0), 0);
  return { phases: p.phases.length, milestones, tasks, docs: p.docs.length, text: [plural(p.phases.length, "phase"), plural(milestones, "milestone"), plural(tasks, "task"), plural(p.docs.length, "doc")].join(", ") };
}

/** Throws when a plan breaks a size limit or repeats a name. */
export function checkPlanShape(p: Pick<PlanProposal, "phases" | "docs">) {
  const counts = planCounts(p);
  if (!counts.phases) throw new ConvexError("A plan needs at least one phase.");
  if (counts.phases > planLimits.phases) throw new ConvexError(`A plan can have up to ${planLimits.phases} phases.`);
  if (counts.milestones > planLimits.milestones) throw new ConvexError(`A plan can have up to ${planLimits.milestones} milestones.`);
  if (counts.tasks > planLimits.tasks) throw new ConvexError(`A plan can have up to ${planLimits.tasks} tasks. Send the rest as a second plan.`);
  if (counts.docs > planLimits.docs) throw new ConvexError(`A plan can have up to ${planLimits.docs} docs.`);
  const key = (s: string) => s.trim().toLowerCase();
  const names = p.phases.map(phase => key(phase.name));
  if (new Set(names).size !== names.length) throw new ConvexError("Two phases in the plan have the same name.");
  for (const phase of p.phases) {
    if (phase.milestones.length > planLimits.milestonesPerPhase) throw new ConvexError(`Phase "${phase.name}" has more than ${planLimits.milestonesPerPhase} milestones.`);
    const titles = phase.milestones.map(m => key(m.title));
    if (new Set(titles).size !== titles.length) throw new ConvexError(`Phase "${phase.name}" has two milestones with the same title.`);
    for (const m of phase.milestones) if (m.tasks.length > planLimits.tasksPerMilestone) throw new ConvexError(`Milestone "${m.title}" has more than ${planLimits.tasksPerMilestone} tasks.`);
  }
  const codes = p.docs.map(d => key(d.code));
  if (new Set(codes).size !== codes.length) throw new ConvexError("Two docs in the plan have the same code.");
  for (const d of p.docs) if (d.feeds.some(i => !Number.isInteger(i) || i < 0 || i >= p.phases.length)) throw new ConvexError(`Doc ${d.code} feeds a phase that isn't in the plan.`);
}

/** Checks a planned task's status, note and dates (not in the future, finished after started). */
export function checkPlannedStatus(t: Pick<PlanTask, "title" | "status" | "note" | "startedAt" | "completedAt">, now = Date.now()) {
  const status = t.status ?? "Ready";
  const soon = now + 5 * 60_000;
  if (t.startedAt !== undefined && (!Number.isFinite(t.startedAt) || t.startedAt > soon)) throw new ConvexError(`"${t.title}" can't start in the future.`);
  if (t.completedAt !== undefined && (!Number.isFinite(t.completedAt) || t.completedAt > soon)) throw new ConvexError(`"${t.title}" can't be finished in the future.`);
  if (t.startedAt !== undefined && t.completedAt !== undefined && t.completedAt < t.startedAt) throw new ConvexError(`"${t.title}" finishes before it starts.`);
  if (t.completedAt !== undefined && status !== "Done") throw new ConvexError(`"${t.title}" has a finish date but isn't done.`);
  if (t.startedAt !== undefined && status === "Ready") throw new ConvexError(`"${t.title}" has a start date but is still ready. Use in progress, blocked or done.`);
  if (status === "Blocked" && !t.note?.trim()) throw new ConvexError(`"${t.title}" is blocked: add a note saying what's blocking it.`);
  if ((t.note?.trim().length ?? 0) > 2000) throw new ConvexError(`Keep the note on "${t.title}" under 2,000 characters.`);
}

type PlanPreview = { phases: { name: string; milestones: number; tasks: number; done: number; existing: boolean }[]; docs: string[] };

/** One proposal as the Inbox card (and the assistant's list_inbox) shows it. */
export async function describeItem(ctx: Db, owner: string, item: Doc<"inbox">) {
  const p = item.proposal;
  const base = { _id: item._id, source: item.source, createdAt: item._creationTime, kind: p.kind, next: null as string | null, link: null as string | null, at: null as number | null, plan: null as PlanPreview | null };
  const gone = (what: string) => `A ${what} that no longer exists`;
  switch (p.kind) {
    case "session": {
      const task = p.newTask ? `${p.newTask.title} (new task)` : await titleOf(ctx, owner, p.taskId) ?? gone("task");
      return { ...base, title: task, details: [`${p.minutes} min`, p.outcome, ...(p.skills.length ? [p.skills.join(", ")] : [])], body: p.contribution, next: p.nextStep || null, link: p.evidence || null, at: p.endedAt };
    }
    case "task": {
      const project = await titleOf(ctx, owner, p.projectId);
      return { ...base, title: p.title, details: [p.lane, `${p.minutes} min`, `${energyName[p.energy]} energy`, ...(project ? [project] : [])], body: `Done when: ${p.doneWhen}` };
    }
    case "idea": return { ...base, title: p.title, details: [p.lane], body: p.notes.length > 400 ? `${p.notes.slice(0, 400)}…` : p.notes || null };
    case "milestone": return { ...base, title: p.title, details: [await titleOf(ctx, owner, p.projectId) ?? gone("project")], body: p.doneWhen ? `Done when: ${p.doneWhen}` : null };
    case "nextStep": return { ...base, title: await titleOf(ctx, owner, p.taskId) ?? gone("task"), details: ["New next step"], body: null, next: p.nextStep };
    case "phase":
      return { ...base, title: p.name, details: [await titleOf(ctx, owner, p.projectId) ?? gone("project")], body: [p.goal && `Goal: ${p.goal}`, p.doneWhen && `Done when: ${p.doneWhen}`].filter(Boolean).join("\n") || null, next: p.nextStep ?? null };
    case "doc": {
      const project = await titleOf(ctx, owner, p.projectId) ?? gone("project");
      return { ...base, title: `${p.code} · ${p.title}`, details: [project, `Feeds ${plural(p.phaseIds.length, "phase")}`, p.written === false ? "Not written yet" : "Written"], body: p.summary ?? null, next: p.nextEdit ?? null, link: p.link ?? null };
    }
    case "docUpdate": {
      const doc = await ctx.db.get(p.docId);
      const own = doc && doc.owner === owner ? doc : null;
      const changed = (["code", "title", "summary", "sections", "link", "phaseIds", "nextEdit", "doneWhen", "written"] as const).filter(key => p[key] !== undefined)
        .map(key => ({ phaseIds: "feeds", nextEdit: "next edit", doneWhen: "done when" } as Record<string, string>)[key] ?? key);
      return { ...base, title: own ? `${own.code} · ${own.title}` : gone("doc"), details: [...(own ? [await titleOf(ctx, owner, own.projectId) ?? gone("project")] : []), `Changes: ${changed.join(", ") || "nothing"}`], body: p.summary || null, next: p.nextEdit || null, link: p.link || null };
    }
    case "research": {
      const briefs = p.sources.filter(s => s.kind === "brief").length;
      return { ...base, title: p.title, details: [await titleOf(ctx, owner, p.ideaId) ?? gone("idea"), plural(p.sources.length, "source"), ...(briefs ? [`${briefs} brief${briefs === 1 ? "" : "s"}`] : [])], body: [p.summary, ...p.sources.slice(0, 6).map(s => `· ${s.title} (${s.kind})`)].filter(Boolean).join("\n") || null };
    }
    case "report":
      return { ...base, title: p.title, details: [await titleOf(ctx, owner, p.ideaId) ?? gone("idea"), plural(p.findings.length, "finding")], body: [p.summary, ...p.findings.slice(0, 5).map(f => `· ${f.text}`)].filter(Boolean).join("\n") || null };
    case "decision":
      return { ...base, title: p.verdict, details: [await titleOf(ctx, owner, p.ideaId) ?? gone("idea"), `${p.kept.length} kept`, `${p.dropped.length} dropped`], body: p.rule ?? null };
    case "plan": {
      const project = p.projectId ? await ctx.db.get(p.projectId) : null;
      const own = project && project.owner === owner ? project : null;
      const existing = own ? new Set((await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", own._id)).collect()).map(x => x.name.trim().toLowerCase())) : new Set<string>();
      const name = p.newProject?.title ?? own?.title ?? gone("project");
      const plan: PlanPreview = {
        phases: p.phases.map(phase => {
          const tasks = phase.milestones.flatMap(m => m.tasks);
          return { name: phase.name, milestones: phase.milestones.length, tasks: tasks.length, done: tasks.filter(t => t.status === "Done").length, existing: existing.has(phase.name.trim().toLowerCase()) };
        }),
        docs: p.docs.map(d => d.code.toUpperCase()),
      };
      return { ...base, title: `Plan for ${name}: ${planCounts(p).text}`, details: [p.newProject ? "New project" : `Adds to ${name}`], body: p.newProject?.purpose ?? null, plan };
    }
  }
}

export const list = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const items = await ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(50);
    return Promise.all(items.map(item => describeItem(ctx, owner, item)));
  },
});

/** A planned task's status, applied after it's created, with its real dates and history. */
async function applyPlannedStatus(ctx: MutationCtx, owner: string, taskId: Id<"tasks">, t: PlanTask, source: string) {
  const status = t.status ?? "Ready";
  if (status === "Ready") return;
  checkPlannedStatus(t);
  const task = (await ctx.db.get(taskId))!;
  const now = Date.now();
  const note = t.note?.trim() || undefined;
  if (status === "In progress") {
    const startedAt = t.startedAt ?? now;
    await ctx.db.patch(task._id, { status, startedAt });
    await logEvent(ctx, owner, task, "started", { source, at: startedAt });
  } else if (status === "Blocked") {
    await ctx.db.patch(task._id, { status, nextStep: nextStepValue(note ?? ""), ...(t.startedAt !== undefined ? { startedAt: t.startedAt } : {}) });
    if (t.startedAt !== undefined) await logEvent(ctx, owner, task, "started", { source, at: t.startedAt });
    await logEvent(ctx, owner, task, "blocked", { note, source, at: now });
  } else {
    const completedAt = t.completedAt ?? now;
    const startedAt = t.startedAt ?? completedAt;
    await ctx.db.patch(task._id, { status, startedAt, completedAt });
    if (t.startedAt !== undefined) await logEvent(ctx, owner, task, "started", { source, at: startedAt });
    await logEvent(ctx, owner, task, "done", { note, source, at: completedAt });
  }
}

/** Refreshes a milestone; one the plan just completed is dated by its last finished task. */
async function settleMilestone(ctx: MutationCtx, milestoneId: Id<"milestones">) {
  const before = (await ctx.db.get(milestoneId))?.completedAt;
  await refreshMilestone(ctx, milestoneId);
  const after = await ctx.db.get(milestoneId);
  if (before !== undefined || after?.completedAt === undefined) return;
  const tasks = (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestoneId)).collect()).filter(t => t.status === "Done");
  const dates = tasks.map(t => t.completedAt).filter((x): x is number => x !== undefined);
  if (dates.length === tasks.length && dates.length) await ctx.db.patch(milestoneId, { completedAt: Math.max(...dates) });
}

/**
 * Applies a whole plan in one transaction: the project (if new), phases in order, milestones
 * in their phases, tasks in their milestones, then the docs and the phases each feeds. A
 * plan for a project that already has some of it only adds what's missing: phases are reused
 * by name, milestones by title within their phase, tasks by title within their milestone, and
 * docs by code (updated, with their feeds joined).
 */
export async function applyPlan(ctx: MutationCtx, owner: string, p: PlanProposal, source: string) {
  checkPlanShape(p);
  let projectId: Id<"projects">;
  if (p.projectId) {
    const project = await ownedProject(ctx, owner, p.projectId);
    if (project.status !== "Active") throw new ConvexError(`"${project.title}" isn't active, so a plan can't be added to it.`);
    projectId = project._id;
  } else if (p.newProject) {
    projectId = await ctx.db.insert("projects", { owner, title: nonempty(p.newProject.title), purpose: nonempty(p.newProject.purpose, 2000), status: "Active" });
  } else throw new ConvexError("This plan has no project. Discard it.");

  const key = (s: string) => s.trim().toLowerCase();
  const counts = { projectId, phases: 0, milestones: 0, tasks: 0, docs: 0, skipped: 0 };
  const existingPhases = (await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", projectId)).collect()).filter(x => x.owner === owner);
  const phaseIds: Id<"phases">[] = [];
  for (const phase of p.phases) {
    const same = existingPhases.find(x => key(x.name) === key(phase.name));
    const phaseId = same?._id ?? await addPhaseFor(ctx, owner, projectId, phase);
    if (!same) counts.phases += 1;
    phaseIds.push(phaseId);
    const inPhase = same ? await ctx.db.query("milestones").withIndex("by_phase", q => q.eq("phaseId", phaseId)).collect() : [];
    for (const m of phase.milestones) {
      const found = inPhase.find(x => x.owner === owner && key(x.title) === key(m.title));
      let milestoneId = found?._id;
      if (!milestoneId) {
        milestoneId = await addMilestoneFor(ctx, owner, { projectId, title: m.title, doneWhen: m.doneWhen });
        await setMilestonePhaseFor(ctx, owner, milestoneId, phaseId);
        counts.milestones += 1;
      }
      const titles = new Set(found ? (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestoneId)).collect()).map(t => key(t.title)) : []);
      for (const t of m.tasks) {
        if (titles.has(key(t.title))) { counts.skipped += 1; continue; }
        titles.add(key(t.title));
        checkPlannedStatus(t);
        const taskId = await createTaskFor(ctx, owner, { title: t.title, lane: t.lane, minutes: t.minutes, energy: t.energy, doneWhen: t.doneWhen, projectId, milestoneId, plannedSessions: t.plannedSessions }, source);
        await applyPlannedStatus(ctx, owner, taskId, t, source);
        counts.tasks += 1;
      }
      await settleMilestone(ctx, milestoneId);
    }
  }

  const docs = await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
  for (const d of p.docs) {
    const feeds = [...d.feeds.map(i => phaseIds[i]), ...(d.feedsExisting ?? [])];
    const same = docs.find(x => x.owner === owner && x.code === d.code.trim().toUpperCase());
    if (same) {
      await updateDocFor(ctx, owner, same._id, {
        code: same.code, title: d.title, summary: d.summary ?? same.summary, sections: d.sections ?? same.sections, link: d.link ?? same.link,
        phaseIds: [...new Set([...same.phaseIds, ...feeds])], nextEdit: d.nextEdit ?? same.nextEdit, doneWhen: d.doneWhen ?? same.doneWhen, written: d.written,
      });
    } else {
      await addDocFor(ctx, owner, projectId, { ...d, phaseIds: feeds }, source);
      counts.docs += 1;
    }
  }
  return counts;
}

export const approve = mutation({
  args: { itemId: v.id("inbox") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const item = await ctx.db.get(args.itemId);
    assertOwner(item, owner);
    const p = item.proposal;
    const source = item.source;
    switch (p.kind) {
      case "session": {
        const taskId = p.taskId ?? (p.newTask ? await createTaskFor(ctx, owner, p.newTask, source) : null);
        if (!taskId) throw new ConvexError("This session has no task to belong to. Discard it.");
        await saveLoggedSession(ctx, owner, { taskId, minutes: p.minutes, outcome: p.outcome, contribution: p.contribution, nextStep: p.nextStep, skills: p.skills, evidence: p.evidence, endedAt: p.endedAt, source, key: `inbox:${item._id}` });
        break;
      }
      case "task": await createTaskFor(ctx, owner, p, source); break;
      case "idea": await createIdeaFor(ctx, owner, p); break;
      case "milestone": await addMilestoneFor(ctx, owner, p); break;
      case "nextStep": {
        const task = await ctx.db.get(p.taskId);
        assertOwner(task, owner);
        if (task.status === "Done" || task.status === "Archived") throw new ConvexError(`"${task.title}" is ${task.status.toLowerCase()}, so it has no next step to change.`);
        await ctx.db.patch(task._id, { nextStep: nextStepValue(p.nextStep) });
        break;
      }
      case "phase": {
        const project = await ownedProject(ctx, owner, p.projectId);
        const taken = (await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", project._id)).collect()).some(x => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
        if (taken) throw new ConvexError(`This project already has a phase called "${p.name}".`);
        await addPhaseFor(ctx, owner, p.projectId, p);
        break;
      }
      case "doc": await addDocFor(ctx, owner, p.projectId, p, source); break;
      case "docUpdate": {
        const doc = await ctx.db.get(p.docId);
        assertOwner(doc, owner);
        await updateDocFor(ctx, owner, doc._id, {
          code: p.code ?? doc.code, title: p.title ?? doc.title, summary: p.summary ?? doc.summary, sections: p.sections ?? doc.sections, link: p.link ?? doc.link,
          phaseIds: p.phaseIds ?? doc.phaseIds, nextEdit: p.nextEdit ?? doc.nextEdit, doneWhen: p.doneWhen ?? doc.doneWhen, written: p.written,
        });
        break;
      }
      case "research": {
        // Sources for a thread that already exists (same title) join it instead of repeating it.
        const threads = await ctx.db.query("research").withIndex("by_idea", q => q.eq("ideaId", p.ideaId)).collect();
        const same = threads.find(x => x.owner === owner && x.title.trim().toLowerCase() === p.title.trim().toLowerCase());
        if (same) for (const s of p.sources) await addSourceFor(ctx, owner, same._id, s, source);
        else await addResearchFor(ctx, owner, p.ideaId, p, source);
        break;
      }
      case "report": await saveReportFor(ctx, owner, p.ideaId, p, source); break;
      case "decision": await setDecisionFor(ctx, owner, p.ideaId, p, source); break;
      case "plan": await applyPlan(ctx, owner, p, source); break;
    }
    await ctx.db.delete(item._id);
    return p.kind;
  },
});

export const discard = mutation({
  args: { itemId: v.id("inbox") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const item = await ctx.db.get(args.itemId);
    assertOwner(item, owner);
    await ctx.db.delete(item._id);
  },
});
