import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { brainstormValues } from "./lib/ideaRules";
import { nonempty, requireOwner } from "./lib/ownership";
import { refreshMilestone } from "./lib/projects";
import { effortValues, hasPrerequisiteLoop, smallerStepValues } from "./lib/taskRules";
import { isWeekKey } from "./lib/time";
import { dateKeyValue, httpUrl, optionalText, tagList, timezoneValue } from "./lib/validate";
import { artifactStatus, brainstorm, decision, lane, outcome, projectStatus, researchSource, swapReason, taskStatus, workingStatus } from "./schema";
import { docCodeValue, linkValue } from "./constellation";
import { plannedSessionsValue } from "./tasks";

// Data control: a complete private export, a restore into an empty workspace, and
// deletion of everything an account owns. Screenshots are files, not JSON, so a backup
// keeps their evidence links but not the images themselves.

export const backupFormat = "becoming-backup";
export const backupVersion = 1;
const tableLimit = 10000;
// Restore runs as one transaction so it can't half-finish; this keeps it well inside
// Convex's per-transaction limits. Larger workspaces would need a staged restore.
const restoreLimit = 4000;

export const exportAll = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const [profiles, projects, milestones, ideas, tasks, sessions, artifacts, commitments, reflections, plans, phases, docs, research, reports] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).take(1),
      ctx.db.query("projects").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("reflections").withIndex("by_owner_week", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("phases").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("projectDocs").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("research").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
      ctx.db.query("reports").withIndex("by_owner", q => q.eq("owner", owner)).take(tableLimit),
    ]);
    const profile = profiles[0];
    return {
      format: backupFormat, version: backupVersion,
      profile: profile ? { motive: profile.motive, timezone: profile.timezone, weeklyTarget: profile.weeklyTarget, laneFocus: profile.laneFocus, pinnedTaskId: profile.pinnedTaskId, onboardedAt: profile.onboardedAt, focusQuotes: profile.focusQuotes, focusMusic: profile.focusMusic, reminderOn: profile.reminderOn, reminderTime: profile.reminderTime, reminderDays: profile.reminderDays, reminderEmail: profile.reminderEmail } : null,
      projects: projects.map(p => ({ id: p._id, title: p.title, purpose: p.purpose, status: p.status, outcome: p.outcome, ideaId: p.ideaId })),
      milestones: milestones.map(m => ({ id: m._id, projectId: m.projectId, title: m.title, doneWhen: m.doneWhen, order: m.order, completedAt: m.completedAt, phaseId: m.phaseId })),
      ideas: ideas.map(i => ({ id: i._id, title: i.title, notes: i.notes, lane: i.lane, taskId: i.taskId, archivedAt: i.archivedAt, brainstorm: i.brainstorm })),
      tasks: tasks.map(t => ({ id: t._id, title: t.title, lane: t.lane, status: t.status, archivedFrom: t.archivedFrom, archivedWithProject: t.archivedWithProject, projectId: t.projectId, milestoneId: t.milestoneId, ideaId: t.ideaId, minutes: t.minutes, energy: t.energy, doneWhen: t.doneWhen, nextStep: t.nextStep, smallerStep: t.smallerStep, smallerDone: t.smallerDone, smallerMinutes: t.smallerMinutes, dependencies: t.dependencies, startedAt: t.startedAt, completedAt: t.completedAt, skills: t.skills, plannedSessions: t.plannedSessions })),
      sessions: sessions.map(s => ({ id: s._id, taskId: s.taskId, lane: s.lane, title: s.title, outcome: s.outcome, contribution: s.contribution, nextStep: s.nextStep, evidence: s.evidence, startedAt: s.startedAt, endedAt: s.endedAt, smaller: s.smaller, doneWhen: s.doneWhen, plannedMinutes: s.plannedMinutes, projectId: s.projectId, recommended: s.recommended, swapReason: s.swapReason, skills: s.skills, source: s.source })),
      artifacts: artifacts.map(a => ({ id: a._id, sessionId: a.sessionId, title: a.title, url: a.url, status: a.status, portfolioCandidate: a.portfolioCandidate, notes: a.notes, skills: a.skills, publishedUrl: a.publishedUrl, publishedOn: a.publishedOn, candidateSince: a.candidateSince })),
      weeklyCommitments: commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })),
      reflections: reflections.map(r => ({ week: r.week, learning: r.learning, intention: r.intention })),
      weekPlans: plans.map(p => ({ week: p.week, intention: p.intention, taskIds: p.taskIds })),
      // The project constellation: phases, docs, and each idea's research, report and decision.
      phases: phases.map(p => ({ id: p._id, projectId: p.projectId, order: p.order, name: p.name, goal: p.goal, nextStep: p.nextStep, doneWhen: p.doneWhen })),
      projectDocs: docs.map(d => ({ projectId: d.projectId, code: d.code, title: d.title, summary: d.summary, sections: d.sections, link: d.link, phaseIds: d.phaseIds, nextEdit: d.nextEdit, doneWhen: d.doneWhen, writtenAt: d.writtenAt, updatedAt: d.updatedAt, source: d.source })),
      research: research.map(r => ({ ideaId: r.ideaId, title: r.title, summary: r.summary, sources: r.sources, source: r.source })),
      reports: reports.map(r => ({ ideaId: r.ideaId, title: r.title, summary: r.summary, findings: r.findings, decision: r.decision, source: r.source, writtenAt: r.writtenAt })),
    };
  },
});

// The restore argument mirrors the export. IDs inside a backup are the old record IDs,
// used only to rebuild the links between restored records.
const backup = v.object({
  format: v.string(), version: v.number(), exportedAt: v.optional(v.number()),
  profile: v.union(v.null(), v.object({ motive: v.string(), timezone: v.optional(v.string()), weeklyTarget: v.optional(v.number()), laneFocus: v.optional(lane), pinnedTaskId: v.optional(v.string()),
    onboardedAt: v.optional(v.number()), focusQuotes: v.optional(v.boolean()), focusMusic: v.optional(v.boolean()), reminderOn: v.optional(v.boolean()),
    reminderTime: v.optional(v.union(v.literal("19:30"), v.literal("20:30"), v.literal("21:30"))), reminderDays: v.optional(v.union(v.literal("weekdays"), v.literal("everyday"))), reminderEmail: v.optional(v.boolean()) })),
  projects: v.array(v.object({ id: v.string(), title: v.string(), purpose: v.string(), status: projectStatus, outcome: v.optional(v.string()), ideaId: v.optional(v.string()) })),
  milestones: v.array(v.object({ id: v.string(), projectId: v.string(), title: v.string(), doneWhen: v.optional(v.string()), order: v.number(), completedAt: v.optional(v.number()), phaseId: v.optional(v.string()) })),
  ideas: v.array(v.object({ id: v.string(), title: v.string(), notes: v.string(), lane, taskId: v.optional(v.string()), archivedAt: v.optional(v.number()), brainstorm: v.optional(brainstorm) })),
  tasks: v.array(v.object({
    id: v.string(), title: v.string(), lane, status: taskStatus, archivedFrom: v.optional(workingStatus), archivedWithProject: v.optional(v.boolean()),
    projectId: v.optional(v.string()), milestoneId: v.optional(v.string()), ideaId: v.optional(v.string()),
    minutes: v.number(), energy: v.number(), doneWhen: v.string(), nextStep: v.string(),
    smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()), dependencies: v.array(v.string()),
    startedAt: v.optional(v.number()), completedAt: v.optional(v.number()), skills: v.optional(v.array(v.string())), plannedSessions: v.optional(v.number()),
  })),
  sessions: v.array(v.object({
    id: v.string(), taskId: v.string(), lane, title: v.string(), outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string(),
    startedAt: v.optional(v.number()), endedAt: v.number(), smaller: v.optional(v.boolean()), doneWhen: v.optional(v.string()),
    plannedMinutes: v.optional(v.number()), projectId: v.optional(v.string()), recommended: v.optional(v.boolean()), swapReason: v.optional(swapReason),
    skills: v.optional(v.array(v.string())), source: v.optional(v.string()),
  })),
  artifacts: v.array(v.object({
    id: v.string(), sessionId: v.string(), title: v.string(), url: v.string(), status: artifactStatus, portfolioCandidate: v.boolean(),
    notes: v.optional(v.string()), skills: v.optional(v.array(v.string())), publishedUrl: v.optional(v.string()), publishedOn: v.optional(v.string()), candidateSince: v.optional(v.number()),
  })),
  weeklyCommitments: v.array(v.object({ week: v.string(), target: v.number(), paused: v.boolean() })),
  reflections: v.array(v.object({ week: v.string(), learning: v.string(), intention: v.string() })),
  weekPlans: v.optional(v.array(v.object({ week: v.string(), intention: v.string(), taskIds: v.array(v.string()) }))),
  // The constellation tables are optional, so backups made before them still restore.
  phases: v.optional(v.array(v.object({ id: v.string(), projectId: v.string(), order: v.number(), name: v.string(), goal: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()) }))),
  projectDocs: v.optional(v.array(v.object({
    projectId: v.string(), code: v.string(), title: v.string(), summary: v.optional(v.string()), sections: v.optional(v.number()), link: v.optional(v.string()),
    phaseIds: v.array(v.string()), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()), writtenAt: v.optional(v.number()), updatedAt: v.number(), source: v.string(),
  }))),
  research: v.optional(v.array(v.object({ ideaId: v.string(), title: v.string(), summary: v.optional(v.string()), sources: v.array(researchSource), source: v.string() }))),
  reports: v.optional(v.array(v.object({
    ideaId: v.string(), title: v.string(), summary: v.optional(v.string()), findings: v.array(v.object({ text: v.string(), basis: v.optional(v.string()) })),
    decision: v.optional(decision), source: v.string(), writtenAt: v.number(),
  }))),
});

type Backup = Infer<typeof backup>;

/** Trimmed text that must fit `max`; a backup that breaks a limit is refused, never cut short. */
function limited(value: string, max: number, label: string) {
  return optionalText(value, max, label) ?? "";
}

const invalid = (what: string) => new ConvexError(`The backup has ${what}, so it can't be restored safely.`);

// Rules that span records, checked before anything is written.
function assertRestorable(data: Backup) {
  for (const table of [data.projects, data.milestones, data.ideas, data.tasks, data.sessions, data.artifacts, data.phases ?? []]) {
    if (new Set(table.map(item => item.id)).size !== table.length) throw invalid("a repeated record");
  }
  const edges = new Map<string, string[]>();
  for (const t of data.tasks) {
    const prerequisites = [...new Set(t.dependencies)];
    if (prerequisites.includes(t.id)) throw invalid("a task that waits on itself");
    if (prerequisites.length > 10) throw invalid("a task with more than 10 prerequisites");
    edges.set(t.id, prerequisites);
  }
  if (hasPrerequisiteLoop(edges)) throw invalid("tasks that wait on each other in a loop");
  // A milestone implies its project, and an idea and its task point at each other.
  const milestoneProject = new Map(data.milestones.map(m => [m.id, m.projectId]));
  for (const t of data.tasks) if (t.milestoneId !== undefined && milestoneProject.has(t.milestoneId) && milestoneProject.get(t.milestoneId) !== t.projectId) throw invalid("a task whose milestone belongs to another project");
  const taskIdea = new Map(data.tasks.map(t => [t.id, t.ideaId]));
  for (const i of data.ideas) if (i.taskId !== undefined && taskIdea.has(i.taskId) && taskIdea.get(i.taskId) !== i.id) throw invalid("an idea linked to another idea's task");
  for (const m of data.milestones) if (!Number.isFinite(m.order)) throw invalid("a milestone without a valid position");
  // The constellation: a milestone's phase, and the phases a doc feeds, are in its own project.
  const phaseProject = new Map((data.phases ?? []).map(p => [p.id, p.projectId]));
  const mostPerProject = (items: { projectId: string }[]) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
    return Math.max(0, ...counts.values());
  };
  for (const p of data.phases ?? []) if (!Number.isFinite(p.order)) throw invalid("a phase without a valid position");
  if (mostPerProject(data.phases ?? []) > 40 || mostPerProject(data.projectDocs ?? []) > 40) throw invalid("a project with more than 40 phases or docs");
  for (const m of data.milestones) if (m.phaseId !== undefined && phaseProject.has(m.phaseId) && phaseProject.get(m.phaseId) !== m.projectId) throw invalid("a milestone whose phase belongs to another project");
  const docCodes = new Set<string>();
  for (const d of data.projectDocs ?? []) {
    const code = `${d.projectId}|${d.code.trim().toUpperCase()}`;
    if (docCodes.has(code)) throw invalid("two docs with the same code in one project");
    docCodes.add(code);
    if (d.phaseIds.some(id => phaseProject.has(id) && phaseProject.get(id) !== d.projectId)) throw invalid("a doc that feeds another project's phase");
    if (!Number.isFinite(d.updatedAt) || (d.writtenAt !== undefined && !Number.isFinite(d.writtenAt))) throw invalid("a doc with invalid dates");
    if (d.sections !== undefined && (!Number.isInteger(d.sections) || d.sections < 0 || d.sections > 999)) throw invalid("a doc with an invalid section count");
  }
  for (const r of data.research ?? []) {
    if (r.sources.length > 50) throw invalid("a research thread with more than 50 sources");
    if (r.sources.some(s => !Number.isFinite(s.at))) throw invalid("a source with an invalid date");
  }
  const reportIdeas = new Set<string>();
  for (const r of data.reports ?? []) {
    if (reportIdeas.has(r.ideaId)) throw invalid("two reports for the same idea");
    reportIdeas.add(r.ideaId);
    if (r.findings.length > 20 || !Number.isFinite(r.writtenAt)) throw invalid("an invalid report");
    if (r.decision && (!Number.isFinite(r.decision.at) || r.decision.kept.length > 12 || r.decision.dropped.length > 12)) throw invalid("an invalid decision");
  }
  for (const s of data.sessions) {
    if (!Number.isFinite(s.endedAt) || (s.startedAt !== undefined && !(s.startedAt <= s.endedAt))) throw invalid("a session with invalid times");
    if (s.plannedMinutes !== undefined && (!Number.isInteger(s.plannedMinutes) || s.plannedMinutes < 5 || s.plannedMinutes > 240)) throw invalid("a session with an invalid planned length");
  }
  for (const a of data.artifacts) {
    if (a.status === "Published" && (!a.publishedUrl || !a.publishedOn)) throw invalid("published evidence without its link and date");
    if (a.publishedOn && Date.parse(`${a.publishedOn}T00:00:00Z`) > Date.now() + 86_400_000) throw invalid("a publication date in the future");
    if (a.status !== "Published" && (a.publishedUrl || a.publishedOn)) throw invalid("unpublished evidence with publication details");
  }
  const weeks = new Set<string>();
  for (const c of data.weeklyCommitments) {
    if (!isWeekKey(c.week) || !Number.isInteger(c.target) || c.target < 1 || c.target > 6) throw invalid("an invalid weekly commitment");
    if (weeks.has(c.week)) throw invalid("two commitments for the same week");
    weeks.add(c.week);
  }
  const planWeeks = new Set<string>();
  for (const p of data.weekPlans ?? []) {
    if (planWeeks.has(p.week)) throw invalid("two plans for the same week");
    planWeeks.add(p.week);
  }
  const reflectionWeeks = new Set<string>();
  for (const r of data.reflections) {
    if (!isWeekKey(r.week)) throw invalid("an invalid reflection week");
    if (reflectionWeeks.has(r.week)) throw invalid("two reflections for the same week");
    reflectionWeeks.add(r.week);
  }
  const profile = data.profile;
  if (profile?.timezone !== undefined) timezoneValue(profile.timezone, "The backup has an invalid timezone, so it can't be restored safely.");
  if (profile?.weeklyTarget !== undefined && (!Number.isInteger(profile.weeklyTarget) || profile.weeklyTarget < 1 || profile.weeklyTarget > 6)) throw invalid("an invalid weekly target");
}

async function workspaceIsEmpty(ctx: Pick<QueryCtx, "db">, owner: string) {
  const checks = await Promise.all([
    ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).first(),
    ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).first(),
    ctx.db.query("projects").withIndex("by_owner", q => q.eq("owner", owner)).first(),
    ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).first(),
    ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).first(),
    ctx.db.query("reflections").withIndex("by_owner_week", q => q.eq("owner", owner)).first(),
  ]);
  return checks.every(item => item === null);
}

export const isEmpty = query({
  args: {},
  handler: async ctx => workspaceIsEmpty(ctx, await requireOwner(ctx)),
});

// Restores a backup into an empty workspace, in one transaction: either everything is
// restored with its links intact, or nothing changes. Restoring twice is refused because
// the workspace is no longer empty, so a backup can't be duplicated by accident.
export const importBackup = mutation({
  args: { backup },
  handler: async (ctx, { backup: data }) => {
    const owner = await requireOwner(ctx);
    if (data.format !== backupFormat) throw new ConvexError("That file isn't a Becoming backup.");
    if (data.version !== backupVersion) throw new ConvexError(`This backup is version ${data.version}; this app restores version ${backupVersion}.`);
    const phases = data.phases ?? [], docs = data.projectDocs ?? [], research = data.research ?? [], reports = data.reports ?? [];
    const total = data.projects.length + data.milestones.length + data.ideas.length + data.tasks.length + data.sessions.length + data.artifacts.length + data.weeklyCommitments.length + data.reflections.length + (data.weekPlans?.length ?? 0)
      + phases.length + docs.length + research.length + reports.length;
    if (total > restoreLimit) throw new ConvexError(`This backup has ${total} records; restore handles up to ${restoreLimit} at once.`);
    if (!(await workspaceIsEmpty(ctx, owner))) throw new ConvexError("Restore works only into an empty workspace. Delete this workspace's data first, or use a new account.");

    const ids = { projects: new Map<string, Id<"projects">>(), phases: new Map<string, Id<"phases">>(), milestones: new Map<string, Id<"milestones">>(), ideas: new Map<string, Id<"ideas">>(), tasks: new Map<string, Id<"tasks">>(), sessions: new Map<string, Id<"sessions">>() };
    const need = <T>(map: Map<string, T>, id: string, what: string) => {
      const found = map.get(id);
      if (!found) throw new ConvexError(`The backup refers to a missing ${what}, so it can't be restored safely.`);
      return found;
    };
    const optional = <T>(map: Map<string, T>, id: string | undefined, what: string) => (id === undefined ? undefined : need(map, id, what));

    // A backup is checked by the same rules as the forms that created it. Anything
    // invalid throws, and the transaction leaves the workspace empty.
    assertRestorable(data);

    for (const p of data.projects) ids.projects.set(p.id, await ctx.db.insert("projects", { owner, title: nonempty(p.title), purpose: nonempty(p.purpose, 2000), status: p.status, outcome: optionalText(p.outcome, 2000, "a project outcome") }));
    // completedAt is checked against the linked tasks below: a backed-up date is kept only
    // if the milestone really is complete, and a missing one is filled in.
    for (const p of phases) {
      ids.phases.set(p.id, await ctx.db.insert("phases", {
        owner, projectId: need(ids.projects, p.projectId, "project"), order: p.order, name: nonempty(p.name, 120),
        goal: optionalText(p.goal, 1000, "a phase goal"), nextStep: optionalText(p.nextStep, 2000, "a phase's next step"), doneWhen: optionalText(p.doneWhen, 1000, "a phase's done-when"),
      }));
    }
    for (const m of data.milestones) ids.milestones.set(m.id, await ctx.db.insert("milestones", { owner, projectId: need(ids.projects, m.projectId, "project"), title: nonempty(m.title), doneWhen: optionalText(m.doneWhen, 1000, "a milestone outcome"), order: m.order, completedAt: m.completedAt, phaseId: optional(ids.phases, m.phaseId, "phase") }));
    for (const i of data.ideas) ids.ideas.set(i.id, await ctx.db.insert("ideas", { owner, title: nonempty(i.title), notes: limited(i.notes, 10000, "idea notes"), lane: i.lane, archivedAt: i.archivedAt, brainstorm: i.brainstorm ? brainstormValues(i.brainstorm) : undefined }));
    for (const t of data.tasks) {
      ids.tasks.set(t.id, await ctx.db.insert("tasks", {
        owner, title: nonempty(t.title), lane: t.lane, status: t.status, archivedFrom: t.archivedFrom,
        ...(t.archivedWithProject && t.status === "Archived" ? { archivedWithProject: true } : {}),
        projectId: optional(ids.projects, t.projectId, "project"), milestoneId: optional(ids.milestones, t.milestoneId, "milestone"), ideaId: optional(ids.ideas, t.ideaId, "idea"),
        ...effortValues(t.minutes, t.energy), doneWhen: nonempty(t.doneWhen, 1000), nextStep: limited(t.nextStep, 2000, "a next step"),
        ...smallerStepValues(t), dependencies: [],
        startedAt: t.startedAt, completedAt: t.completedAt, ...(t.skills?.length ? { skills: tagList(t.skills, 5) } : {}),
        plannedSessions: plannedSessionsValue(t.plannedSessions),
      }));
    }
    // Second pass: links that point between restored records of the same kind.
    for (const t of data.tasks) if (t.dependencies.length) await ctx.db.patch(ids.tasks.get(t.id)!, { dependencies: [...new Set(t.dependencies)].map(id => need(ids.tasks, id, "prerequisite")) });
    for (const i of data.ideas) if (i.taskId) await ctx.db.patch(ids.ideas.get(i.id)!, { taskId: need(ids.tasks, i.taskId, "task") });
    for (const p of data.projects) if (p.ideaId) await ctx.db.patch(ids.projects.get(p.id)!, { ideaId: need(ids.ideas, p.ideaId, "idea") });
    for (const milestoneId of ids.milestones.values()) await refreshMilestone(ctx, milestoneId);
    for (const s of data.sessions) {
      ids.sessions.set(s.id, await ctx.db.insert("sessions", {
        owner, taskId: need(ids.tasks, s.taskId, "task"), key: `restored:${s.id}`, lane: s.lane, title: nonempty(s.title, 1000), outcome: s.outcome,
        contribution: nonempty(s.contribution, 4000), nextStep: limited(s.nextStep, 2000, "a next step"), evidence: s.evidence ? httpUrl(s.evidence) : "",
        startedAt: s.startedAt, endedAt: s.endedAt, smaller: s.smaller, doneWhen: optionalText(s.doneWhen, 1000, "a session’s done-when"), plannedMinutes: s.plannedMinutes,
        projectId: optional(ids.projects, s.projectId, "project"), recommended: s.recommended, swapReason: s.swapReason,
        ...(s.skills?.length ? { skills: tagList(s.skills, 5) } : {}),
        ...(s.source ? { source: limited(s.source, 60, "a session’s source") } : {}),
      }));
    }
    for (const a of data.artifacts) {
      await ctx.db.insert("artifacts", {
        owner, sessionId: need(ids.sessions, a.sessionId, "session"), title: nonempty(a.title, 1000), url: httpUrl(a.url), status: a.status, portfolioCandidate: a.portfolioCandidate,
        notes: optionalText(a.notes, 4000, "evidence notes"), skills: a.skills ? tagList(a.skills) : undefined,
        publishedUrl: a.publishedUrl ? httpUrl(a.publishedUrl) : undefined, publishedOn: a.publishedOn ? dateKeyValue(a.publishedOn, "The backup has an invalid publication date.") : undefined, candidateSince: a.candidateSince,
      });
    }
    for (const c of data.weeklyCommitments) await ctx.db.insert("weeklyCommitments", { owner, week: c.week, target: c.target, paused: c.paused });
    for (const p of data.weekPlans ?? []) {
      if (!isWeekKey(p.week) || p.taskIds.length > 12) throw invalid("an invalid weekly plan");
      await ctx.db.insert("weekPlans", { owner, week: p.week, intention: limited(p.intention, 120, "an intention"), taskIds: [...new Set(p.taskIds)].map(id => need(ids.tasks, id, "lined-up step")) });
    }
    for (const d of docs) {
      await ctx.db.insert("projectDocs", {
        owner, projectId: need(ids.projects, d.projectId, "project"), code: docCodeValue(d.code), title: nonempty(d.title, 120), summary: optionalText(d.summary, 2000, "a doc summary"),
        sections: d.sections, link: linkValue(d.link), phaseIds: [...new Set(d.phaseIds)].map(id => need(ids.phases, id, "phase")),
        nextEdit: optionalText(d.nextEdit, 1000, "a doc's next edit"), doneWhen: optionalText(d.doneWhen, 1000, "a doc's done-when"),
        writtenAt: d.writtenAt, updatedAt: d.updatedAt, source: limited(d.source, 60, "a doc's source") || "app",
      });
    }
    for (const r of research) {
      await ctx.db.insert("research", {
        owner, ideaId: need(ids.ideas, r.ideaId, "idea"), title: nonempty(r.title, 120), summary: optionalText(r.summary, 2000, "a research summary"), source: limited(r.source, 60, "a research source") || "app",
        sources: r.sources.map(s => ({ title: nonempty(s.title, 200), ...(s.url ? { url: httpUrl(s.url) } : {}), kind: s.kind, by: limited(s.by, 60, "a source's author") || "app", at: s.at })),
      });
    }
    for (const r of reports) {
      const d = r.decision;
      await ctx.db.insert("reports", {
        owner, ideaId: need(ids.ideas, r.ideaId, "idea"), title: nonempty(r.title, 160), summary: optionalText(r.summary, 4000, "a report summary"),
        findings: r.findings.map(f => ({ text: nonempty(f.text, 600), ...(f.basis?.trim() ? { basis: nonempty(f.basis, 200) } : {}) })),
        ...(d ? { decision: { verdict: nonempty(d.verdict, 200), ...(d.rule?.trim() ? { rule: nonempty(d.rule, 600) } : {}), kept: d.kept.map(k => nonempty(k, 200)), dropped: d.dropped.map(k => nonempty(k, 200)), at: d.at } } : {}),
        source: limited(r.source, 60, "a report's source") || "app", writtenAt: r.writtenAt,
      });
    }
    for (const r of data.reflections) await ctx.db.insert("reflections", { owner, week: r.week, learning: limited(r.learning, 2000, "a reflection"), intention: limited(r.intention, 2000, "a reflection") });
    if (data.profile) {
      const fields = { motive: limited(data.profile.motive, 1000, "the motive"), timezone: data.profile.timezone, weeklyTarget: data.profile.weeklyTarget, laneFocus: data.profile.laneFocus, pinnedTaskId: optional(ids.tasks, data.profile.pinnedTaskId, "pinned task"),
        onboardedAt: data.profile.onboardedAt, focusQuotes: data.profile.focusQuotes, focusMusic: data.profile.focusMusic, reminderOn: data.profile.reminderOn, reminderTime: data.profile.reminderTime, reminderDays: data.profile.reminderDays, reminderEmail: data.profile.reminderEmail };
      const existing = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("profiles", { owner, ...fields });
    }
    return { projects: data.projects.length, milestones: data.milestones.length, ideas: data.ideas.length, tasks: data.tasks.length, sessions: data.sessions.length, artifacts: data.artifacts.length, weeks: data.weeklyCommitments.length, reflections: data.reflections.length, plans: data.weekPlans?.length ?? 0,
      phases: phases.length, docs: docs.length, research: research.length, reports: reports.length };
  },
});

// Deletes everything the account owns, a batch at a time so a large workspace stays
// inside each transaction's limits. The browser calls it until `done` is true.
// Evidence goes first (with its screenshot files), profiles last.
const batchSize = 400;

export const deleteBatch = mutation({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    let budget = batchSize;
    const take = (n: number) => Math.max(0, n);
    const artifacts = await ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget));
    for (const artifact of artifacts) {
      if (artifact.imageId) await ctx.storage.delete(artifact.imageId);
      await ctx.db.delete(artifact._id);
    }
    budget -= artifacts.length;
    const groups: (() => Promise<{ _id: Id<TableNames> }[]>)[] = [
      () => ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("projects").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("reflections").withIndex("by_owner_week", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner)).take(take(budget)),
      // Assistant access goes with the data: pending proposals and every access token.
      () => ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("apiTokens").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("projectDocs").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("phases").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("research").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("reports").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).take(take(budget)),
      () => ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).take(take(budget)),
    ];
    for (const group of groups) {
      if (budget <= 0) return { done: false };
      const docs = await group();
      for (const doc of docs) await ctx.db.delete(doc._id);
      budget -= docs.length;
    }
    return { done: budget > 0 };
  },
});
