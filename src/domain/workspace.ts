import { z } from "zod";

export const lanes = ["Projects", "Showcases", "Writing"] as const;
export const laneSchema = z.enum(lanes);
export type Lane = z.infer<typeof laneSchema>;
export const taskSchema = z.object({
  id: z.string(), title: z.string().trim().min(1).max(160), lane: laneSchema,
  project: z.string().max(160), minutes: z.number().int().min(5).max(240),
  energy: z.number().int().min(1).max(3),
  status: z.enum(["Ready", "In progress", "Blocked", "Done"]),
  doneWhen: z.string().trim().min(1).max(1000), nextStep: z.string().max(2000),
  smallerStep: z.string().max(1000).optional(), smallerDone: z.string().max(1000).optional(),
  smallerMinutes: z.number().int().min(5).max(240).optional(),
  dependencies: z.array(z.string()).default([]), createdAt: z.number(),
});
export type Task = z.infer<typeof taskSchema>;
export const ideaSchema = z.object({
  id: z.string(), title: z.string().trim().min(1).max(160),
  lane: laneSchema, notes: z.string().max(10000), taskId: z.string().optional(),
});
export type Idea = z.infer<typeof ideaSchema>;
export const sessionSchema = z.object({
  id: z.string(), taskId: z.string(), title: z.string(), lane: laneSchema,
  outcome: z.enum(["Finished", "Made progress", "Blocked"]),
  note: z.string().trim().min(1).max(4000), nextStep: z.string().max(2000),
  evidence: z.union([z.literal(""), z.url().refine(v => /^https?:\/\//.test(v))]),
  startedAt: z.number(), endedAt: z.number(), smaller: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;
export const workspaceSchema = z.object({
  version: z.literal(1), motive: z.string().trim().min(1).max(1000),
  weeklyTarget: z.number().int().min(1).max(7), timezone: z.string(),
  tasks: z.array(taskSchema), ideas: z.array(ideaSchema), sessions: z.array(sessionSchema),
  activeSession: z.object({ id: z.string(), taskId: z.string(), startedAt: z.number(), smaller: z.boolean() }).nullable(),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Recommendation = { task: Task; smaller: boolean; reason: string };

export function recommend(workspace: Workspace, minutes: number, energy: number): Recommendation[] {
  const recent = workspace.sessions.slice().sort((a, b) => b.endedAt - a.endedAt).slice(0, 6);
  const count = (lane: Lane) => recent.filter(s => s.lane === lane).length;
  const repeatedLane = recent.length >= 2 && recent[0].lane === recent[1].lane ? recent[0].lane : null;
  return workspace.tasks.filter(t => ["Ready", "In progress"].includes(t.status))
    .filter(t => t.dependencies.every(id => workspace.tasks.some(d => d.id === id && d.status === "Done")))
    .flatMap(task => {
      const smaller = task.minutes > minutes || task.energy > energy;
      if (smaller && !(task.smallerStep && task.smallerDone && task.smallerMinutes && task.smallerMinutes <= minutes)) return [];
      return [{ task, smaller, reason: `${task.lane} has ${count(task.lane)} of your last ${recent.length} sessions. ${smaller ? "This defined smaller step fits your capacity." : "This next step fits your capacity."}` }];
    })
    .sort((a, b) => Number(a.task.lane === repeatedLane) - Number(b.task.lane === repeatedLane)
      || count(a.task.lane) - count(b.task.lane)
      || Number(b.task.status === "In progress") - Number(a.task.status === "In progress")
      || a.task.createdAt - b.task.createdAt);
}

export function finishSession(workspace: Workspace, raw: Session): Workspace {
  const session = sessionSchema.parse(raw);
  if (workspace.sessions.some(s => s.id === session.id)) return workspace;
  const active = workspace.activeSession;
  if (!active || active.id !== session.id || active.taskId !== session.taskId) throw new Error("This session is no longer active.");
  if (session.outcome !== "Finished" && !session.nextStep.trim()) throw new Error("Add the next step or blocker before saving.");
  const task = workspace.tasks.find(t => t.id === session.taskId);
  if (!task) throw new Error("The task could not be found.");
  // The session's identity and smaller-step mode come from stored state, not form input.
  const trusted = { ...session, lane: task.lane, startedAt: active.startedAt, smaller: active.smaller };
  return {
    ...workspace, activeSession: null, sessions: [...workspace.sessions, trusted],
    tasks: workspace.tasks.map(t => t.id !== task.id ? t : {
      ...t, status: session.outcome === "Blocked" ? "Blocked" : session.outcome === "Finished" && !active.smaller ? "Done" : "In progress",
      nextStep: session.nextStep || "Continue from your last recorded contribution.",
      // A completed smaller step should not be recommended repeatedly.
      ...(active.smaller && session.outcome === "Finished" ? { smallerStep: undefined, smallerDone: undefined, smallerMinutes: undefined } : {}),
    }),
  };
}

export function weekKey(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  const part = (key: string) => Number(parts.find(p => p.type === key)!.value);
  const day = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function weekSessions(workspace: Workspace, now: number): Session[] {
  return workspace.sessions.filter(s => weekKey(s.endedAt, workspace.timezone) === weekKey(now, workspace.timezone));
}
