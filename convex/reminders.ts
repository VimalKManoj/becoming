import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent } from "./auth";
import { reminderMessage, sendEmail } from "./lib/email";
import { commitmentFor } from "./lib/rhythm";
import { dayKey, weekKey, zonedStartOfDay } from "./lib/time";
import { pushKeys, sendPush } from "./lib/webpush";
import { todayFor } from "./tasks";

// The evening reminder (Settings → Evening reminder). Every 15 minutes (convex/crons.ts) it
// finds people whose chosen time has just arrived in their own timezone, on a chosen day,
// who haven't saved a session today and aren't on a planned pause. Each gets one email
// (if on) and one notification on every device that turned them on. Never more than one
// a day, and never about missed days.

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

export const due = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    // Profiles are one per person; this app is personal-scale, so a scan is fine here.
    const profiles = (await ctx.db.query("profiles").collect()).filter(profile => profile.reminderOn && profile.timezone);
    const out: { owner: string; profileId: Id<"profiles">; day: string; email: string | null; name: string; focus: { title: string; minutes: number } | null; devices: { _id: Id<"pushSubscriptions">; endpoint: string }[] }[] = [];
    for (const profile of profiles) {
      const zone = profile.timezone!;
      const clock = localClock(now, zone);
      if (profile.lastReminderDay === clock.day || !isDue(clock, profile.reminderTime ?? "20:30", profile.reminderDays ?? "weekdays")) continue;
      const worked = await ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", profile.owner).gte("endedAt", zonedStartOfDay(clock.day, zone))).first();
      const week = weekKey(now, zone);
      const commitments = await ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", profile.owner)).collect();
      if (worked || commitmentFor(week, commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })))?.paused) continue;
      const user = await authComponent.getAnyUserById(ctx, profile.owner.split("|").pop() ?? "");
      const overview = await todayFor(ctx, profile.owner, { minutes: 45, energy: 2, week });
      const focus = overview.choices[0] ? { title: overview.choices[0].title, minutes: overview.choices[0].minutes } : null;
      const devices = (await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", profile.owner)).take(10)).map(device => ({ _id: device._id, endpoint: device.endpoint }));
      const email = (profile.reminderEmail ?? true) && user?.email && user.emailVerified ? user.email : null;
      if (email || devices.length) out.push({ owner: profile.owner, profileId: profile._id, day: clock.day, email, name: user?.name ?? "", focus, devices });
    }
    return out;
  },
});

export const markSent = internalMutation({
  args: { profileId: v.id("profiles"), day: v.string() },
  handler: async (ctx, args) => { if (await ctx.db.get(args.profileId)) await ctx.db.patch(args.profileId, { lastReminderDay: args.day }); },
});

export const sendDue = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const due = await ctx.runQuery(internal.reminders.due, { now: Date.now() });
    const keys = pushKeys();
    const site = process.env.SITE_URL ?? "";
    for (const person of due) {
      // Marked first, so a failure can't turn into a reminder every 15 minutes.
      await ctx.runMutation(internal.reminders.markSent, { profileId: person.profileId, day: person.day });
      if (person.email) await sendEmail(person.email, reminderMessage(person.name, person.focus, site)).catch(error => console.error("Reminder email failed:", String(error)));
      if (keys && person.devices.length) {
        const results = await Promise.all(person.devices.map(async device => ({ device, status: await sendPush(device.endpoint, keys).catch(() => 0) })));
        const gone = results.filter(result => result.status === 404 || result.status === 410).map(result => result.device._id);
        if (gone.length) await ctx.runMutation(internal.push.forget, { ids: gone });
      }
    }
    return due.length;
  },
});
