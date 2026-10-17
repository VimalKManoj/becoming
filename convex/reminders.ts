import { v } from "convex/values";
import { httpAction, internalAction, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { reminderMessage, sendEmail } from "./lib/email";
import { requireOwner } from "./lib/ownership";
import { commitmentFor } from "./lib/rhythm";
import { addDays, dayKey, weekKey, weekRange, zonedStartOfDay } from "./lib/time";
import { progressKinds } from "./lib/work";
import { pushKeys, sendPush } from "./lib/webpush";
import { todayFor } from "./tasks";

// The evening reminder (Settings → Evening reminder). Every 15 minutes (convex/crons.ts) it
// finds people whose chosen time has just arrived in their own timezone, on a chosen day,
// who haven't saved a session today and aren't on a planned pause. Each gets one email
// (if on) and one notification on every device that turned them on. Never more than one
// a day, and never about missed days. What it says (Phase 5 of PLAN-one-tap-and-daily-loop)
// is chosen by reminderContent: your own line from last night, else a near finish, else the
// week, else tonight's suggested task.

const window = 15; // minutes; matches the cron interval

/** Local clock minutes (0–1439) and ISO weekday (1 = Monday) at a moment in a timezone. */
export function localClock(time: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(time)).map(part => [part.type, part.value]));
  const day = dayKey(time, timeZone);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1 };
}

/** Whether a reminder at `at` ("20:30") is due at this local moment. */
export function isDue(clock: { minutes: number; weekday: number }, at: string, days: "weekdays" | "everyday") {
  const [hour, minute] = at.split(":").map(Number);
  const start = hour * 60 + minute;
  return clock.minutes >= start && clock.minutes < start + window && (days === "everyday" || clock.weekday <= 5);
}

export type ReminderContent = { kind: "tomorrow" | "nearFinish" | "week" | "task" | "none"; subject: string; heading: string; line: string };
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** What tonight's reminder says, in order of preference. */
export async function reminderContent(ctx: QueryCtx, owner: string, profile: Doc<"profiles"> | null, now: number): Promise<ReminderContent> {
  const zone = profile?.timezone ?? "UTC";
  const today = dayKey(now, zone);
  // 1. The line you left last night (or within the last three days).
  const [close] = await ctx.db.query("dayCloses").withIndex("by_owner_day", q => q.eq("owner", owner).lt("day", today)).order("desc").take(1);
  if (close && close.day >= addDays(today, -3)) {
    const task = close.taskId ? await ctx.db.get(close.taskId) : null;
    const text = close.tomorrow || (task && task.owner === owner ? task.title : "");
    if (text) return { kind: "tomorrow", subject: `Last night you said: ${clip(text, 60)}`, heading: "Last night you said", line: `Last night you said: “${text}”.` };
  }
  // 2. A milestone one task from done.
  const milestones = (await ctx.db.query("milestones").withIndex("by_owner", q => q.eq("owner", owner)).take(200)).filter(m => !m.completedAt).slice(0, 60);
  for (const milestone of milestones) {
    const tasks = (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestone._id)).take(60)).filter(t => t.owner === owner && t.status !== "Archived");
    const left = tasks.filter(t => t.status !== "Done");
    if (tasks.length < 2 || left.length !== 1 || (left[0].status !== "Ready" && left[0].status !== "In progress")) continue;
    const project = await ctx.db.get(milestone.projectId);
    if (project?.status !== "Active") continue;
    return { kind: "nearFinish", subject: `One task finishes ${clip(milestone.title, 50)}`, heading: "Nearly there", line: `One task finishes ${milestone.title}: ${left[0].title}.` };
  }
  // 3. One more day makes the week.
  const week = weekKey(now, zone);
  const commitments = await ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).collect();
  const target = commitmentFor(week, commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })))?.target;
  if (target) {
    const { start, end } = weekRange(week, zone);
    const [sessions, events] = await Promise.all([
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", start).lt("endedAt", end)).take(200),
      ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", owner).gte("at", start).lt("at", end)).take(500),
    ]);
    const days = new Set([...sessions.map(s => dayKey(s.endedAt, zone)), ...events.filter(e => progressKinds.has(e.kind)).map(e => dayKey(e.at, zone))]);
    if (target - days.size === 1) return { kind: "week", subject: "One more day makes your week", heading: "One more day", line: "One more day makes your week." };
  }
  // 4. Tonight's suggestion, for the time and energy you last checked in with.
  const capacity = profile?.capacity ?? { minutes: 45, energy: 2 };
  const overview = await todayFor(ctx, owner, { ...capacity, week });
  const focus = overview.choices[0];
  if (focus) return { kind: "task", subject: `Tonight: ${clip(focus.title, 60)}`, heading: "Tonight's next step", line: `Tonight's next step: ${focus.title} (${focus.minutes} min).` };
  return { kind: "none", subject: "Your evening is ready", heading: "Your evening is ready", line: "Your evening is ready when you are." };
}

/** Settings → Evening reminder: what tonight's reminder would say. */
export const preview = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    return reminderContent(ctx, owner, profile, Date.now());
  },
});

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    // Profiles are one per person; this app is personal-scale, so a scan is fine here.
    const profiles = (await ctx.db.query("profiles").collect()).filter(profile => profile.reminderOn && profile.timezone);
    const out: { owner: string; profileId: Id<"profiles">; day: string; email: string | null; name: string; content: ReminderContent; devices: { _id: Id<"pushSubscriptions">; endpoint: string }[] }[] = [];
    for (const profile of profiles) {
      const zone = profile.timezone!;
      const clock = localClock(now, zone);
      if (profile.lastReminderDay === clock.day || !isDue(clock, profile.reminderTime ?? "20:30", profile.reminderDays ?? "weekdays")) continue;
      // Anything moved forward today means no reminder: a saved session, or a task started, finished or logged.
      const dayStart = zonedStartOfDay(clock.day, zone);
      const worked = await ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", profile.owner).gte("endedAt", dayStart)).first()
        ?? (await ctx.db.query("taskEvents").withIndex("by_owner_at", q => q.eq("owner", profile.owner).gte("at", dayStart)).take(200)).find(event => progressKinds.has(event.kind));
      const week = weekKey(now, zone);
      const commitments = await ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", profile.owner)).collect();
      if (worked || commitmentFor(week, commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })))?.paused) continue;
      const user = await authComponent.getAnyUserById(ctx, profile.owner.split("|").pop() ?? "");
      const content = await reminderContent(ctx, profile.owner, profile, now);
      const devices = (await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", profile.owner)).take(10)).map(device => ({ _id: device._id, endpoint: device.endpoint }));
      const email = (profile.reminderEmail ?? true) && user?.email && user.emailVerified ? user.email : null;
      if (email || devices.length) out.push({ owner: profile.owner, profileId: profile._id, day: clock.day, email, name: user?.name ?? "", content, devices });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { profileId: v.id("profiles"), day: v.string(), text: v.optional(v.string()) },
  handler: async (ctx, args) => { if (await ctx.db.get(args.profileId)) await ctx.db.patch(args.profileId, { lastReminderDay: args.day, ...(args.text ? { lastReminderText: args.text } : {}) }); },
});

/** The push notification's text: pushes carry no payload, so the service worker asks for it by its own endpoint. */
export const lineForEndpoint = internalQuery({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const device = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique();
    if (!device) return null;
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", device.owner)).unique();
    return profile?.lastReminderText ?? null;
  },
});

const pushCors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
/** POST /reminder-line { endpoint } → { body }: the latest reminder's words for that device, or null. */
export const pushLine = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: pushCors });
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" && body.endpoint.startsWith("https://") && body.endpoint.length < 2000 ? body.endpoint : null;
  const text = endpoint ? await ctx.runQuery(internal.reminders.lineForEndpoint, { endpoint }) : null;
  return new Response(JSON.stringify({ body: text }), { status: 200, headers: { ...pushCors, "Content-Type": "application/json" } });
});

export const sendDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const due = await ctx.runQuery(internal.reminders.due, { now: Date.now() });
    const keys = pushKeys();
    const site = process.env.SITE_URL ?? "";
    for (const person of due) {
      // Marked first, so a failure can't turn into a reminder every 15 minutes.
      await ctx.runMutation(internal.reminders.markSent, { profileId: person.profileId, day: person.day, text: `${person.content.line} Even 15 minutes counts.` });
      if (person.email) await sendEmail(person.email, reminderMessage(person.name, person.content, site)).catch(error => console.error("Reminder email failed:", String(error)));
      if (keys && person.devices.length) {
        const results = await Promise.all(person.devices.map(async device => ({ device, status: await sendPush(device.endpoint, keys).catch(() => 0) })));
        const gone = results.filter(result => result.status === 404 || result.status === 410).map(result => result.device._id);
        if (gone.length) await ctx.runMutation(internal.push.forget, { ids: gone });
      }
    }
    return due.length;
  },
});
