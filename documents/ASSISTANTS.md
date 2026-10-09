# Assistants (MCP) and the Inbox

Becoming is an **MCP server**, so an AI assistant can read your work and propose updates while you work elsewhere. Built 9 October 2026.

- **Reads answer directly:** tonight's focus, projects, tasks, this week, recent sessions, and a project's constellation.
- **Every change is a proposal.** It waits in the **Inbox on Today** until you approve it. Approving runs exactly the same rules as the app, so an assistant can never write anything you couldn't. Nothing counts toward your Journey, bloom or week before you approve.

## Connect Claude Code (works now)

1. Settings → **Assistants** → pick "Claude Code" → **Create a token**. Copy it right away; it's shown once.
2. Run the command Settings shows, once:
   `claude mcp add --transport http becoming https://<deployment>.convex.site/mcp --header "Authorization: Bearer <token>"`
3. Ask Claude things like "what should I work on tonight? I have 45 minutes, steady energy", "log this to Becoming", or use the prompts `/mcp__becoming__log_this_conversation`, `evening_check_in`, `weekly_review` and `sync_project_from_docs` (read this repo's plan and docs, and propose them as the project's constellation).
4. Approve or discard what it sends in the Inbox on Today.

Other MCP clients (Cursor, VS Code) use the same URL and header.

The **Claude app** (web, desktop, phone) and **ChatGPT** need "Sign in with Becoming" (OAuth), because they connect from their own servers to a public sign-in. That comes after deployment: see "Next" below.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `whats_next` | read | Tonight's focus for minutes and energy (and optionally a lane or project), with why, plus alternatives. Today's recommender (`tasks.todayFor`). |
| `list_projects`, `get_project` | read | Active projects with progress, the current milestone and next step; one project's milestones and tasks. |
| `list_tasks` | read | Open, blocked or done tasks, by lane or project. |
| `get_week`, `recent_sessions` | read | This week's target, sessions, pause, intention and lined-up steps; the latest sessions. |
| `list_inbox` | read | What's already waiting, so nothing is sent twice. |
| `log_session` | proposal | Work done away from the timer, on an open task or on a new one created at approval. |
| `add_task`, `capture_idea`, `add_milestone`, `set_next_step` | proposal | As named. |
| `get_constellation` | read | One project's whole map: genesis (idea, research, report, decision), docs with the phases each feeds, phases with milestones and task codes and states, and totals. |
| `get_phase` | read | One phase by number (`"05"`) or name: goal, next step, progress, the docs it's built from, and each milestone's tasks with status, estimate, next step and sessions ("2 of 5"). |
| `add_phase` | proposal | A new last phase (name, goal, next step, done-when). A name the project already has is refused. |
| `add_doc`, `update_doc` | proposal | A doc's details and link (a repo path such as `documents/PRD.md`, or an https address); the writing stays in the repo. `update_doc` finds the doc by code and changes only the fields given; `""` clears a text field and `feeds` replaces the phases it feeds (by number or name). |
| `add_research` | proposal | A research thread behind an idea, with its sources (read, interview, tried, or **brief** for a summary the assistant wrote). Sources record the assistant as their author. A thread with the same title gets the new sources added. |
| `write_report`, `record_decision` | proposal | The idea's report (findings, each with its basis), which replaces the earlier one, and the decision (verdict, rule, kept, dropped). |
| `import_plan` | proposal | A whole plan as **one** Inbox item. See below. |

Tasks and projects can be named by id or by a distinctive part of the title. Several matches return a list to choose from. Genesis tools take `idea` (id or title) or `project` (the idea it grew from is used).

## import_plan: a whole plan, approved once

```
{ project: "Becoming"            // an existing active project (id or title)
  // or new_project: { title, purpose }
  phases: [{ name, goal?, next_step?, done_when?,
             milestones: [{ title, done_when?,
                            tasks: [{ title, lane, minutes, energy, done_when, planned_sessions?,
                                      status?, note?, started_at?, completed_at? }] }] }],
  docs?: [{ code, title, summary?, sections?, link?, feeds: [0, "Reliability"], next_edit?, done_when?, written? }] }
```

- **Checked when it's sent**, so the assistant can fix it: lengths and lanes, minutes 5–240, the doc rules, no repeated phase names, milestone titles or doc codes, and the limits: 40 phases, 26 milestones per phase and 120 in all, 40 tasks per milestone and 200 in all, 40 docs. A project can't go over 40 phases or docs in total.
- **The Inbox shows it as one item**, such as "Plan for Becoming: 8 phases, 22 milestones, 76 tasks, 6 docs", with each phase's milestone and task counts, how many are already done, and whether the phase already exists.
- **Approving applies it in one transaction**, so either all of it is added or none of it:
  1. The project, if it's new.
  2. Phases in order.
  3. Milestones in their phases.
  4. Tasks in their milestones, through `createTaskFor` with the assistant as source.
  5. Docs, with `feeds` mapped to the phases' ids.
- **It only adds what's missing**, so the same plan can be sent again after the docs change:
  - phases are reused by name (case-insensitive), milestones by title within their phase, and tasks by title within their milestone;
  - a doc with the same code is updated, and its feeds are joined with the new ones.
- **`feeds`**: a number is a position in this plan's `phases` (from 0); text is a phase name, in the plan or already in the project.
- **Work that already happened shows honestly.** A task can carry `status` (ready by default, in progress, blocked or done), a `note`, `started_at` and `completed_at`:
  - The dates are ISO dates, not in the future, and finished can't come before started.
  - **Blocked** needs a note: what's blocking it, which becomes its next step.
  - **Done** takes an optional note: what changed.
  - `completed_at` is only for done, and a ready task takes no dates.
- **On approval, the task's history gets the real dates.** The task gets `startedAt` and `completedAt`, and the matching `taskEvents` ("started", "done", "blocked") are written at those times with the assistant as source:
  - "blocked" is dated at approval;
  - a done task without `started_at` counts as started when it finished;
  - a milestone the plan completes is dated by its last finished task.
- **Limits:** tasks that already exist aren't changed by a plan (use `set_next_step` or the app), and docs can't carry their original written date yet (they're dated at approval).

## How it works

- `convex/mcp.ts` is the endpoint: Streamable HTTP at `/mcp` on the deployment's `.convex.site` address, answered with plain JSON (protocol versions 2025-03-26 to 2025-11-25). No SDK or new package.
- **Tokens** (`convex/assistants.ts`, table `apiTokens`):
  - `bcm_` plus 32 random bytes, made in an action so the randomness is real.
  - Only a SHA-256 hash is stored, with the first 12 characters for display.
  - At most 10 per account. Revoking deletes the row, and the token stops working at once.
- **The owner comes only from the token.** Every read and proposal runs as an internal function with that owner. Reads reuse the app's own code (`todayFor`, `projectsFor`, `projectFor`).
- **Proposals** are checked early, so the assistant gets a clear error to fix, and checked again at approval.
  - The early checks cover lengths, the 8 skills, outcomes, a safe link, and whether the task is open.
  - Approval goes through `createTaskFor`, `createIdeaFor`, `addMilestoneFor` and `saveLoggedSession`. The last one follows the recap's rules: an open task, prerequisites done, a next step unless finished. It updates the task, the milestone, the pin and Proof the same way the recap does.
  - Constellation proposals go through `addPhaseFor`, `setMilestonePhaseFor`, `addDocFor` and `updateDocFor` (convex/constellation.ts), and `addResearchFor`, `addSourceFor`, `saveReportFor` and `setDecisionFor` (convex/genesis.ts). A plan is applied by `applyPlan` in convex/inbox.ts.
  - Each one records the assistant (the token's name) as its source: on tasks' events, docs, research sources and reports.
- **The Inbox** (`convex/inbox.ts`, table `inbox`) holds at most 100 proposals. An approved session records `source` (the token's name), and Journey shows it as "via Claude Code".
- **Your data:** export and restore keep `source`; "Delete workspace data" also removes tokens and the Inbox.

## Next

1. **Sign in with Becoming (OAuth)** for the Claude app and ChatGPT, after the app is deployed. Better Auth's `mcp` plugin provides the endpoints. The Convex auth plugin already runs the same OIDC provider underneath, so it needs a careful spike, then root `/.well-known` routes on both the app and the Convex site.
2. **A Claude Code plugin:** the MCP server, a skill, and an end-of-session hook that proposes a session automatically.
3. **GitHub webhook and short task IDs.**
