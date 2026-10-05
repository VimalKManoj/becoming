import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireOwner } from "./lib/ownership";

// Artifacts are captured by the Today recap; Proof reads their owned source story.
export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db.query("artifacts")
      .withIndex("by_owner", q => q.eq("owner", owner))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async artifact => {
      const session = await ctx.db.get(artifact.sessionId);
      const source = session?.owner === owner ? {
        title: session.title,
        lane: session.lane,
        contribution: session.contribution,
        outcome: session.outcome,
        endedAt: session.endedAt,
      } : null;
      return {
        _id: artifact._id,
        title: artifact.title,
        url: artifact.url,
        status: artifact.status,
        portfolioCandidate: artifact.portfolioCandidate,
        source,
      };
    }));
    return { ...result, page };
  },
});
