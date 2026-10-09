import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, nonempty, requireOwner } from "./lib/ownership";
import { dateKeyValue, httpUrl, optionalText, tagList } from "./lib/validate";
import { artifactStatus } from "./schema";

// Proof turns session evidence into a portfolio: Draft → Ready to share → Published.
// Status is tracking only. Nothing here posts anywhere.

const proofView = v.union(v.literal("all"), v.literal("Draft"), v.literal("Ready to share"), v.literal("Published"), v.literal("candidates"));
const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const maxImageBytes = 5 * 1024 * 1024;

// What the client sees of one piece of evidence, with its owned session story.
async function present(ctx: QueryCtx, owner: string, artifact: Doc<"artifacts">) {
  const session = await ctx.db.get(artifact.sessionId);
  // A malformed cross-owner link reveals nothing about the other account.
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
    notes: artifact.notes ?? "",
    skills: artifact.skills ?? [],
    publishedUrl: artifact.publishedUrl,
    publishedOn: artifact.publishedOn,
    imageUrl: artifact.imageId ? await ctx.storage.getUrl(artifact.imageId) : null,
    source,
  };
}

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator, view: v.optional(proofView) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const view = args.view ?? "all";
    const artifacts = view === "all" ? ctx.db.query("artifacts").withIndex("by_owner", q => q.eq("owner", owner))
      : view === "candidates" ? ctx.db.query("artifacts").withIndex("by_owner_candidate", q => q.eq("owner", owner).eq("portfolioCandidate", true))
        : ctx.db.query("artifacts").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", view));
    const result = await artifacts.order("desc").paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(artifact => present(ctx, owner, artifact)));
    return { ...result, page };
  },
});

// One piece of evidence, for the publish flow opened from a link (?publish=<id>). The id
// comes from the address bar, so anything malformed, missing or not yours is just null.
export const get = query({
  args: { artifactId: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const id = ctx.db.normalizeId("artifacts", args.artifactId);
    const artifact = id ? await ctx.db.get(id) : null;
    return artifact && artifact.owner === owner ? present(ctx, owner, artifact) : null;
  },
});

async function ownedArtifact(ctx: MutationCtx, artifactId: Id<"artifacts">) {
  const owner = await requireOwner(ctx);
  const artifact = await ctx.db.get(artifactId);
  assertOwner(artifact, owner);
  return { owner, artifact: artifact as Doc<"artifacts"> };
}

export const update = mutation({
  args: { artifactId: v.id("artifacts"), title: v.string(), url: v.string(), notes: v.string(), skills: v.array(v.string()) },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    await ctx.db.patch(artifact._id, {
      title: nonempty(args.title, 1000),
      url: httpUrl(args.url, "Add a valid HTTP or HTTPS evidence link."),
      notes: optionalText(args.notes, 4000, "notes"),
      skills: tagList(args.skills),
    });
    return artifact._id;
  },
});

// Published needs the real public link and the day it went out. Moving back clears
// both, so the record never claims a publication that is no longer true.
export const setStatus = mutation({
  args: { artifactId: v.id("artifacts"), status: artifactStatus, publishedUrl: v.optional(v.string()), publishedOn: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    if (args.status !== "Published") {
      await ctx.db.patch(artifact._id, { status: args.status, publishedUrl: undefined, publishedOn: undefined });
      return artifact._id;
    }
    const publishedUrl = httpUrl(args.publishedUrl ?? "", "Add the HTTP or HTTPS link where this was published.");
    const publishedOn = dateKeyValue(args.publishedOn ?? "", "Choose the date it was published.");
    // Allow for timezones ahead of UTC, but not dates in the future.
    if (Date.parse(`${publishedOn}T00:00:00Z`) > Date.now() + 86_400_000) throw new ConvexError("The publication date can't be in the future.");
    await ctx.db.patch(artifact._id, { status: "Published", publishedUrl, publishedOn });
    return artifact._id;
  },
});

export const setCandidate = mutation({
  args: { artifactId: v.id("artifacts"), portfolioCandidate: v.boolean() },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    if (args.portfolioCandidate === artifact.portfolioCandidate) return artifact._id;
    await ctx.db.patch(artifact._id, { portfolioCandidate: args.portfolioCandidate, candidateSince: args.portfolioCandidate ? Date.now() : undefined });
    return artifact._id;
  },
});

// Evidence often appears after the session (a clip exported later, a post drafted the
// next day). This attaches it to the session it came from, as a new Draft.
export const addToSession = mutation({
  args: { sessionId: v.id("sessions"), url: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const session = await ctx.db.get(args.sessionId);
    assertOwner(session, owner);
    const title = args.title?.trim() ? nonempty(args.title, 1000) : session.title;
    return ctx.db.insert("artifacts", { owner, sessionId: session._id, title, url: httpUrl(args.url, "Add a valid HTTP or HTTPS evidence link."), status: "Draft", portfolioCandidate: false });
  },
});

export const remove = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    if (artifact.imageId) await ctx.storage.delete(artifact.imageId);
    await ctx.db.delete(artifact._id);
    return null;
  },
});

// Screenshots: the browser asks for a one-time upload URL, posts the file to it, then
// attaches the returned storage ID. The server reads the stored file's metadata: Convex
// measures the size itself, while the content type is the one the browser declared on
// upload. So this refuses ordinary mistakes (a PDF, a huge file) but doesn't prove a
// file's bytes are an image; the browser only ever displays it through an <img> tag.
export const generateUploadUrl = mutation({
  args: {},
  handler: async ctx => {
    await requireOwner(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const attachImage = mutation({
  args: { artifactId: v.id("artifacts"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    const file = await ctx.db.system.get(args.storageId);
    if (!file) throw new ConvexError("The upload didn't arrive. Please try again.");
    // A storage ID already attached anywhere can't be claimed again.
    const claimed = await ctx.db.query("artifacts").withIndex("by_image", q => q.eq("imageId", args.storageId)).first();
    if (claimed && claimed._id !== artifact._id) throw new ConvexError("That upload is already in use.");
    if (!file.contentType || !imageTypes.includes(file.contentType) || file.size > maxImageBytes) {
      // Throwing would roll back this delete along with the rest of the mutation, so the
      // rejected file is removed and the problem is returned instead of thrown.
      await ctx.storage.delete(args.storageId);
      return { attached: false as const, message: "Choose a PNG, JPEG, WebP or GIF image of up to 5 MB." };
    }
    if (artifact.imageId && artifact.imageId !== args.storageId) await ctx.storage.delete(artifact.imageId);
    await ctx.db.patch(artifact._id, { imageId: args.storageId });
    return { attached: true as const, message: "" };
  },
});

export const removeImage = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const { artifact } = await ownedArtifact(ctx, args.artifactId);
    if (artifact.imageId) await ctx.storage.delete(artifact.imageId);
    await ctx.db.patch(artifact._id, { imageId: undefined });
    return artifact._id;
  },
});

// Draft → Ready to share → Published counts, and the newest piece that isn't published yet.
export const pipeline = query({
  args: {},
  handler: async ctx => {
    const owner = await requireOwner(ctx);
    const count = (status: Doc<"artifacts">["status"]) => ctx.db.query("artifacts").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", status)).take(1000).then(items => items.length);
    const [draft, ready, published, nextReady, nextDraft] = await Promise.all([
      count("Draft"), count("Ready to share"), count("Published"),
      ctx.db.query("artifacts").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Ready to share")).order("desc").first(),
      ctx.db.query("artifacts").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Draft")).order("desc").first(),
    ]);
    const next = nextReady ?? nextDraft;
    return {
      draft, ready, published,
      next: next ? { _id: next._id, title: next.title, status: next.status, imageUrl: next.imageId ? await ctx.storage.getUrl(next.imageId) : null } : null,
    };
  },
});
