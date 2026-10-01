import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireOwner } from "./lib/ownership";

// Journey reads completed recaps, never active or cancelled focus sessions.
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db.query("sessions")
      .withIndex("by_owner_endedAt", q => q.eq("owner", owner))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(session => ({
        _id: session._id,
        taskId: session.taskId,
        title: session.title,
        lane: session.lane,
        outcome: session.outcome,
        contribution: session.contribution,
        nextStep: session.nextStep,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        smaller: session.smaller ?? false,
        evidence: session.evidence,
      })),
    };
  },
});
