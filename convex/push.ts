import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwner } from "./lib/ownership";
import { httpUrl } from "./lib/validate";
import { pushKeys, sendPush } from "./lib/webpush";

// Devices that turned on notifications (Settings → Evening reminder → This device).

const deviceLimit = 10;

/** The public key a browser needs to subscribe (null until VAPID keys are set), whether email can be sent, and this account's devices. */
export const config = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const devices = await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", owner)).take(deviceLimit);
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null, emailReady: Boolean(process.env.RESEND_API_KEY), devices: devices.map(device => device.endpoint) };
  },
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const endpoint = httpUrl(args.endpoint, "That isn't a push address.");
    if (!endpoint.startsWith("https://") || args.p256dh.length > 200 || args.auth.length > 100) throw new ConvexError("That isn't a push subscription.");
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).unique();
    if (existing) { await ctx.db.patch(existing._id, { owner, p256dh: args.p256dh, auth: args.auth }); return; }
    const mine = await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", owner)).take(deviceLimit);
    if (mine.length >= deviceLimit) throw new ConvexError(`Notifications are on for ${deviceLimit} devices already. Turn one off first.`);
    await ctx.db.insert("pushSubscriptions", { owner, endpoint, p256dh: args.p256dh, auth: args.auth });
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const existing = await ctx.db.query("pushSubscriptions").withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique();
    if (existing && existing.owner === owner) await ctx.db.delete(existing._id);
  },
});

export const forOwner = internalQuery({
  args: { owner: v.string() },
  handler: async (ctx, args) => (await ctx.db.query("pushSubscriptions").withIndex("by_owner", q => q.eq("owner", args.owner)).take(deviceLimit)).map(device => ({ _id: device._id, endpoint: device.endpoint })),
});

/** Forgets devices the push service says are gone (uninstalled, permission revoked). */
export const forget = internalMutation({
  args: { ids: v.array(v.id("pushSubscriptions")) },
  handler: async (ctx, args) => { for (const id of args.ids) if (await ctx.db.get(id)) await ctx.db.delete(id); },
});

/** "Send a test" in Settings. */
export const test = action({
  args: {},
  handler: async (ctx): Promise<{ sent: number; gone: number }> => {
    const owner = await requireOwner(ctx);
    const keys = pushKeys();
    if (!keys) throw new ConvexError("Notifications aren't set up on this deployment yet (VAPID keys are missing).");
    const devices = await ctx.runQuery(internal.push.forOwner, { owner });
    const results = await Promise.all(devices.map(async device => ({ device, status: await sendPush(device.endpoint, keys).catch(() => 0) })));
    const gone = results.filter(result => result.status === 404 || result.status === 410).map(result => result.device._id);
    if (gone.length) await ctx.runMutation(internal.push.forget, { ids: gone });
    return { sent: results.filter(result => result.status >= 200 && result.status < 300).length, gone: gone.length };
  },
});
