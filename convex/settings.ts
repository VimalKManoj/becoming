import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireOwner } from "./lib/ownership";

export const getProfile = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
    return profile ? { motive: profile.motive } : null;
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
