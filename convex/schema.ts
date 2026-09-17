import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const lane = v.union(v.literal("Projects"), v.literal("Showcases"), v.literal("Writing"));
export const taskStatus = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"));
export const outcome = v.union(v.literal("Finished"), v.literal("Made progress"), v.literal("Blocked"));

export default defineSchema({
  profiles: defineTable({ owner: v.string(), motive: v.string(), timezone: v.string(), weeklyTarget: v.number() }).index("by_owner", ["owner"]),
  projects: defineTable({ owner: v.string(), title: v.string(), purpose: v.string(), status: v.union(v.literal("Active"), v.literal("Archived"), v.literal("Done")) }).index("by_owner", ["owner"]),
  ideas: defineTable({ owner: v.string(), title: v.string(), notes: v.string(), lane, taskId: v.optional(v.id("tasks")) }).index("by_owner", ["owner"]),
  tasks: defineTable({
    owner: v.string(), title: v.string(), lane, status: taskStatus,
    projectId: v.optional(v.id("projects")), ideaId: v.optional(v.id("ideas")),
    minutes: v.number(), energy: v.number(), doneWhen: v.string(), nextStep: v.string(),
    dependencies: v.array(v.id("tasks")),
  }).index("by_owner", ["owner"]).index("by_owner_status", ["owner", "status"]),
  sessions: defineTable({
    owner: v.string(), taskId: v.id("tasks"), key: v.string(), lane, title: v.string(),
    outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string(),
    endedAt: v.number(),
  }).index("by_owner_endedAt", ["owner", "endedAt"]).index("by_owner_key", ["owner", "key"]),
  artifacts: defineTable({
    owner: v.string(), sessionId: v.id("sessions"), title: v.string(), url: v.string(),
    status: v.union(v.literal("Draft"), v.literal("Ready to share"), v.literal("Published")), portfolioCandidate: v.boolean(),
  }).index("by_owner", ["owner"]),
  weeklyCommitments: defineTable({ owner: v.string(), week: v.string(), target: v.number(), paused: v.boolean() }).index("by_owner_week", ["owner", "week"]),
});
