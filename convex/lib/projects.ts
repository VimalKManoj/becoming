import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner } from "./ownership";

type Links = { projectId?: Id<"projects">; milestoneId?: Id<"milestones"> };

/**
 * Checks a task's project and milestone links. A milestone implies its project. New links
 * must point at an Active project; a task that already belongs to a Done or Archived
 * project may keep that link while being edited.
 */
export async function taskLinks(ctx: Pick<QueryCtx, "db">, owner: string, links: Links, existing?: Pick<Doc<"tasks">, "projectId">): Promise<Links> {
  let projectId = links.projectId;
  if (links.milestoneId) {
    const milestone = await ctx.db.get(links.milestoneId);
    assertOwner(milestone, owner);
    if (projectId && projectId !== milestone.projectId) throw new ConvexError("That milestone belongs to a different project.");
    projectId = milestone.projectId;
  }
  if (projectId) {
    const project = await ctx.db.get(projectId);
    assertOwner(project, owner);
    if (project.status !== "Active" && projectId !== existing?.projectId) throw new ConvexError("Choose an active project.");
  }
  return { projectId, milestoneId: links.milestoneId };
}

/** True when a task may be recommended or started: no project, or an Active one. */
export async function projectIsOpen(ctx: Pick<QueryCtx, "db">, owner: string, projectId: Id<"projects"> | undefined) {
  if (!projectId) return true;
  const project = await ctx.db.get(projectId);
  return project?.owner === owner && project.status === "Active";
}

/**
 * Recomputes whether a milestone is complete: it has at least one linked task that isn't
 * archived, and every such task is Done. completedAt records when that first became true,
 * so a "first milestone" is derived from a real moment, and reopening a task clears it.
 */
export async function refreshMilestone(ctx: MutationCtx, milestoneId: Id<"milestones"> | undefined) {
  if (!milestoneId) return;
  const milestone = await ctx.db.get(milestoneId);
  if (!milestone) return;
  const tasks = (await ctx.db.query("tasks").withIndex("by_milestone", q => q.eq("milestoneId", milestoneId)).collect())
    .filter(task => task.owner === milestone.owner && task.status !== "Archived");
  const complete = tasks.length > 0 && tasks.every(task => task.status === "Done");
  if (complete && milestone.completedAt === undefined) await ctx.db.patch(milestone._id, { completedAt: Date.now() });
  if (!complete && milestone.completedAt !== undefined) await ctx.db.patch(milestone._id, { completedAt: undefined });
}
