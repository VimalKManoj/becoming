import { ConvexError, v } from "convex/values";
import { httpAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { bloomSkillList } from "./lib/bloom";
import { commitmentFor } from "./lib/rhythm";
import { weekKey, weekRange } from "./lib/time";
import { hashToken } from "./lib/tokens";
import { httpUrl } from "./lib/validate";
import { constellationFor, docCodeValue, linkValue } from "./constellation";
import { checkPlannedStatus, checkPlanShape, describeItem, inboxLimit, planCounts, planLimits, type PlanProposal } from "./inbox";
import { projectFor, projectsFor } from "./projects";
import { todayFor } from "./tasks";

// Becoming as an MCP server: assistants (Claude Code, Claude, ChatGPT, Cursor) read your
// work and propose updates. Requests carry an access token from Settings → Assistants; the
// owner comes only from that token. Reads answer directly. Every write is a proposal that
// waits in the Inbox on Today until you approve it there (convex/inbox.ts).
// Transport: Streamable HTTP, answered with plain JSON (no server-initiated messages).

type Lane = Doc<"tasks">["lane"];
type Input = Record<string, unknown>;
type Db = Pick<QueryCtx, "db">;

const supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const lanes: Lane[] = ["Projects", "Showcases", "Writing"];
const energyName = ["", "low", "steady", "high"];
const skillNames = bloomSkillList.map(skill => skill.name);
const iso = (time: number | null | undefined) => (time ? new Date(time).toISOString() : null);

const instructions = `Becoming is the user's evening work tracker: projects, tasks, focus sessions, ideas and proof of work.
- Reads answer from the user's real records. Never invent numbers, minutes or outcomes; ask the user when you don't know.
- Every change you make (log_session, add_task, capture_idea, add_milestone, set_next_step, add_phase, add_doc, update_doc, add_research, write_report, record_decision, import_plan) is a proposal: it waits in the user's Inbox on Today until they approve it. Tell them it's waiting there.
- Lanes: Projects (building a project), Showcases (small pieces, components), Writing (notes and posts).
- Skills (for log_session) must come from: ${skillNames.join(", ")}.
- Outcomes: finished (the task's done-when is met), progress (made progress; needs a next step), blocked (needs what's blocking it, as the next step).
- Refer to tasks and projects by the id from a list tool, or by a distinctive part of the title.
- A project's constellation: phases (numbered 00, 01…) group milestones, which group tasks; docs (PRD, SYS…) record what the plan stands on, with a link to the file in the repo, and feed phases. get_constellation shows the whole map. The writing stays in the repo; Becoming keeps each doc's details and link.
- To bring in a whole plan (from PLAN.md or the repo's docs), send ONE import_plan, not many add_task calls. It only adds what's missing: phases match by name, milestones by title within their phase, tasks by title within their milestone, docs by code.
- Genesis is what came before a project: its idea's research threads (sources of kind "brief" are summaries you wrote), the report, and the decision to build.`;

// ---------- Tools ----------

const laneSchema = { type: "string", enum: ["Projects", "Showcases", "Writing"] };
const energySchema = { type: "string", enum: ["low", "steady", "high"] };
const docProperties = {
  project: { type: "string", description: "Project id or title" },
  code: { type: "string", description: "1 to 4 letters or digits, like PRD, SYS or API" }, title: { type: "string" }, summary: { type: "string" },
  sections: { type: "integer", minimum: 0, maximum: 999 }, link: { type: "string", description: "A repo path such as documents/PRD.md, or an https link" },
  feeds: { type: "array", items: { type: "string" }, description: 'Phases it feeds, by number ("05") or name' },
  next_edit: { type: "string" }, done_when: { type: "string" }, written: { type: "boolean", description: "False while it's only planned" },
};
const ideaRef = {
  idea: { type: "string", description: "Idea id or title" },
  project: { type: "string", description: "Or a project id or title: the idea it grew from is used" },
};
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const propose = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const tools = [
  { name: "whats_next", title: "What to work on now", annotations: read,
    description: "Tonight's focus for the time and energy the user has, with why it was chosen, plus a few alternatives. The same recommender as the Today screen.",
    inputSchema: { type: "object", properties: { minutes: { type: "integer", minimum: 5, maximum: 240, description: "Minutes available" }, energy: energySchema, lane: laneSchema, project: { type: "string", description: "Project id or title, to focus on one project" } }, required: ["minutes", "energy"] } },
  { name: "list_projects", title: "Active projects", annotations: read,
    description: "Active projects with purpose, task progress, the current milestone, the next step and when each was last worked on.",
    inputSchema: { type: "object", properties: {} } },
  { name: "get_project", title: "One project in detail", annotations: read,
    description: "A project's milestones in order, each with its tasks and statuses, plus tasks outside any milestone.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or title" } }, required: ["project"] } },
  { name: "list_tasks", title: "Tasks", annotations: read,
    description: "Tasks with lane, status, estimate, done-when and next step. Open means Ready or In progress.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open", "blocked", "done"], description: "Default open" }, lane: laneSchema, project: { type: "string", description: "Project id or title" } } } },
  { name: "get_week", title: "This week", annotations: read,
    description: "This week's rhythm: the weekly target, sessions so far, a planned pause, the week's intention and the steps lined up for it.",
    inputSchema: { type: "object", properties: {} } },
  { name: "recent_sessions", title: "Recent sessions", annotations: read,
    description: "The latest saved sessions: what changed, the outcome, the next step, skills and evidence.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30, description: "Default 10" } } } },
  { name: "list_inbox", title: "Waiting for approval", annotations: read,
    description: "Proposals already waiting in the user's Inbox, so you don't send the same one twice.",
    inputSchema: { type: "object", properties: {} } },
  { name: "log_session", title: "Log work done", annotations: propose,
    description: "Propose a finished stretch of work, e.g. at the end of a coding session or conversation. Goes to the Inbox for approval. Use an existing open task, or new_task_* to create one together with the session.",
    inputSchema: { type: "object", properties: {
      task: { type: "string", description: "Open task id or title" },
      new_task_title: { type: "string" }, new_task_lane: laneSchema, new_task_done_when: { type: "string", description: "When the new task counts as done" }, new_task_project: { type: "string", description: "Project id or title for the new task" },
      minutes: { type: "integer", minimum: 1, maximum: 720 },
      outcome: { type: "string", enum: ["finished", "progress", "blocked"] },
      what_changed: { type: "string", description: "One or two sentences on what moved forward" },
      next_step: { type: "string", description: "Required unless finished; for blocked, what's blocking it and how to unblock" },
      skills: { type: "array", items: { type: "string", enum: skillNames }, maxItems: 5 },
      evidence_url: { type: "string", description: "Optional link: a PR, commit, deploy or post" },
      ended_at: { type: "string", description: "Optional ISO time the work ended; default now" },
    }, required: ["minutes", "outcome", "what_changed"] } },
  { name: "add_task", title: "Add a task", annotations: propose,
    description: "Propose a new Ready task. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, lane: laneSchema, minutes: { type: "integer", minimum: 5, maximum: 240 }, energy: energySchema, done_when: { type: "string" }, project: { type: "string", description: "Project id or title" }, milestone: { type: "string", description: "Milestone title within the project" } }, required: ["title", "lane", "minutes", "energy", "done_when"] } },
  { name: "capture_idea", title: "Capture an idea", annotations: propose,
    description: "Propose an idea for the user's notebook (not a commitment; it never adds work to Today). Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, lane: laneSchema, notes: { type: "string" } }, required: ["title", "lane"] } },
  { name: "add_milestone", title: "Add a milestone", annotations: propose,
    description: "Propose a new last milestone for a project. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or title" }, title: { type: "string" }, done_when: { type: "string" } }, required: ["project", "title"] } },
  { name: "set_next_step", title: "Set a task's next step", annotations: propose,
    description: "Propose a new next step for an open or blocked task. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Task id or title" }, next_step: { type: "string" } }, required: ["task", "next_step"] } },
  { name: "get_constellation", title: "A project's whole map", annotations: read,
    description: "One project as its constellation: genesis (idea, research, report, decision), docs with the phases each feeds, and phases with their milestones and task codes and states (done, doing, ready, blocked), plus totals.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or title" } }, required: ["project"] } },
  { name: "get_phase", title: "One phase in detail", annotations: read,
    description: "One phase of a project: goal, next step, done-when, progress, the docs it's built from, and each milestone's tasks with status, estimate, next step and sessions.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or title" }, phase: { type: "string", description: 'Phase number ("05") or name' } }, required: ["project", "phase"] } },
  { name: "add_phase", title: "Add a phase", annotations: propose,
    description: "Propose a new last phase for a project. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or title" }, name: { type: "string" }, goal: { type: "string", description: "One line on what the phase delivers" }, next_step: { type: "string" }, done_when: { type: "string" } }, required: ["project", "name"] } },
  { name: "add_doc", title: "Add a doc", annotations: propose,
    description: "Propose a document the project's plan stands on (PRD, system design, schema…): its details and a link to the file in the repo (or a web address). The writing stays in the repo. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: docProperties, required: ["project", "code", "title"] } },
  { name: "update_doc", title: "Update a doc", annotations: propose,
    description: "Propose changes to a project's doc, found by its code. Only the fields given change; an empty string clears a text field; feeds replaces the phases it feeds. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { ...docProperties, new_code: { type: "string", description: "A new code, to rename it" } }, required: ["project", "code"] } },
  { name: "add_research", title: "Add a research thread", annotations: propose,
    description: "Propose a research thread behind an idea, with its sources. Mark a summary you wrote yourself as kind \"brief\". A thread with the same title gets the new sources added. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { ...ideaRef, title: { type: "string", description: "The thread's question or topic" }, summary: { type: "string" },
      sources: { type: "array", maxItems: 50, items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" }, kind: { type: "string", enum: ["read", "interview", "tried", "brief"] } }, required: ["title", "kind"] } } }, required: ["title", "sources"] } },
  { name: "write_report", title: "Write the research report", annotations: propose,
    description: "Propose the report an idea's research produced: a title, summary and findings, each with the source it traces to. Replaces the idea's earlier report. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { ...ideaRef, title: { type: "string" }, summary: { type: "string" },
      findings: { type: "array", maxItems: 20, items: { type: "object", properties: { text: { type: "string" }, basis: { type: "string", description: "The source it traces to" } }, required: ["text"] } } }, required: ["title", "findings"] } },
  { name: "record_decision", title: "Record the decision", annotations: propose,
    description: "Propose the decision an idea's research led to: the verdict, an optional rule, and what was kept and dropped. Goes to the Inbox for approval.",
    inputSchema: { type: "object", properties: { ...ideaRef, verdict: { type: "string" }, rule: { type: "string" }, kept: { type: "array", items: { type: "string" }, maxItems: 12 }, dropped: { type: "array", items: { type: "string" }, maxItems: 12 } }, required: ["verdict"] } },
  { name: "import_plan", title: "Import a whole plan", annotations: propose,
    description: `Propose a whole plan for a project as ONE Inbox item, approved once: phases → milestones → tasks, plus the docs and the phases each feeds. Give "project" (an existing active project) or "new_project" (created on approval). Only what's missing is added: phases match by name, milestones by title within their phase, tasks by title within their milestone, and docs by code (updated). Work that already happened can carry its status and real dates. Up to ${planLimits.phases} phases, ${planLimits.milestones} milestones, ${planLimits.tasks} tasks and ${planLimits.docs} docs.`,
    inputSchema: { type: "object", properties: {
      project: { type: "string", description: "Existing project id or title" },
      new_project: { type: "object", properties: { title: { type: "string" }, purpose: { type: "string" } }, required: ["title", "purpose"] },
      phases: { type: "array", minItems: 1, maxItems: planLimits.phases, items: { type: "object", properties: {
        name: { type: "string" }, goal: { type: "string" }, next_step: { type: "string" }, done_when: { type: "string" },
        milestones: { type: "array", maxItems: planLimits.milestonesPerPhase, items: { type: "object", properties: {
          title: { type: "string" }, done_when: { type: "string" },
          tasks: { type: "array", maxItems: planLimits.tasksPerMilestone, items: { type: "object", properties: {
            title: { type: "string" }, lane: laneSchema, minutes: { type: "integer", minimum: 5, maximum: 240 }, energy: energySchema, done_when: { type: "string" },
            planned_sessions: { type: "integer", minimum: 1, maximum: 100 },
            status: { type: "string", enum: ["ready", "in progress", "blocked", "done"], description: "Default ready" },
            note: { type: "string", description: "Required for blocked (what's blocking it); for done, what changed" },
            started_at: { type: "string", description: "ISO date it started; not in the future" },
            completed_at: { type: "string", description: "ISO date it was finished (done only); not before started_at" },
          }, required: ["title", "lane", "minutes", "energy", "done_when"] } },
        }, required: ["title"] } },
      }, required: ["name"] } },
      docs: { type: "array", maxItems: planLimits.docs, items: { type: "object", properties: {
        code: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, sections: { type: "integer", minimum: 0, maximum: 999 }, link: { type: "string" },
        feeds: { type: "array", items: { type: ["integer", "string"] }, description: "Phases it feeds: a position in this plan's phases (0-based), or a phase name (in this plan or already in the project)" },
        next_edit: { type: "string" }, done_when: { type: "string" }, written: { type: "boolean", description: "Default true; false while it's only planned" },
      }, required: ["code", "title"] } },
    }, required: ["phases"] } },
] as const;

const readTools = new Set(["whats_next", "list_projects", "get_project", "list_tasks", "get_week", "recent_sessions", "list_inbox", "get_constellation", "get_phase"]);

const prompts = [
  { name: "log_this_conversation", title: "Log this conversation to Becoming", description: "Turn what we did here into one Becoming session (sent to the Inbox).",
    text: "Summarise the work we did in this conversation as one Becoming session. First call list_tasks (and list_inbox) to find the task it belongs to; if none fits, propose it with new_task_* fields. Ask me for the minutes and the outcome if you can't tell them for certain. Pick at most 5 skills from the allowed list, add a link as evidence if we produced one, then call log_session and tell me it's waiting in my Inbox." },
  { name: "evening_check_in", title: "Evening check-in", description: "What to work on tonight.",
    text: "Ask me how many minutes I have tonight and my energy (low, steady or high), then call whats_next and tell me tonight's focus, why, and one alternative. Keep it short." },
  { name: "weekly_review", title: "Weekly review", description: "Look back at this week and shape the next.",
    text: "Call get_week and recent_sessions, then help me look back on this week in three short parts: what I did, what I learned, and what to line up next. Propose follow-up tasks with add_task only if I agree." },
  { name: "sync_project_from_docs", title: "Sync a project from its docs", description: "Read this repo's plan and docs, and propose them to Becoming as the project's constellation (sent to the Inbox).",
    text: "Sync this repo's plan into Becoming. 1) Call list_projects and find the project this repo belongs to; ask me if unsure, or whether it should be a new project. 2) Call get_constellation for it to see what's already there. 3) Read the repo's plan (PLAN.md or documents/PLAN*.md) and its docs (PRD, system design, API, schema, UI flow, design system). 4) Propose what's missing as ONE import_plan: the phases in order, their milestones and tasks (lane, minutes, energy, done-when; for work already done, its status and real dates from the plan or git history), and the docs with a short code, title, summary, section count, the repo path as link, and the phases each feeds. 5) For docs that already exist but changed, use update_doc. Never invent dates or progress; leave a task ready when unsure. Then tell me what's waiting in my Inbox." },
];

// ---------- Input helpers ----------

function text(input: Input, key: string, max: number, required = true) {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new ConvexError(`"${key}" is required.`);
    return "";
  }
  if (typeof value !== "string") throw new ConvexError(`"${key}" must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new ConvexError(`"${key}" is required.`);
  if (trimmed.length > max) throw new ConvexError(`"${key}" can be up to ${max} characters.`);
  return trimmed;
}

function int(input: Input, key: string, min: number, max: number, fallback?: number) {
  const value = input[key] ?? fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new ConvexError(`"${key}" must be a whole number from ${min} to ${max}.`);
  return value;
}

function laneOf(value: unknown, required = true): Lane | undefined {
  if (value === undefined || value === null || value === "") { if (required) throw new ConvexError(`"lane" is required: Projects, Showcases or Writing.`); return undefined; }
  const found = lanes.find(lane => lane.toLowerCase() === String(value).trim().toLowerCase());
  if (!found) throw new ConvexError(`Lane must be Projects, Showcases or Writing.`);
  return found;
}

function energyOf(value: unknown) {
  const index = energyName.indexOf(String(value ?? "").trim().toLowerCase());
  if (index < 1) throw new ConvexError(`Energy must be low, steady or high.`);
  return index;
}

function outcomeOf(value: unknown): Doc<"sessions">["outcome"] {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "finished") return "Finished";
  if (key === "progress" || key === "made progress") return "Made progress";
  if (key === "blocked") return "Blocked";
  throw new ConvexError(`Outcome must be finished, progress or blocked.`);
}

function skillsOf(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ConvexError(`"skills" must be a list.`);
  const skills: string[] = [];
  for (const item of value) {
    const found = skillNames.find(name => name.toLowerCase() === String(item).trim().toLowerCase());
    if (!found) throw new ConvexError(`Unknown skill "${String(item)}". Use: ${skillNames.join(", ")}.`);
    if (!skills.includes(found)) skills.push(found);
  }
  if (skills.length > 5) throw new ConvexError("Use up to 5 skills.");
  return skills;
}

function endedAtOf(value: unknown) {
  if (value === undefined || value === null || value === "") return Date.now();
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) throw new ConvexError(`"ended_at" must be an ISO date and time.`);
  if (time > Date.now() + 5 * 60_000) throw new ConvexError("Work can't end in the future.");
  if (time < Date.now() - 30 * 86_400_000) throw new ConvexError("Log work from the last 30 days.");
  return time;
}

/** A task by id or by a distinctive part of its title, among the given statuses. */
async function findTask(ctx: Db, owner: string, ref: string, statuses: Doc<"tasks">["status"][]) {
  const id = ctx.db.normalizeId("tasks", ref);
  if (id) {
    const task = await ctx.db.get(id);
    if (task && task.owner === owner && statuses.includes(task.status)) return task;
    if (task && task.owner === owner) throw new ConvexError(`"${task.title}" is ${task.status}, so it can't be used here.`);
  }
  const pools = await Promise.all(statuses.map(status => ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", status)).take(200)));
  const needle = ref.trim().toLowerCase();
  const all = pools.flat();
  const exact = all.filter(task => task.title.toLowerCase() === needle);
  const matches = exact.length ? exact : all.filter(task => task.title.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new ConvexError(`No ${statuses.join(" or ").toLowerCase()} task matches "${ref}". Call list_tasks to see them.`);
  throw new ConvexError(`"${ref}" matches several tasks: ${matches.slice(0, 5).map(task => `${task.title} (${task._id})`).join("; ")}. Use an id.`);
}

async function findProject(ctx: Db, owner: string, ref: string) {
  const id = ctx.db.normalizeId("projects", ref);
  if (id) {
    const project = await ctx.db.get(id);
    if (project && project.owner === owner) return project;
  }
  const active = await ctx.db.query("projects").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", "Active")).take(100);
  const needle = ref.trim().toLowerCase();
  const exact = active.filter(project => project.title.toLowerCase() === needle);
  const matches = exact.length ? exact : active.filter(project => project.title.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new ConvexError(`No active project matches "${ref}". Call list_projects to see them.`);
  throw new ConvexError(`"${ref}" matches several projects: ${matches.slice(0, 5).map(project => `${project.title} (${project._id})`).join("; ")}. Use an id.`);
}

async function findMilestone(ctx: Db, projectId: Id<"projects">, ref: string) {
  const milestones = await ctx.db.query("milestones").withIndex("by_project", q => q.eq("projectId", projectId)).collect();
  const needle = ref.trim().toLowerCase();
  const match = milestones.find(m => m._id === ref) ?? milestones.find(m => m.title.toLowerCase() === needle) ?? milestones.find(m => m.title.toLowerCase().includes(needle));
  if (!match) throw new ConvexError(`No milestone in this project matches "${ref}". Call get_project to see them.`);
  return match;
}

/** Text that is optional: undefined when absent (or empty, unless `keepEmpty`, where "" clears a field). */
function maybe(input: Input, key: string, max: number, keepEmpty = false) {
  if (input[key] === undefined || input[key] === null) return undefined;
  const value = text(input, key, max, false);
  return value || keepEmpty ? value : undefined;
}

function list(input: Input, key: string, max: number, required = false): Input[] {
  const value = input[key];
  if (value === undefined || value === null) { if (required) throw new ConvexError(`"${key}" is required.`); return []; }
  if (!Array.isArray(value)) throw new ConvexError(`"${key}" must be a list.`);
  if (value.length > max) throw new ConvexError(`"${key}" can have up to ${max} items.`);
  return value.map((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ConvexError(`Item ${i + 1} of "${key}" must be an object.`);
    return item as Input;
  });
}

function strings(input: Input, key: string, maxItems: number, maxLength: number) {
  const value = input[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new ConvexError(`"${key}" must be a list of text.`);
  const clean = value.map(item => (item as string).trim()).filter(Boolean);
  if (clean.length > maxItems || clean.some(item => item.length > maxLength)) throw new ConvexError(`Keep "${key}" to ${maxItems} items of up to ${maxLength} characters.`);
  return clean;
}

function bool(input: Input, key: string) {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new ConvexError(`"${key}" must be true or false.`);
  return value;
}

function optionalInt(input: Input, key: string, min: number, max: number) {
  return input[key] === undefined || input[key] === null ? undefined : int(input, key, min, max);
}

function statusOf(value: unknown, title: string): Doc<"tasks">["status"] {
  const key = String(value ?? "ready").trim().toLowerCase().replace(/[_-]/g, " ");
  if (key === "ready") return "Ready";
  if (key === "in progress" || key === "doing") return "In progress";
  if (key === "blocked") return "Blocked";
  if (key === "done") return "Done";
  throw new ConvexError(`The status of "${title}" must be ready, in progress, blocked or done.`);
}

/** An ISO date and time in the past (a little clock drift allowed). */
function pastTime(input: Input, key: string, label: string) {
  const value = input[key];
  if (value === undefined || value === null || value === "") return undefined;
  const time = Date.parse(String(value));
  if (Number.isNaN(time)) throw new ConvexError(`"${key}" of "${label}" must be an ISO date.`);
  if (time > Date.now() + 5 * 60_000) throw new ConvexError(`"${key}" of "${label}" can't be in the future.`);
  if (time < Date.parse("2000-01-01T00:00:00Z")) throw new ConvexError(`"${key}" of "${label}" is too far back.`);
  return time;
}

async function phasesOf(ctx: Db, owner: string, projectId: Id<"projects">) {
  return (await ctx.db.query("phases").withIndex("by_project", q => q.eq("projectId", projectId)).collect()).filter(p => p.owner === owner).sort((a, b) => a.order - b.order);
}

/** A phase by its number ("05", 5, "Phase 05") or by name. Numbers count from 00, as the map shows them. */
function matchPhase(phases: Doc<"phases">[], ref: unknown) {
  if (typeof ref === "number" && Number.isInteger(ref)) return phases[ref] ?? null;
  const raw = String(ref ?? "").trim();
  const number = raw.match(/^(?:phase\s*)?(\d{1,2})$/i);
  if (number) return phases[Number(number[1])] ?? null;
  const needle = raw.toLowerCase();
  if (!needle) return null;
  const exact = phases.filter(p => p.name.toLowerCase() === needle);
  const matches = exact.length ? exact : phases.filter(p => p.name.toLowerCase().includes(needle));
  if (matches.length > 1) throw new ConvexError(`"${raw}" matches several phases: ${matches.slice(0, 5).map(p => p.name).join("; ")}. Use a number.`);
  return matches[0] ?? null;
}

function findPhase(phases: Doc<"phases">[], ref: unknown) {
  const phase = matchPhase(phases, ref);
  if (!phase) throw new ConvexError(`No phase matches "${String(ref)}". Call get_constellation to see them.`);
  return phase;
}

async function findIdea(ctx: Db, owner: string, ref: string) {
  const id = ctx.db.normalizeId("ideas", ref);
  if (id) {
    const idea = await ctx.db.get(id);
    if (idea && idea.owner === owner) return idea;
  }
  const ideas = await ctx.db.query("ideas").withIndex("by_owner", q => q.eq("owner", owner)).take(500);
  const needle = ref.trim().toLowerCase();
  const exact = ideas.filter(idea => idea.title.toLowerCase() === needle);
  const matches = exact.length ? exact : ideas.filter(idea => idea.title.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new ConvexError(`No idea matches "${ref}".`);
  throw new ConvexError(`"${ref}" matches several ideas: ${matches.slice(0, 5).map(idea => `${idea.title} (${idea._id})`).join("; ")}. Use an id.`);
}

/** The idea named by "idea", or the one "project" grew from. */
async function ideaFrom(ctx: Db, owner: string, input: Input) {
  const ref = text(input, "idea", 200, false);
  if (ref) return findIdea(ctx, owner, ref);
  const projectRef = text(input, "project", 200, false);
  if (!projectRef) throw new ConvexError(`Give "idea" (an idea id or title) or "project" (a project that grew from an idea).`);
  const project = await findProject(ctx, owner, projectRef);
  const idea = project.ideaId ? await ctx.db.get(project.ideaId) : null;
  if (!idea || idea.owner !== owner) throw new ConvexError(`"${project.title}" didn't grow from an idea in Becoming. Name the idea with "idea".`);
  return idea;
}

async function findDoc(ctx: Db, owner: string, projectId: Id<"projects">, code: string) {
  const docs = (await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", projectId)).collect()).filter(d => d.owner === owner);
  const wanted = code.trim().toUpperCase();
  const doc = docs.find(d => d.code === wanted);
  if (!doc) throw new ConvexError(`This project has no doc coded "${wanted}"${docs.length ? ` (it has ${docs.map(d => d.code).join(", ")})` : ""}. Use add_doc for a new one.`);
  return { doc, docs };
}

/** "feeds" as phase ids of the project, by number or name. */
function feedsOf(input: Input, phases: Doc<"phases">[]) {
  const value = input.feeds;
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new ConvexError(`"feeds" must be a list of phase numbers or names.`);
  return [...new Set(value.map(ref => findPhase(phases, ref)._id))];
}

const taskBrief = (task: Doc<"tasks">, project?: string | null) => ({
  id: task._id, title: task.title, lane: task.lane, status: task.status, minutes: task.minutes, energy: energyName[task.energy],
  doneWhen: task.doneWhen, nextStep: task.nextStep || null, ...(project ? { project } : {}),
});

// ---------- Reads ----------

async function runRead(ctx: QueryCtx, owner: string, tool: string, input: Input) {
  const profile = await ctx.db.query("profiles").withIndex("by_owner", q => q.eq("owner", owner)).unique();
  const zone = profile?.timezone ?? "UTC";
  switch (tool) {
    case "whats_next": {
      const project = typeof input.project === "string" && input.project.trim() ? await findProject(ctx, owner, input.project) : null;
      const overview = await todayFor(ctx, owner, { minutes: int(input, "minutes", 5, 240), energy: energyOf(input.energy), lane: laneOf(input.lane, false), projectId: project?._id, week: weekKey(Date.now(), zone) });
      const brief = (choice: (typeof overview.choices)[number]) => ({
        taskId: choice.taskId, title: choice.title, ...(choice.smaller ? { smallerStepOf: choice.taskTitle } : {}), lane: choice.lane, project: choice.projectTitle,
        minutes: choice.minutes, energy: energyName[choice.energy], doneWhen: choice.doneWhen, nextStep: choice.nextStep || null, why: choice.reason, linedUpThisWeek: choice.linedUp,
      });
      return {
        state: overview.state,
        focus: overview.choices[0] ? brief(overview.choices[0]) : null,
        alternatives: [...overview.choices.slice(1, 3), ...overview.alternatives].slice(0, 3).map(brief),
        activeSession: overview.active ? { title: overview.active.title, startedAt: iso(overview.active.startedAt), plannedMinutes: overview.active.minutes } : null,
        pinned: overview.pinned,
        lastSession: overview.lastSession ? { title: overview.lastSession.title, outcome: overview.lastSession.outcome, nextStep: overview.lastSession.nextStep || null, endedAt: iso(overview.lastSession.endedAt) } : null,
      };
    }
    case "list_projects":
      return (await projectsFor(ctx, owner, "Active")).map(project => ({
        id: project._id, title: project.title, purpose: project.purpose, tasksDone: project.progress.done, tasksTotal: project.progress.total,
        milestones: `${project.milestones.done} of ${project.milestones.total} done`, currentMilestone: project.milestones.currentTitle,
        nextStep: project.nextTask ? { taskId: project.nextTask._id, title: project.nextTask.title, minutes: project.nextTask.minutes } : null,
        lastWorkedAt: iso(project.lastWorkedAt),
      }));
    case "get_project": {
      const found = await findProject(ctx, owner, text(input, "project", 200));
      const project = await projectFor(ctx, owner, found._id);
      if (!project) throw new ConvexError("That project isn't available.");
      const task = (t: (typeof project.unassigned)[number]) => ({ id: t._id, title: t.title, status: t.status, lane: t.lane, minutes: t.minutes, nextStep: t.nextStep || null });
      return {
        id: project._id, title: project.title, purpose: project.purpose, status: project.status, tasksDone: project.progress.done, tasksTotal: project.progress.total,
        milestones: project.milestones.map(m => ({ id: m._id, title: m.title, doneWhen: m.doneWhen || null, completed: m.completedAt !== undefined, tasks: m.tasks.map(task) })),
        otherTasks: project.unassigned.map(task),
      };
    }
    case "list_tasks": {
      const status = String(input.status ?? "open");
      const statuses: Doc<"tasks">["status"][] = status === "blocked" ? ["Blocked"] : status === "done" ? ["Done"] : ["In progress", "Ready"];
      const lane = laneOf(input.lane, false);
      const project = typeof input.project === "string" && input.project.trim() ? await findProject(ctx, owner, input.project) : null;
      const pools = await Promise.all(statuses.map(s => ctx.db.query("tasks").withIndex("by_owner_status", q => q.eq("owner", owner).eq("status", s)).order(s === "Done" ? "desc" : "asc").take(100)));
      const tasks = pools.flat().filter(task => (!lane || task.lane === lane) && (!project || task.projectId === project._id)).slice(0, 50);
      const projectIds = [...new Set(tasks.flatMap(task => (task.projectId ? [task.projectId] : [])))];
      const titles = new Map((await Promise.all(projectIds.map(id => ctx.db.get(id)))).flatMap(p => (p ? [[String(p._id), p.title] as const] : [])));
      return tasks.map(task => taskBrief(task, task.projectId ? titles.get(String(task.projectId)) : null));
    }
    case "get_week": {
      const week = weekKey(Date.now(), zone);
      const [commitments, plan] = await Promise.all([
        ctx.db.query("weeklyCommitments").withIndex("by_owner_week", q => q.eq("owner", owner)).collect(),
        ctx.db.query("weekPlans").withIndex("by_owner_week", q => q.eq("owner", owner).eq("week", week)).unique(),
      ]);
      const { start, end } = weekRange(week, zone);
      const sessions = await ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner).gte("endedAt", start).lt("endedAt", end)).take(100);
      const inForce = commitmentFor(week, commitments.map(c => ({ week: c.week, target: c.target, paused: c.paused })));
      const linedUp = plan ? (await Promise.all(plan.taskIds.map(id => ctx.db.get(id)))).flatMap(task => (task && task.owner === owner ? [{ id: task._id, title: task.title, status: task.status }] : [])) : [];
      return {
        week, timezone: profile?.timezone ?? null, weeklyTarget: inForce?.target ?? null, plannedPause: inForce?.paused ?? false,
        sessionsThisWeek: sessions.length, sessions: sessions.map(s => ({ title: s.title, lane: s.lane, outcome: s.outcome, endedAt: iso(s.endedAt) })),
        intention: plan?.intention || null, linedUp,
      };
    }
    case "recent_sessions": {
      const sessions = await ctx.db.query("sessions").withIndex("by_owner_endedAt", q => q.eq("owner", owner)).order("desc").take(int(input, "limit", 1, 30, 10));
      return sessions.map(s => ({
        title: s.title, lane: s.lane, outcome: s.outcome, whatChanged: s.contribution, nextStep: s.nextStep || null, skills: s.skills ?? [], evidence: s.evidence || null,
        minutes: s.startedAt ? Math.round((s.endedAt - s.startedAt) / 60_000) : null, endedAt: iso(s.endedAt), ...(s.source ? { via: s.source } : {}),
      }));
    }
    case "list_inbox": {
      const items = await ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).order("desc").take(50);
      return (await Promise.all(items.map(item => describeItem(ctx, owner, item)))).map(item => ({ kind: item.kind, title: item.title, details: item.details, from: item.source, sentAt: iso(item.createdAt) }));
    }
    case "get_constellation": {
      const found = await findProject(ctx, owner, text(input, "project", 200));
      const map = await constellationFor(ctx, owner, found._id);
      if (!map) throw new ConvexError("That project isn't available.");
      const pct = (x: { done: number; total: number; pct: number }) => `${x.done}/${x.total} (${x.pct}%)`;
      const milestone = (m: (typeof map.loose.milestones)[number]) => ({
        code: m.code, id: m.id, title: m.title, progress: pct(m), tasks: m.tasks.map(t => ({ code: t.code, id: t.id, title: t.title, state: t.state })),
      });
      const { genesis } = map;
      return {
        project: { id: map.project.id, title: map.project.title, purpose: map.project.purpose, status: map.project.status },
        stats: { tasks: pct(map.stats), doing: map.stats.doing, blocked: map.stats.blocked, phases: map.stats.phases, phasesDone: map.stats.phasesDone, docs: map.stats.docs, sessions: map.stats.sessions, focusedMinutes: map.stats.focusedMinutes },
        genesis: {
          idea: genesis.idea ? { id: genesis.idea.id, title: genesis.idea.title } : null,
          research: genesis.research.map(r => ({ title: r.title, sources: r.sources.length, briefs: r.sources.filter(s => s.kind === "brief").length })),
          report: genesis.report ? { title: genesis.report.title, findings: genesis.report.findings.length, writtenAt: iso(genesis.report.writtenAt) } : null,
          decision: genesis.decision ? { verdict: genesis.decision.verdict, at: iso(genesis.decision.at) } : null,
        },
        docs: map.docs.map(d => ({ code: d.code, title: d.title, link: d.link, written: d.writtenAt !== null, feeds: d.feeds, tasksInformed: d.tasksInformed, updatedAt: iso(d.updatedAt) })),
        phases: map.phases.map(p => ({ num: p.num, name: p.name, state: p.state, progress: pct(p), goal: p.goal || null, nextStep: p.nextStep || null, milestones: p.milestones.map(milestone) })),
        outsidePhases: { milestones: map.loose.milestones.map(milestone), tasks: map.loose.tasks.map(t => ({ code: t.code, id: t.id, title: t.title, state: t.state })) },
      };
    }
    case "get_phase": {
      const found = await findProject(ctx, owner, text(input, "project", 200));
      if (input.phase === undefined || input.phase === null || input.phase === "") throw new ConvexError(`"phase" is required: a number such as "05", or a name.`);
      const phase = findPhase(await phasesOf(ctx, owner, found._id), input.phase);
      const map = await constellationFor(ctx, owner, found._id);
      const view = map?.phases.find(p => p.id === phase._id);
      if (!map || !view) throw new ConvexError("That phase isn't available.");
      return {
        project: map.project.title, num: view.num, name: view.name, state: view.state, goal: view.goal || null, nextStep: view.nextStep || null, doneWhen: view.doneWhen || null,
        tasksDone: view.done, tasksTotal: view.total, pct: view.pct, doing: view.doing, blocked: view.blocked, sessions: view.sessions, focusedMinutes: view.focusedMinutes,
        builtFrom: map.docs.filter(d => d.phaseIds.includes(String(view.id))).map(d => ({ code: d.code, title: d.title, link: d.link })),
        milestones: view.milestones.map(m => ({
          code: m.code, id: m.id, title: m.title, doneWhen: m.doneWhen || null, tasksDone: m.done, tasksTotal: m.total,
          tasks: m.tasks.map(t => ({
            code: t.code, id: t.id, title: t.title, status: t.status, lane: t.lane, minutes: t.minutes, energy: energyName[t.energy], doneWhen: t.doneWhen, nextStep: t.nextStep || null,
            sessions: t.plannedSessions ? `${t.sessions} of ${t.plannedSessions}` : t.sessions, startedAt: iso(t.startedAt), completedAt: iso(t.completedAt),
          })),
        })),
      };
    }
  }
  throw new ConvexError(`Unknown tool "${tool}".`);
}

// ---------- Proposals ----------

/** import_plan's input as one checked proposal; approval checks it again (convex/inbox.ts applyPlan). */
async function planFrom(ctx: Db, owner: string, input: Input): Promise<{ proposal: PlanProposal; projectTitle: string }> {
  const projectRef = text(input, "project", 200, false);
  const fresh = input.new_project;
  if (!!projectRef === (fresh !== undefined && fresh !== null)) throw new ConvexError(`Give either "project" (an existing project) or "new_project" { title, purpose }.`);
  let projectId: Id<"projects"> | undefined;
  let newProject: PlanProposal["newProject"];
  let existing: Doc<"phases">[] = [];
  let projectTitle: string;
  if (projectRef) {
    const project = await findProject(ctx, owner, projectRef);
    if (project.status !== "Active") throw new ConvexError(`"${project.title}" is ${project.status.toLowerCase()}. A plan can only go into an active project.`);
    projectId = project._id; projectTitle = project.title;
    existing = await phasesOf(ctx, owner, project._id);
  } else {
    if (typeof fresh !== "object" || Array.isArray(fresh)) throw new ConvexError(`"new_project" must be { title, purpose }.`);
    newProject = { title: text(fresh as Input, "title", 160), purpose: text(fresh as Input, "purpose", 2000) };
    projectTitle = newProject.title;
  }

  const phases: PlanProposal["phases"] = list(input, "phases", planLimits.phases, true).map(phase => {
    const name = text(phase, "name", 120);
    return {
      name, goal: maybe(phase, "goal", 1000), nextStep: maybe(phase, "next_step", 2000), doneWhen: maybe(phase, "done_when", 1000),
      milestones: list(phase, "milestones", planLimits.milestonesPerPhase).map(m => {
        const title = text(m, "title", 160);
        return {
          title, doneWhen: maybe(m, "done_when", 1000),
          tasks: list(m, "tasks", planLimits.tasksPerMilestone).map(t => {
            const taskTitle = text(t, "title", 160);
            const task = {
              title: taskTitle, lane: laneOf(t.lane)!, minutes: int(t, "minutes", 5, 240), energy: energyOf(t.energy), doneWhen: text(t, "done_when", 1000),
              plannedSessions: optionalInt(t, "planned_sessions", 1, 100), status: statusOf(t.status, taskTitle) as Exclude<Doc<"tasks">["status"], "Archived">,
              note: maybe(t, "note", 2000), startedAt: pastTime(t, "started_at", taskTitle), completedAt: pastTime(t, "completed_at", taskTitle),
            };
            checkPlannedStatus(task);
            return task;
          }),
        };
      }),
    };
  });
  if (!phases.length) throw new ConvexError("A plan needs at least one phase.");
  const added = phases.filter(p => !existing.some(x => x.name.toLowerCase() === p.name.toLowerCase())).length;
  if (existing.length + added > planLimits.phases) throw new ConvexError(`A project can have up to ${planLimits.phases} phases; this plan would make ${existing.length + added}.`);

  const existingDocs = projectId ? await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", projectId)).collect() : [];
  const docs: PlanProposal["docs"] = list(input, "docs", planLimits.docs).map(d => {
    const code = docCodeValue(text(d, "code", 10));
    const feeds: number[] = [];
    const feedsExisting: Id<"phases">[] = [];
    const refs = d.feeds === undefined || d.feeds === null ? [] : d.feeds;
    if (!Array.isArray(refs)) throw new ConvexError(`"feeds" of doc ${code} must be a list of phase positions or names.`);
    for (const ref of refs) {
      if (typeof ref === "number") {
        if (!Number.isInteger(ref) || ref < 0 || ref >= phases.length) throw new ConvexError(`Doc ${code} feeds phase ${ref}, but the plan's phases are 0 to ${phases.length - 1}.`);
        if (!feeds.includes(ref)) feeds.push(ref);
        continue;
      }
      const name = String(ref).trim().toLowerCase();
      const inPlan = phases.findIndex(p => p.name.toLowerCase() === name);
      if (inPlan >= 0) { if (!feeds.includes(inPlan)) feeds.push(inPlan); continue; }
      const already = matchPhase(existing, ref);
      if (!already) throw new ConvexError(`Doc ${code} feeds "${String(ref)}", which isn't a phase in this plan${projectId ? " or the project" : ""}.`);
      if (!feedsExisting.includes(already._id)) feedsExisting.push(already._id);
    }
    const link = maybe(d, "link", 2000);
    return {
      code, title: text(d, "title", 120), summary: maybe(d, "summary", 2000), sections: optionalInt(d, "sections", 0, 999), link: link ? linkValue(link) : undefined,
      feeds, ...(feedsExisting.length ? { feedsExisting } : {}), nextEdit: maybe(d, "next_edit", 1000), doneWhen: maybe(d, "done_when", 1000), written: bool(d, "written"),
    };
  });
  const newDocs = docs.filter(d => !existingDocs.some(x => x.code === d.code)).length;
  if (existingDocs.length + newDocs > planLimits.docs) throw new ConvexError(`A project can have up to ${planLimits.docs} docs.`);

  const proposal: PlanProposal = { kind: "plan", ...(projectId ? { projectId } : {}), ...(newProject ? { newProject } : {}), phases, docs };
  checkPlanShape(proposal);
  return { proposal, projectTitle };
}

async function runPropose(ctx: MutationCtx, owner: string, source: string, tool: string, input: Input) {
  const waiting = await ctx.db.query("inbox").withIndex("by_owner", q => q.eq("owner", owner)).take(inboxLimit);
  if (waiting.length >= inboxLimit) throw new ConvexError(`The Inbox already has ${inboxLimit} items waiting. Ask the user to review it on Today first.`);
  let proposal: Doc<"inbox">["proposal"];
  let summary: string;
  switch (tool) {
    case "log_session": {
      const outcome = outcomeOf(input.outcome);
      const minutes = int(input, "minutes", 1, 720);
      const contribution = text(input, "what_changed", 4000);
      const nextStep = text(input, "next_step", 2000, outcome !== "Finished");
      const evidence = text(input, "evidence_url", 2000, false);
      if (evidence) httpUrl(evidence, "evidence_url must be an HTTP or HTTPS link.");
      const skills = skillsOf(input.skills);
      const endedAt = endedAtOf(input.ended_at);
      const ref = text(input, "task", 200, false);
      const newTitle = text(input, "new_task_title", 160, false);
      if (!ref && !newTitle) throw new ConvexError(`Give "task" (an open task) or "new_task_title" with "new_task_lane" and "new_task_done_when".`);
      let taskId: Id<"tasks"> | undefined;
      let newTask: Extract<Doc<"inbox">["proposal"], { kind: "session" }>["newTask"];
      let title: string;
      if (ref) {
        const task = await findTask(ctx, owner, ref, ["In progress", "Ready"]);
        taskId = task._id; title = task.title;
      } else {
        const project = typeof input.new_task_project === "string" && input.new_task_project.trim() ? await findProject(ctx, owner, input.new_task_project) : null;
        newTask = { title: newTitle, lane: laneOf(input.new_task_lane)!, minutes: Math.min(240, Math.max(5, minutes)), energy: 2, doneWhen: text(input, "new_task_done_when", 1000), ...(project ? { projectId: project._id } : {}) };
        title = `${newTitle} (new task)`;
      }
      proposal = { kind: "session", ...(taskId ? { taskId } : {}), ...(newTask ? { newTask } : {}), minutes, outcome, contribution, nextStep, skills, evidence, endedAt };
      summary = `Session on "${title}": ${minutes} min, ${outcome}.`;
      break;
    }
    case "add_task": {
      const project = typeof input.project === "string" && input.project.trim() ? await findProject(ctx, owner, input.project) : null;
      const milestoneRef = text(input, "milestone", 200, false);
      if (milestoneRef && !project) throw new ConvexError(`A milestone needs its "project".`);
      const milestone = milestoneRef && project ? await findMilestone(ctx, project._id, milestoneRef) : null;
      proposal = { kind: "task", title: text(input, "title", 160), lane: laneOf(input.lane)!, minutes: int(input, "minutes", 5, 240), energy: energyOf(input.energy), doneWhen: text(input, "done_when", 1000), ...(project ? { projectId: project._id } : {}), ...(milestone ? { milestoneId: milestone._id } : {}) };
      summary = `Task "${proposal.title}".`;
      break;
    }
    case "capture_idea":
      proposal = { kind: "idea", title: text(input, "title", 160), lane: laneOf(input.lane)!, notes: text(input, "notes", 10000, false) };
      summary = `Idea "${proposal.title}".`;
      break;
    case "add_milestone": {
      const project = await findProject(ctx, owner, text(input, "project", 200));
      proposal = { kind: "milestone", projectId: project._id, title: text(input, "title", 160), ...(text(input, "done_when", 1000, false) ? { doneWhen: text(input, "done_when", 1000, false) } : {}) };
      summary = `Milestone "${proposal.title}" in ${project.title}.`;
      break;
    }
    case "set_next_step": {
      const task = await findTask(ctx, owner, text(input, "task", 200), ["In progress", "Ready", "Blocked"]);
      proposal = { kind: "nextStep", taskId: task._id, nextStep: text(input, "next_step", 2000) };
      summary = `New next step for "${task.title}".`;
      break;
    }
    case "add_phase": {
      const project = await findProject(ctx, owner, text(input, "project", 200));
      const phases = await phasesOf(ctx, owner, project._id);
      const name = text(input, "name", 120);
      if (phases.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new ConvexError(`"${project.title}" already has a phase called "${name}".`);
      if (phases.length >= planLimits.phases) throw new ConvexError(`A project can have up to ${planLimits.phases} phases.`);
      proposal = { kind: "phase", projectId: project._id, name, goal: maybe(input, "goal", 1000), nextStep: maybe(input, "next_step", 2000), doneWhen: maybe(input, "done_when", 1000) };
      summary = `Phase ${String(phases.length).padStart(2, "0")} "${name}" in ${project.title}.`;
      break;
    }
    case "add_doc": {
      const project = await findProject(ctx, owner, text(input, "project", 200));
      const code = docCodeValue(text(input, "code", 10));
      const docs = await ctx.db.query("projectDocs").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
      if (docs.some(d => d.code === code)) throw new ConvexError(`"${project.title}" already has a doc coded ${code}. Use update_doc.`);
      if (docs.length >= planLimits.docs) throw new ConvexError(`A project can have up to ${planLimits.docs} docs.`);
      const link = maybe(input, "link", 2000);
      proposal = {
        kind: "doc", projectId: project._id, code, title: text(input, "title", 120), summary: maybe(input, "summary", 2000), sections: optionalInt(input, "sections", 0, 999),
        link: link ? linkValue(link) : undefined, phaseIds: feedsOf(input, await phasesOf(ctx, owner, project._id)) ?? [],
        nextEdit: maybe(input, "next_edit", 1000), doneWhen: maybe(input, "done_when", 1000), written: bool(input, "written"),
      };
      summary = `Doc ${code} "${proposal.title}" in ${project.title}.`;
      break;
    }
    case "update_doc": {
      const project = await findProject(ctx, owner, text(input, "project", 200));
      const { doc, docs } = await findDoc(ctx, owner, project._id, text(input, "code", 10));
      const newCode = maybe(input, "new_code", 10);
      const code = newCode ? docCodeValue(newCode) : undefined;
      if (code && code !== doc.code && docs.some(d => d.code === code)) throw new ConvexError(`"${project.title}" already has a doc coded ${code}.`);
      const link = maybe(input, "link", 2000, true);
      const title = maybe(input, "title", 120);
      proposal = {
        kind: "docUpdate", docId: doc._id, code, title, summary: maybe(input, "summary", 2000, true), sections: optionalInt(input, "sections", 0, 999),
        link: link ? linkValue(link) : link, phaseIds: feedsOf(input, await phasesOf(ctx, owner, project._id)),
        nextEdit: maybe(input, "next_edit", 1000, true), doneWhen: maybe(input, "done_when", 1000, true), written: bool(input, "written"),
      };
      if (Object.entries(proposal).every(([key, value]) => key === "kind" || key === "docId" || value === undefined)) throw new ConvexError("Give at least one field to change.");
      summary = `Update to doc ${doc.code} in ${project.title}.`;
      break;
    }
    case "add_research": {
      const idea = await ideaFrom(ctx, owner, input);
      const sources = list(input, "sources", 50, true).map(item => {
        const kind = String(item.kind ?? "").trim().toLowerCase();
        if (kind !== "read" && kind !== "interview" && kind !== "tried" && kind !== "brief") throw new ConvexError(`A source's kind is read, interview, tried or brief ("brief" for a summary you wrote).`);
        const url = text(item, "url", 2000, false);
        return { title: text(item, "title", 200), kind, ...(url ? { url: httpUrl(url, "A source's url must be an HTTP or HTTPS link.") } : {}) } as const;
      });
      proposal = { kind: "research", ideaId: idea._id, title: text(input, "title", 120), summary: maybe(input, "summary", 2000), sources };
      summary = `Research thread "${proposal.title}" for ${idea.title}, ${sources.length} source${sources.length === 1 ? "" : "s"}.`;
      break;
    }
    case "write_report": {
      const idea = await ideaFrom(ctx, owner, input);
      const findings = list(input, "findings", 20, true).map(item => ({ text: text(item, "text", 600), ...(text(item, "basis", 200, false) ? { basis: text(item, "basis", 200, false) } : {}) }));
      proposal = { kind: "report", ideaId: idea._id, title: text(input, "title", 160), summary: maybe(input, "summary", 4000), findings };
      summary = `Report "${proposal.title}" for ${idea.title}.`;
      break;
    }
    case "record_decision": {
      const idea = await ideaFrom(ctx, owner, input);
      proposal = { kind: "decision", ideaId: idea._id, verdict: text(input, "verdict", 200), rule: maybe(input, "rule", 600), kept: strings(input, "kept", 12, 200), dropped: strings(input, "dropped", 12, 200) };
      summary = `Decision "${proposal.verdict}" for ${idea.title}.`;
      break;
    }
    case "import_plan": {
      const plan = await planFrom(ctx, owner, input);
      proposal = plan.proposal;
      summary = `Plan for ${plan.projectTitle}: ${planCounts(plan.proposal).text}.`;
      break;
    }
    default: throw new ConvexError(`Unknown tool "${tool}".`);
  }
  await ctx.db.insert("inbox", { owner, source, proposal });
  return { status: "waiting for approval", summary, note: "Sent to the Becoming Inbox. It counts once the user approves it on Today." };
}

// ---------- Internal functions the HTTP endpoint calls ----------

export const ownerOfToken = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("apiTokens").withIndex("by_hash", q => q.eq("hash", args.hash)).unique();
    return row ? { owner: row.owner, tokenId: row._id, name: row.name, lastUsedAt: row.lastUsedAt ?? 0 } : null;
  },
});

export const touchToken = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => { if (await ctx.db.get(args.tokenId)) await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() }); },
});

export const readTool = internalQuery({
  args: { owner: v.string(), tool: v.string(), input: v.any() },
  handler: (ctx, args) => runRead(ctx, args.owner, args.tool, (args.input ?? {}) as Input),
});

export const proposeTool = internalMutation({
  args: { owner: v.string(), source: v.string(), tool: v.string(), input: v.any() },
  handler: (ctx, args) => runPropose(ctx, args.owner, args.source, args.tool, (args.input ?? {}) as Input),
});

// ---------- The endpoint ----------

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors, ...headers } });
const failure = (id: Message["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const reason = (error: unknown) => (error instanceof ConvexError ? String(error.data) : "Something went wrong in Becoming. Please try again.");

export const preflight = httpAction(async () => new Response(null, { status: 204, headers: cors }));
export const notAllowed = httpAction(async () => new Response("Becoming's MCP endpoint answers POST only.", { status: 405, headers: { Allow: "POST, OPTIONS", ...cors } }));

export const endpoint = httpAction(async (ctx, request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const who = token ? await ctx.runQuery(internal.mcp.ownerOfToken, { hash: await hashToken(token) }) : null;
  if (!who) return json(failure(null, -32001, "Missing or unknown Becoming access token. Create one in Becoming → Settings → Assistants."), 401, { "WWW-Authenticate": 'Bearer realm="Becoming"' });
  if (Date.now() - who.lastUsedAt > 3_600_000) await ctx.runMutation(internal.mcp.touchToken, { tokenId: who.tokenId });

  let body: unknown;
  try { body = await request.json(); } catch { return json(failure(null, -32700, "The request body isn't valid JSON."), 400); }

  async function handle(message: Message) {
    if (!message || typeof message !== "object" || typeof message.method !== "string") return failure(message?.id, -32600, "Not a JSON-RPC request.");
    const isNotification = message.id === undefined || message.id === null;
    const params = message.params ?? {};
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: message.id, result });
    try {
      switch (message.method) {
        case "initialize": {
          const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : supportedVersions[0];
          return reply({
            protocolVersion: supportedVersions.includes(asked) ? asked : supportedVersions[0],
            capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
            serverInfo: { name: "becoming", title: "Becoming", version: "1.0.0" },
            instructions,
          });
        }
        case "ping": return isNotification ? null : reply({});
        case "tools/list": return reply({ tools });
        case "prompts/list": return reply({ prompts: prompts.map(({ name, title, description }) => ({ name, title, description })) });
        case "prompts/get": {
          const prompt = prompts.find(item => item.name === params.name);
          if (!prompt) return failure(message.id, -32602, `Unknown prompt "${String(params.name)}".`);
          return reply({ description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.text } }] });
        }
        case "resources/list": return reply({ resources: [] });
        case "resources/templates/list": return reply({ resourceTemplates: [] });
        case "tools/call": {
          const name = String(params.name ?? "");
          if (!tools.some(tool => tool.name === name)) return failure(message.id, -32602, `Unknown tool "${name}".`);
          const input = (params.arguments ?? {}) as Input;
          try {
            const result = readTools.has(name)
              ? await ctx.runQuery(internal.mcp.readTool, { owner: who!.owner, tool: name, input })
              : await ctx.runMutation(internal.mcp.proposeTool, { owner: who!.owner, source: who!.name, tool: name, input });
            return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: Array.isArray(result) ? { items: result } : result });
          } catch (error) {
            // A refused tool call is a result the assistant can read and correct, not a protocol error.
            return reply({ content: [{ type: "text", text: reason(error) }], isError: true });
          }
        }
        default:
          return isNotification ? null : failure(message.id, -32601, `Becoming doesn't support "${message.method}".`);
      }
    } catch (error) {
      return failure(message.id, -32603, reason(error));
    }
  }

  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map(item => handle(item as Message)))).filter(Boolean);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: cors });
  }
  const message = body as Message;
  if (message?.id === undefined || message?.id === null) {
    await handle(message);
    return new Response(null, { status: 202, headers: cors });
  }
  return json(await handle(message));
});
