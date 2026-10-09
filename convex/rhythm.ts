import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireOwner } from "./lib/ownership";
import { commitmentFor } from "./lib/rhythm";
import { DAY, addDays, isSupportedTimeZone, isWeekKey, weekKey } from "./lib/time";
import { timezoneValue } from "./lib/validate";

const HOUR = 3_600_000;
// Allows for a browser clock a few minutes off the server's around midnight on Sunday.
const clockSkew = 5 * 60_000;

// The browser works out the person's current week in their timezone and sends its key, so
// a finished week can never be edited through these functions. When the server's runtime
// knows the person's timezone, the key must be exactly their current week. Otherwise it
// must at least be a week that is current somewhere on Earth right now.
export function assertCurrentWeek(week: string, timezone: string | undefined, now = Date.now()) {
  if (!isWeekKey(week)) throw new ConvexError("Choose a valid week.");
  const wrongWeek = () => new ConvexError("That isn't the current week. Reload and try again.");
  if (timezone && isSupportedTimeZone(timezone)) {
    if (week !== weekKey(now - clockSkew, timezone) && week !== weekKey(now + clockSkew, timezone)) throw wrongWeek();
    return;
  }
  // Timezones run from UTC-12 to UTC+14. A week starts at UTC+14 when its Monday key is
  // 14 hours ahead of now, and ends at UTC-12 7 days 12 hours after that key.
  const start = Date.parse(`${week}T00:00:00Z`);
  if (start > now + 14 * HOUR || start < now - 7 * DAY - 12 * HOUR) throw wrongWeek();
}

async function commitments(ctx: Pick<MutationCtx, "db">, owner: string) {
  return ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).collect();
}

async function commitmentAt(ctx: Pick<MutationCtx, "db">, owner: string, week: string) {
  return ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner).eq("week", week)).unique();
}

// Everything the week strip, Journey and Settings need, in one subscription. The client
// passes `now` rounded to the hour so this cached query refreshes as time moves on.
// Sessions cover roughly the last 27 weeks; streaks longer than that are reported as at least that long.
export const overview = query({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const since = args.now - 27 * 7 * DAY;
    const [profile, stored, reflections, sessions, plans] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique(),
      ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).collect(),
      ctx.db.query("reflections").withIndex("by_owner_week", q => q.eq("owner", owner)).order("desc").take(30),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", since)).take(2000),
      ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner)).order("desc").take(4),
    ]);
    return {
      timezone: profile?.timezone ?? null,
      commitments: stored.map(item => ({ week: item.week, target: item.target, paused: item.paused })),
      reflections: reflections.map(item => ({ week: item.week, learning: item.learning, intention: item.intention })),
      sessions: sessions.map(item => ({ endedAt: item.endedAt, lane: item.lane, startedAt: item.startedAt ?? null, skills: item.skills ?? [] })),
      plans: plans.map(item => ({ week: item.week, intention: item.intention, taskIds: item.taskIds })),
      windowStart: since,
    };
  },
});

// Saves the timezone and weekly target. The very first target applies to the current
// week; after that, a new target starts next Monday so past weeks keep theirs.
export const setRhythm = mutation({
  args: { timezone: v.string(), weeklyTarget: v.number(), currentWeek: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const timezone = timezoneValue(args.timezone);
    assertCurrentWeek(args.currentWeek, timezone);
    if (!Number.isInteger(args.weeklyTarget) || args.weeklyTarget < 1 || args.weeklyTarget > 6) throw new ConvexError("Choose 1–6 sessions a week.");
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) await ctx.db.patch(profile._id, { timezone });
    else await ctx.db.insert("profiles", { owner, motive: "", timezone });

    const existing = await commitments(ctx, owner);
    const current = commitmentFor(args.currentWeek, existing);
    if (!current) {
      const atCurrent = await commitmentAt(ctx, owner, args.currentWeek);
      if (atCurrent) await ctx.db.patch(atCurrent._id, { target: args.weeklyTarget });
      else await ctx.db.insert("weeklyCommitments", { owner, week: args.currentWeek, target: args.weeklyTarget, paused: false });
      return { appliesFrom: args.currentWeek };
    }
    const nextWeek = addDays(args.currentWeek, 7);
    const atNext = await commitmentAt(ctx, owner, nextWeek);
    if (args.weeklyTarget === current.target && !atNext?.paused) {
      // Back to this week's target: the pending change for next week is no longer needed.
      if (atNext) await ctx.db.delete(atNext._id);
      return { appliesFrom: args.currentWeek };
    }
    if (atNext) await ctx.db.patch(atNext._id, { target: args.weeklyTarget });
    else await ctx.db.insert("weeklyCommitments", { owner, week: nextWeek, target: args.weeklyTarget, paused: false });
    return { appliesFrom: nextWeek };
  },
});

// Plans (or cancels) a pause for the current or the next week. A paused week neither
// counts towards nor breaks a streak.
export const setPause = mutation({
  args: { currentWeek: v.string(), week: v.string(), paused: v.boolean() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    assertCurrentWeek(args.currentWeek, profile?.timezone);
    if (args.week !== args.currentWeek && args.week !== addDays(args.currentWeek, 7)) throw new ConvexError("You can pause this week or next week.");
    const existing = await commitments(ctx, owner);
    const inForce = commitmentFor(args.week, existing);
    if (!inForce) throw new ConvexError("Set a weekly target first.");
    const atWeek = await commitmentAt(ctx, owner, args.week);
    if (atWeek) {
      // A document that only marked the pause can go when the pause is cancelled.
      const before = commitmentFor(addDays(args.week, -7), existing);
      if (!args.paused && before && before.target === atWeek.target) await ctx.db.delete(atWeek._id);
      else await ctx.db.patch(atWeek._id, { paused: args.paused });
    } else if (args.paused) {
      await ctx.db.insert("weeklyCommitments", { owner, week: args.week, target: inForce.target, paused: true });
    }
    return null;
  },
});

// One reflection per week. Any week up to the current one can be written or revised;
// reflections are notes and never change a week's result.
export const saveReflection = mutation({
  args: { week: v.string(), learning: v.string(), intention: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (!isWeekKey(args.week) || Date.parse(`${args.week}T00:00:00Z`) > Date.now() + 2 * DAY) throw new ConvexError("Choose this week or an earlier one.");
    const learning = args.learning.trim();
    const intention = args.intention.trim();
    if (learning.length > 2000 || intention.length > 2000) throw new ConvexError("Keep each reflection under 2000 characters.");
    const existing = await ctx.db.query("reflections").withIndex("by_owner_week", q => q.eq("owner", owner).eq("week", args.week)).unique();
    if (!learning && !intention) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) await ctx.db.patch(existing._id, { learning, intention });
    else await ctx.db.insert("reflections", { owner, week: args.week, learning, intention });
    return null;
  },
});

// The weekly review's plan for this week or next: one intention and up to 12 lined-up
// steps. Saving again replaces it. Lined-up steps must be yours and still open.
export const saveWeekPlan = mutation({
  args: { currentWeek: v.string(), week: v.string(), intention: v.string(), taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    assertCurrentWeek(args.currentWeek, profile?.timezone);
    if (args.week !== args.currentWeek && args.week !== addDays(args.currentWeek, 7)) throw new ConvexError("You can plan this week or next week.");
    const intention = args.intention.trim();
    if (intention.length > 120) throw new ConvexError("Keep your intention to 120 characters or fewer.");
    const taskIds = [...new Set(args.taskIds)];
    if (taskIds.length > 12) throw new ConvexError("Line up 12 steps or fewer.");
    for (const id of taskIds) {
      const task = await ctx.db.get(id);
      if (!task || task.owner !== owner) throw new ConvexError("Record not found");
      if (task.status !== "Ready" && task.status !== "In progress") throw new ConvexError("Line up steps that are ready or in progress.");
    }
    const existing = await ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner).eq("week", args.week)).unique();
    if (existing) await ctx.db.patch(existing._id, { intention, taskIds });
    else await ctx.db.insert("weekPlans", { owner, week: args.week, intention, taskIds });
    return null;
  },
});
