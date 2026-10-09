import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const lane = v.union(v.literal("Projects"), v.literal("Showcases"), v.literal("Writing"));
// Archived is a reversible hide: the task leaves Work's active views and Today, and keeps its history.
export const workingStatus = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"));
export const taskStatus = v.union(v.literal("Ready"), v.literal("In progress"), v.literal("Blocked"), v.literal("Done"), v.literal("Archived"));
export const outcome = v.union(v.literal("Finished"), v.literal("Made progress"), v.literal("Blocked"));
export const artifactStatus = v.union(v.literal("Draft"), v.literal("Ready to share"), v.literal("Published"));
// Why someone chose a different focus than the recommendation. Optional, one tap.
export const swapReason = v.union(v.literal("Too big tonight"), v.literal("Not in the mood"), v.literal("Waiting on something"), v.literal("Better momentum elsewhere"), v.literal("Other"));
// Genesis: what an idea's research drew on. "brief" is a summary an assistant wrote.
export const researchSource = v.object({
  title: v.string(), url: v.optional(v.string()),
  kind: v.union(v.literal("read"), v.literal("interview"), v.literal("tried"), v.literal("brief")),
  // "app", or the assistant that added it (a token's name).
  by: v.string(), at: v.number(),
});
export const decision = v.object({ verdict: v.string(), rule: v.optional(v.string()), kept: v.array(v.string()), dropped: v.array(v.string()), at: v.number() });
export const taskEventKind = v.union(
  v.literal("created"), v.literal("started"), v.literal("ready"), v.literal("blocked"), v.literal("unblocked"), v.literal("done"),
  v.literal("reopened"), v.literal("archived"), v.literal("restored"), v.literal("focused"), v.literal("logged"),
);
export const projectStatus = v.union(v.literal("Active"), v.literal("Archived"), v.literal("Done"));
// What an assistant can propose through the MCP endpoint (convex/mcp.ts). Nothing counts
// until you approve it in the Inbox on Today; approval runs the same rules as the app.
export const inboxProposal = v.union(
  v.object({
    kind: v.literal("session"), taskId: v.optional(v.id("tasks")),
    // Work on something not in Becoming yet: approving creates this task, then logs the session.
    newTask: v.optional(v.object({ title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(), projectId: v.optional(v.id("projects")) })),
    minutes: v.number(), outcome, contribution: v.string(), nextStep: v.string(), skills: v.array(v.string()), evidence: v.string(), endedAt: v.number(),
  }),
  v.object({ kind: v.literal("task"), title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(), projectId: v.optional(v.id("projects")), milestoneId: v.optional(v.id("milestones")) }),
  v.object({ kind: v.literal("idea"), title: v.string(), lane, notes: v.string() }),
  v.object({ kind: v.literal("milestone"), projectId: v.id("projects"), title: v.string(), doneWhen: v.optional(v.string()) }),
  v.object({ kind: v.literal("nextStep"), taskId: v.id("tasks"), nextStep: v.string() }),
  // The project constellation (convex/constellation.ts, convex/genesis.ts).
  v.object({ kind: v.literal("phase"), projectId: v.id("projects"), name: v.string(), goal: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()) }),
  v.object({
    kind: v.literal("doc"), projectId: v.id("projects"), code: v.string(), title: v.string(), summary: v.optional(v.string()), sections: v.optional(v.number()), link: v.optional(v.string()),
    phaseIds: v.array(v.id("phases")), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()), written: v.optional(v.boolean()),
  }),
  // Only the fields given change; "" clears a text field.
  v.object({
    kind: v.literal("docUpdate"), docId: v.id("projectDocs"), code: v.optional(v.string()), title: v.optional(v.string()), summary: v.optional(v.string()), sections: v.optional(v.number()),
    link: v.optional(v.string()), phaseIds: v.optional(v.array(v.id("phases"))), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()), written: v.optional(v.boolean()),
  }),
  v.object({ kind: v.literal("research"), ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()), sources: v.array(v.object({ title: v.string(), url: v.optional(v.string()), kind: researchSource.fields.kind })) }),
  v.object({ kind: v.literal("report"), ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()), findings: v.array(v.object({ text: v.string(), basis: v.optional(v.string()) })) }),
  v.object({ kind: v.literal("decision"), ideaId: v.id("ideas"), verdict: v.string(), rule: v.optional(v.string()), kept: v.array(v.string()), dropped: v.array(v.string()) }),
  // A whole plan, approved once: phases → milestones → tasks, plus the docs and the phases
  // each feeds (by position in `phases`, or an existing phase's id).
  v.object({
    kind: v.literal("plan"), projectId: v.optional(v.id("projects")), newProject: v.optional(v.object({ title: v.string(), purpose: v.string() })),
    phases: v.array(v.object({
      name: v.string(), goal: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()),
      milestones: v.array(v.object({
        title: v.string(), doneWhen: v.optional(v.string()),
        tasks: v.array(v.object({
          title: v.string(), lane, minutes: v.number(), energy: v.number(), doneWhen: v.string(), plannedSessions: v.optional(v.number()),
          // Work that already happened shows honestly: its status, note and real dates.
          status: v.optional(workingStatus), note: v.optional(v.string()), startedAt: v.optional(v.number()), completedAt: v.optional(v.number()),
        })),
      })),
    })),
    docs: v.array(v.object({
      code: v.string(), title: v.string(), summary: v.optional(v.string()), sections: v.optional(v.number()), link: v.optional(v.string()),
      feeds: v.array(v.number()), feedsExisting: v.optional(v.array(v.id("phases"))), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()), written: v.optional(v.boolean()),
    })),
  }),
);
export const brainstorm = v.object({
  problem: v.optional(v.string()), audience: v.optional(v.string()), hook: v.optional(v.string()), smallestBuild: v.optional(v.string()),
  skills: v.optional(v.array(v.string())), references: v.optional(v.array(v.string())),
  openQuestions: v.optional(v.string()), decisions: v.optional(v.string()),
});

export default defineSchema({
  profiles: defineTable({
    owner: v.string(), motive: v.string(), timezone: v.optional(v.string()), weeklyTarget: v.optional(v.number()),
    // A task the person wants next, honoured by Today whenever it fits.
    pinnedTaskId: v.optional(v.id("tasks")),
    // A lane to favour slightly in recommendations; absent means equal attention.
    laneFocus: v.optional(lane),
    // Ritual design: onboarding, focus-screen preferences and the evening reminder choice.
    onboardedAt: v.optional(v.number()),
    focusQuotes: v.optional(v.boolean()),
    focusMusic: v.optional(v.boolean()),
    reminderOn: v.optional(v.boolean()),
    reminderTime: v.optional(v.union(v.literal("19:30"), v.literal("20:30"), v.literal("21:30"))),
    reminderDays: v.optional(v.union(v.literal("weekdays"), v.literal("everyday"))),
    // Reminder by email (default on while reminders are on), and the local day the last one went out.
    reminderEmail: v.optional(v.boolean()),
    lastReminderDay: v.optional(v.string()),
  }).index("by_owner", ["owner"]),
  // Only Active projects feed Today. Done and Archived keep their tasks and history.
  projects: defineTable({
    owner: v.string(), title: v.string(), purpose: v.string(), status: projectStatus,
    outcome: v.optional(v.string()), ideaId: v.optional(v.id("ideas")),
  }).index("by_owner", ["owner"]).index("by_owner_status", ["owner", "status"]),
  // Ordered steps inside a project. Progress is derived from linked tasks; completedAt is
  // recorded when every linked task is done, and cleared if one reopens.
  milestones: defineTable({
    owner: v.string(), projectId: v.id("projects"), title: v.string(), doneWhen: v.optional(v.string()),
    order: v.number(), completedAt: v.optional(v.number()),
    // The phase it belongs to (the constellation's phase rows); none = outside any phase.
    phaseId: v.optional(v.id("phases")),
  }).index("by_project", ["projectId", "order"]).index("by_owner", ["owner"]).index("by_phase", ["phaseId", "order"]),
  // A project's plan, phase by phase: each groups milestones, which group tasks.
  phases: defineTable({
    owner: v.string(), projectId: v.id("projects"), order: v.number(), name: v.string(),
    // One line on what the phase delivers, its next step and when it counts as done.
    goal: v.optional(v.string()), nextStep: v.optional(v.string()), doneWhen: v.optional(v.string()),
  }).index("by_project", ["projectId", "order"]).index("by_owner", ["owner"]),
  // The documents a project's plan stands on (PRD, system design, schema…). The writing lives
  // in your repo; Becoming keeps what it is, where it is, and which phases it feeds.
  projectDocs: defineTable({
    owner: v.string(), projectId: v.id("projects"), code: v.string(), title: v.string(),
    summary: v.optional(v.string()), sections: v.optional(v.number()), link: v.optional(v.string()),
    phaseIds: v.array(v.id("phases")), nextEdit: v.optional(v.string()), doneWhen: v.optional(v.string()),
    // When it was first written; absent while it's only planned.
    writtenAt: v.optional(v.number()), updatedAt: v.number(), source: v.string(),
  }).index("by_project", ["projectId"]).index("by_owner", ["owner"]),
  // Genesis: research threads behind an idea, each with its sources.
  research: defineTable({
    owner: v.string(), ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()), sources: v.array(researchSource), source: v.string(),
  }).index("by_idea", ["ideaId"]).index("by_owner", ["owner"]),
  // Genesis: the report an idea's research produced, and the decision it led to.
  reports: defineTable({
    owner: v.string(), ideaId: v.id("ideas"), title: v.string(), summary: v.optional(v.string()),
    findings: v.array(v.object({ text: v.string(), basis: v.optional(v.string()) })),
    decision: v.optional(decision), source: v.string(), writtenAt: v.number(),
  }).index("by_idea", ["ideaId"]).index("by_owner", ["owner"]),
  ideas: defineTable({
    owner: v.string(), title: v.string(), notes: v.string(), lane, taskId: v.optional(v.id("tasks")), archivedAt: v.optional(v.number()),
    // Optional structured thinking. Quick capture needs none of it.
    brainstorm: v.optional(brainstorm),
  }).index("by_owner", ["owner"]),
  tasks: defineTable({
    owner: v.string(), title: v.string(), lane, status: taskStatus,
    // The status to return to when an archived task is restored.
    archivedFrom: v.optional(workingStatus),
    // Archived because its project was, so making the project active again restores it.
    archivedWithProject: v.optional(v.boolean()),
    projectId: v.optional(v.id("projects")), milestoneId: v.optional(v.id("milestones")), ideaId: v.optional(v.id("ideas")),
    minutes: v.number(), energy: v.number(), doneWhen: v.string(), nextStep: v.string(),
    smallerStep: v.optional(v.string()), smallerDone: v.optional(v.string()), smallerMinutes: v.optional(v.number()),
    dependencies: v.array(v.id("tasks")),
    // Moved freely (tasks.setStatus): when work first started, when it was finished, and the
    // skills it practises (counted in the Mind Bloom when it's done).
    startedAt: v.optional(v.number()), completedAt: v.optional(v.number()), skills: v.optional(v.array(v.string())),
    // How many sessions the task is expected to take ("6 of 10"); the count comes from sessions.
    plannedSessions: v.optional(v.number()),
  }).index("by_owner", ["owner"]).index("by_owner_status", ["owner", "status"]).index("by_project", ["projectId"]).index("by_milestone", ["milestoneId"]),
  activeSessions: defineTable({
    owner: v.string(), taskId: v.id("tasks"), startedAt: v.number(),
    smaller: v.optional(v.boolean()), taskTitle: v.optional(v.string()), lane: v.optional(lane),
    focusTitle: v.optional(v.string()), focusDoneWhen: v.optional(v.string()), focusMinutes: v.optional(v.number()),
    // Whether this was Today's top recommendation, and if not, the optional reason.
    recommended: v.optional(v.boolean()), swapReason: v.optional(swapReason),
  }).index("by_owner", ["owner"]),
  sessions: defineTable({
    owner: v.string(), taskId: v.id("tasks"), key: v.string(), lane, title: v.string(),
    outcome, contribution: v.string(), nextStep: v.string(), evidence: v.string(),
    startedAt: v.optional(v.number()), endedAt: v.number(),
    smaller: v.optional(v.boolean()), doneWhen: v.optional(v.string()),
    // The estimate the person planned for, kept so Journey can compare it with the actual time.
    plannedMinutes: v.optional(v.number()),
    recommended: v.optional(v.boolean()), swapReason: v.optional(swapReason),
    // The task's project when the session was saved, so a case study keeps its history
    // even if the task later moves.
    projectId: v.optional(v.id("projects")),
    // Skills practised in this session, chosen in the recap. They grow the Mind Bloom.
    skills: v.optional(v.array(v.string())),
    // Where it was reported from when not the timer, e.g. "Claude Code" (approved in the Inbox).
    source: v.optional(v.string()),
  }).index("by_owner_endedAt", ["owner", "endedAt"]).index("by_owner_key", ["owner", "key"]).index("by_task", ["taskId"]).index("by_owner_project", ["owner", "projectId"]),
  artifacts: defineTable({
    owner: v.string(), sessionId: v.id("sessions"), title: v.string(), url: v.string(),
    status: artifactStatus, portfolioCandidate: v.boolean(),
    // Context for a future case study, and the skills this evidence shows (no proficiency scores).
    notes: v.optional(v.string()), skills: v.optional(v.array(v.string())),
    // Recorded only while Published: where it went public, and on which day.
    publishedUrl: v.optional(v.string()), publishedOn: v.optional(v.string()),
    // An optional screenshot in Convex file storage.
    imageId: v.optional(v.id("_storage")),
    // When it was flagged as a portfolio candidate; cleared if the flag is removed.
    candidateSince: v.optional(v.number()),
  }).index("by_owner", ["owner"]).index("by_owner_status", ["owner", "status"]).index("by_owner_candidate", ["owner", "portfolioCandidate"])
    .index("by_session", ["sessionId"]).index("by_image", ["imageId"]),
  // "From this week on, the target is N", optionally marking that one week as a planned pause.
  weeklyCommitments: defineTable({ owner: v.string(), week: v.string(), target: v.number(), paused: v.boolean() }).index("by_owner_week", ["owner", "week"]),
  // One private learning and intention per week.
  reflections: defineTable({ owner: v.string(), week: v.string(), learning: v.string(), intention: v.string() }).index("by_owner_week", ["owner", "week"]),
  // The weekly review's plan for a week: one intention and a few lined-up steps that
  // Today offers first whenever they fit.
  weekPlans: defineTable({ owner: v.string(), week: v.string(), intention: v.string(), taskIds: v.array(v.id("tasks")) }).index("by_owner_week", ["owner", "week"]),
  // Every move a task makes, for its timeline and the Journey activity feed.
  taskEvents: defineTable({
    owner: v.string(), taskId: v.id("tasks"), projectId: v.optional(v.id("projects")), kind: taskEventKind, at: v.number(),
    // "app", or the assistant that made the change (the token's name).
    source: v.string(),
    // What changed (done), what's blocking it (blocked), or the next step (unblocked, reopened).
    note: v.optional(v.string()),
  }).index("by_task", ["taskId", "at"]).index("by_owner_at", ["owner", "at"]),
  // Access tokens for assistants (MCP), made in Settings. Only a SHA-256 hash is kept; the
  // token itself is shown once. Deleting the row revokes it.
  apiTokens: defineTable({ owner: v.string(), name: v.string(), hash: v.string(), prefix: v.string(), lastUsedAt: v.optional(v.number()) })
    .index("by_hash", ["hash"]).index("by_owner", ["owner"]),
  // Phone and browser notifications (Web Push), one row per device that turned them on.
  pushSubscriptions: defineTable({ owner: v.string(), endpoint: v.string(), p256dh: v.string(), auth: v.string() })
    .index("by_owner", ["owner"]).index("by_endpoint", ["endpoint"]),
  // What assistants propose, waiting for you. `source` names the assistant (the token's name).
  inbox: defineTable({ owner: v.string(), source: v.string(), proposal: inboxProposal }).index("by_owner", ["owner"]),
});
