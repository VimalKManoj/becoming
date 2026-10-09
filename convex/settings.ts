import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireOwner } from "./lib/ownership";
import { lane } from "./schema";

export const getProfile = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    // A brand-new account (nothing saved yet) is offered onboarding; an existing one never is.
    const [anyTask, anySession] = profile?.onboardedAt ? [null, null] : await Promise.all([
      ctx.db.query("tasks").withIndex("by_owner", q => q.eq("owner", owner)).first(),
      ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).first(),
    ]);
    const needsOnboarding = !profile?.onboardedAt && !anyTask && !anySession;
    const preferences = {
      focusQuotes: profile?.focusQuotes ?? true, focusMusic: profile?.focusMusic ?? true,
      reminderOn: profile?.reminderOn ?? false, reminderTime: profile?.reminderTime ?? "20:30", reminderDays: profile?.reminderDays ?? "weekdays",
      reminderEmail: profile?.reminderEmail ?? true,
    };
    return profile
      ? { motive: profile.motive, laneFocus: profile.laneFocus ?? null, pinnedTaskId: profile.pinnedTaskId ?? null, needsOnboarding, ...preferences }
      : needsOnboarding ? { motive: "", laneFocus: null, pinnedTaskId: null, needsOnboarding, ...preferences } : null;
  },
});

// An empty motive clears it. A new account saving nothing gets no empty profile.
export const saveMotive = mutation({
  args: { motive: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const motive = args.motive.trim();
    if (motive.length > 1000) throw new ConvexError("Keep your motive to 1000 characters or fewer.");
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) {
      await ctx.db.patch(profile._id, { motive });
      return profile._id;
    }
    if (!motive) return null;
    return ctx.db.insert("profiles", { owner, motive });
  },
});

// Favour one lane slightly in Today's ranking (it counts one session fewer), or none.
export const saveLaneFocus = mutation({
  args: { laneFocus: v.optional(lane) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) await ctx.db.patch(profile._id, { laneFocus: args.laneFocus });
    else if (args.laneFocus) await ctx.db.insert("profiles", { owner, motive: "", laneFocus: args.laneFocus });
    return null;
  },
});

// The task pinned for Today, named for Settings. Null when nothing open is pinned.
export const pinnedTask = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    const task = profile?.pinnedTaskId ? await ctx.db.get(profile.pinnedTaskId) : null;
    if (!task || task.owner !== owner || task.status === "Done" || task.status === "Archived") return null;
    return { taskId: task._id, title: task.title, status: task.status };
  },
});

// Focus-screen and reminder preferences. Reminders go out by email and to devices with
// notifications on (convex/reminders.ts).
export const savePreferences = mutation({
  args: {
    focusQuotes: v.optional(v.boolean()), focusMusic: v.optional(v.boolean()), reminderOn: v.optional(v.boolean()),
    reminderTime: v.optional(v.union(v.literal("19:30"), v.literal("20:30"), v.literal("21:30"))),
    reminderDays: v.optional(v.union(v.literal("weekdays"), v.literal("everyday"))),
    reminderEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const changes = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) await ctx.db.patch(profile._id, changes);
    else await ctx.db.insert("profiles", { owner, motive: "", ...changes });
    return null;
  },
});

// Onboarding is finished (or skipped); it won't be offered again.
export const completeOnboarding = mutation({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (profile) { if (!profile.onboardedAt) await ctx.db.patch(profile._id, { onboardedAt: Date.now() }); }
    else await ctx.db.insert("profiles", { owner, motive: "", onboardedAt: Date.now() });
    return null;
  },
});
