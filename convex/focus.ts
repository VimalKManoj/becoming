import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireOwner } from "./lib/ownership";

// Focus as a tool (PLAN-one-tap-and-daily-loop, Phase 4): the running session, for the chip
// that follows you around the app, and pausing it. Starting, switching, cancelling and saving
// stay in tasks.ts (startSession, cancelSession, recordSession).

/** The running session, or null: what the chip, the expanded view and the recap show. */
export const active = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const session = await ctx.db.query("activeSessions").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    if (!session) return null;
    const task = await ctx.db.get(session.taskId);
    const own = task && task.owner === owner ? task : null;
    return {
      _id: session._id, taskId: session.taskId, startedAt: session.startedAt,
      pausedAt: session.pausedAt ?? null, pausedMs: session.pausedMs ?? 0,
      title: session.focusTitle ?? own?.title ?? "Focused work",
      taskTitle: session.taskTitle ?? own?.title ?? "Focused work",
      lane: session.lane ?? own?.lane ?? "Projects",
      doneWhen: session.focusDoneWhen ?? own?.doneWhen ?? "",
      minutes: session.focusMinutes ?? own?.minutes ?? 30,
      nextStep: own?.nextStep ?? "",
      smaller: session.smaller ?? false,
    };
  },
});

export const pause = mutation({
  args: { activeSessionId: v.id("activeSessions") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const session = await ctx.db.get(args.activeSessionId);
    assertOwner(session, owner);
    if (session.pausedAt) return;
    await ctx.db.patch(session._id, { pausedAt: Date.now() });
  },
});

export const resume = mutation({
  args: { activeSessionId: v.id("activeSessions") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const session = await ctx.db.get(args.activeSessionId);
    assertOwner(session, owner);
    if (!session.pausedAt) return;
    const paused = Date.now() - session.pausedAt;
    if (paused < 0) throw new ConvexError("The pause can't end before it began.");
    await ctx.db.patch(session._id, { pausedAt: undefined, pausedMs: (session.pausedMs ?? 0) + paused });
  },
});
