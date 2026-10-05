import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const lane = v.union(v.literal("Projects"), v.literal("Showcases"), v.literal("Writing"));
// Archived is a reversible hide: the task leaves Work's active views and Today, and keeps its history.
export const workingStatus = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"));
export const taskStatus = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"), v.literal("Archived"));
export const outcome = v.union(v.literal("Finished"), v.literal("Made progress"), v.literal("Blocked"));

export default defineSchema({
  profiles: defineTable({ owner: v.string(), motive: v.string(), timezone: v.optional(v.string()), weeklyTarget: v.optional(v.number()) }).index("by_owner", ["owner"]),
  projects: defineTable({ owner: v.string(), title: v.string(), purpose: v.string(), status: v.union(v.literal("Active"), v.literal("Archived"), v.literal("Done")) }).index("by_owner", ["owner"]),
  ideas: defineTable({ owner: v.string(), title: v.string(), notes: v.string(), lane, taskId: v.optional(v.id("tasks")), archivedAt: v.optional(v.number()) }).index("by_owner", ["owner"]),
  tasks: defineTable({
    owner: v.string(), title: v.string(), lane, status: taskStatus,
    // The status to return to when an archived task is restored.
    archivedFrom: v.optional(workingStatus),
    projectId: v.optional(v.id("projects")), ideaId: v.optional(v.id("ideas")),
    minutes: v.number(), energy: v.number(), doneWhen: v.string(), nextStep: v.string(),
    smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()),
    dependencies: v.array(v.id("tasks")),
  }).index("by_owner", ["owner"]).index("by_owner_status", ["owner", "status"]),
  activeSessions: defineTable({
    owner: v.string(), taskId: v.id("tasks"), startedAt: v.number(),
    smaller: v.optional(v.boolean()), taskTitle: v.optional(v.string()), lane: v.optional(lane),
    focusTitle: v.optional(v.string()), focusDoneWhen: v.optional(v.string()), focusMinutes: v.optional(v.number()),
  }).index("by_owner", ["owner"]),
  sessions: defineTable({
    owner: v.string(), taskId: v.id("tasks"), key: v.string(), lane, title: v.string(),
    outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string(),
    startedAt: v.optional(v.number()), endedAt: v.number(),
    smaller: v.optional(v.boolean()), doneWhen: v.optional(v.string()),
  }).index("by_owner_endedAt", ["owner", "endedAt"]).index("by_owner_key", ["owner", "key"]),
  artifacts: defineTable({
    owner: v.string(), sessionId: v.id("sessions"), title: v.string(), url: v.string(),
    status: v.union(v.literal("Draft"), v.literal("Ready to share"), v.literal("Published")), portfolioCandidate: v.boolean(),
  }).index("by_owner", ["owner"]),
  weeklyCommitments: defineTable({ owner: v.string(), week: v.string(), target: v.number(), paused: v.boolean() }).index("by_owner_week", ["owner", "week"]),
});
