import { ConvexError, v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { hashToken, newToken } from "./lib/tokens";

// Settings → Assistants: access tokens that let Claude Code (and other MCP clients) read
// your work and change it through convex/mcp.ts. A token is shown once. Its trust says what
// its changes do: "work" (the default) applies everyday work at once and sends plan changes
// to the Inbox; "ask" sends everything to the Inbox; "all" applies everything.

const trust = v.union(v.literal("ask"), v.literal("work"), v.literal("all"));

const tokenLimit = 10;

export const tokens = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const rows = await ctx.db.query("apiTokens").withIndex("by_owner", q => q.eq("owner", owner)).take(tokenLimit);
    return rows.map(row => ({ _id: row._id, name: row.name, prefix: row.prefix, createdAt: row._creationTime, lastUsedAt: row.lastUsedAt ?? null, trust: row.trust ?? "work" }));
  },
});

// An action, so the token comes from real randomness (queries and mutations use a seeded generator).
export const createToken = action({
  args: { name: v.string(), trust: v.optional(trust) },
  handler: async (ctx, args): Promise<string> => {
    const owner = await requireOwner(ctx);
    const name = nonempty(args.name, 60);
    const token = newToken();
    await ctx.runMutation(internal.assistants.storeToken, { owner, name, hash: await hashToken(token), prefix: token.slice(0, 12), ...(args.trust ? { trust: args.trust } : {}) });
    return token;
  },
});

export const storeToken = internalMutation({
  args: { owner: v.string(), name: v.string(), hash: v.string(), prefix: v.string(), trust: v.optional(trust) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("apiTokens").withIndex("by_owner", q => q.eq("owner", args.owner)).take(tokenLimit);
    if (existing.length >= tokenLimit) throw new ConvexError(`You can have up to ${tokenLimit} assistant tokens. Revoke one first.`);
    await ctx.db.insert("apiTokens", args);
  },
});

export const revokeToken = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const row = await ctx.db.get(args.tokenId);
    assertOwner(row, owner);
    await ctx.db.delete(row._id);
  },
});

/** How much a token's assistant may change without asking (Settings → Assistants). */
export const setTrust = mutation({
  args: { tokenId: v.id("apiTokens"), trust },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const row = await ctx.db.get(args.tokenId);
    assertOwner(row, owner);
    await ctx.db.patch(row._id, { trust: args.trust });
  },
});
