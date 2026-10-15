# Assistants (MCP) and the Inbox

Becoming is an **MCP server**, so an AI assistant can read your work and record it while you work elsewhere. Built 9 October 2026; since 15 October (PLAN-one-tap-and-daily-loop, Phase 2) everyday work applies at once.

- **Reads answer directly:** tonight's focus, projects, tasks, one task in full, this week, recent sessions, recent activity, and a project's constellation.
- **Changes apply at once or wait in the Inbox on Today, by the token's trust** (below). Either way they run exactly the same rules as the app, so an assistant can never write anything you couldn't. Every result says which happened: status `"applied"` or `"waiting for approval"`.
- **Anything applied can be undone.** A task's latest move, yours or an assistant's, has an Undo on its history in the task sheet.

## Trust: what applies at once

Each token has a trust level, chosen in Settings → Assistants under the token. New tokens start at **Record my work**.

| Trust | Applies at once | Waits in the Inbox |
|---|---|---|
| **Ask first** (`ask`) | nothing | everything |
| **Record my work** (`work`, the default) | `start_task`, `complete_task`, `block_task`, `update_task`, `set_next_step`, `log_session`, `add_task`, `capture_idea` | plan changes: `add_milestone`, `add_phase`, `add_doc`, `update_doc`, `add_research`, `write_report`, `record_decision`, `import_plan` |
| **Everything** (`all`) | everything | nothing |

A token made before 15 October has no trust stored and counts as **Record my work**. Change it in Settings if you want it to ask first.

## Connect Claude Code (works now)

**The easy way** (15 October): the **Connect Claude Code** badge on Today, the "Your assistant" step in onboarding, or Settings → Assistants → **Set up step by step**. All three open the same sheet (`src/components/assistants/connect-sheet.tsx`), in three steps:

1. **What it does**, with the motion graphic: Claude Code types `/becoming:next`, a spark crosses to a task that turns In progress; then `/becoming:done`, and it turns Done, with "via Claude Code", a skill and the PR.
2. **Run one command.** "Connect Claude Code" makes a token (named Claude Code, trust Record my work) and shows the command with a Copy button. The sheet then waits, live: the moment Claude Code first reaches Becoming (the token's `lastUsedAt` is set), it moves on by itself.
3. **Connected**, with a small celebration. Then: what it can do (the three trust levels), and the plugin's two install commands.

Today's badge invites you until an assistant has connected (it can be hidden on that device with ×). After that it says "Claude Code · connected · active today" and leads to Settings → Assistants.

**By hand:**

1. Settings → **Assistants** → pick "Claude Code" → **Create a token**. Copy it right away; it's shown once.
2. Run the command Settings shows, once. `--scope user` makes Becoming available in every project, not just the folder you run it in:
   `claude mcp add --transport http --scope user becoming https://<deployment>.convex.site/mcp --header "Authorization: Bearer <token>"`
3. Ask Claude things like "what should I work on tonight? I have 45 minutes, steady energy", "log this to Becoming", or use the prompts `/mcp__becoming__work_on_task` (optionally with a task), `log_this_conversation`, `evening_check_in`, `weekly_review` and `sync_project_from_docs` (read this repo's plan and docs, and propose them as the project's constellation).
4. Everyday work shows up straight away. Approve or discard what waits in the Inbox on Today; **Approve all** takes them oldest first and stops at the first one refused.
5. Optional: install the Claude Code plugin (below) for `/becoming:next`, `/becoming:done`, `/becoming:log` and the session-start summary.

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
| `get_task` | read | One task in full: status, lane, estimate, done-when, next step, notes, skills, its code, project, milestone and phase (with its goal), the docs it's built from (with links), prerequisites and its last 8 history entries. |
| `get_activity` | read | The Journey feed: recent moves, sessions and markers (`limit`, and `before` to page back), each with who made it. |
| `start_task` | work | Mark a task In progress (also unblocks or reopens it), with an optional `next_step`. |
| `complete_task` | work | Mark a task Done once its done-when is met, with `summary`, `skills` and `evidence_url`. Without `minutes`, the summary and link go on the task's history. With real `minutes`, it's also logged as a finished session and the link becomes a Proof draft (a summary is then required, and a blocked task is refused). |
| `block_task` | work | Mark a task Blocked with a `reason`, which becomes its next step. |
| `update_task` | work | Change a task's `title`, `next_step`, `done_when`, `minutes` or `notes`; only the fields given change. |
| `log_session` | work | Work done away from the timer, on an open task or on a new one created with it. |
| `add_task`, `capture_idea`, `set_next_step` | work | As named. |
| `add_milestone` | plan | A new last milestone. |
| `get_constellation` | read | One project's whole map: genesis (idea, research, report, decision), docs with the phases each feeds, phases with milestones and task codes and states, and totals. |
| `get_phase` | read | One phase by number (`"05"`) or name: goal, next step, progress, the docs it's built from, and each milestone's tasks with status, estimate, next step and sessions ("2 of 5"). |
| `add_phase` | plan | A new last phase (name, goal, next step, done-when, and optional `skills`, the bloom's eight). A name the project already has is refused. |
| `add_doc`, `update_doc` | plan | A doc's details and link (a repo path such as `documents/PRD.md`, or an https address); the writing stays in the repo. `update_doc` finds the doc by code and changes only the fields given; `""` clears a text field and `feeds` replaces the phases it feeds (by number or name). |
| `add_research` | plan | A research thread behind an idea, with its sources (read, interview, tried, or **brief** for a summary the assistant wrote). Sources record the assistant as their author. A thread with the same title gets the new sources added. |
| `write_report`, `record_decision` | plan | The idea's report (findings, each with its basis), which replaces the earlier one, and the decision (verdict, rule, kept, dropped). |
| `import_plan` | plan | A whole plan as **one** change (one Inbox item, approved once). See below. |

"work" applies at once at the default trust; "plan" waits in the Inbox unless the token is trusted with everything.

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
- **Skills** (12 October): phases, milestones and tasks can carry `skills` (Frontend, Interaction, Motion, Visual, Writing, Research, Systems, Shipping). A finished task without its own counts for its milestone's, or else its phase's, in the Mind Bloom. Re-sending a plan adds skills to phases and milestones that have none (it never replaces ones they have), so an assistant can fill in skills for work already imported.
- **Limits:** tasks that already exist aren't changed by a plan (use `set_next_step` or the app), and docs can't carry their original written date yet (they're dated at approval).

## Work on this with Claude

The task sheet (at its foot) and the status menu have **Work on this with Claude**. It copies a ready prompt: the task's title and id, its done-when and next step, and how to record the work (`get_task`, then `start_task`, `block_task` if something's in the way, and `complete_task` with a summary, skills and the PR or commit link). The sheet also shows the prompt, so it can be copied by hand when the browser refuses, with the plugin's `/becoming:next <id>` as the short way.

The MCP prompt `work_on_task` does the same from inside Claude Code: with a `task`, it loads that task; without one, it lists the open tasks and asks which.

## The Claude Code plugin

In this repo: `integrations/claude-code/` (the plugin) and `.claude-plugin/marketplace.json` (a marketplace named `becoming` that lists it). The repo is public on GitHub, so anyone can install it from there.

**It needs** the Becoming MCP server connected in Claude Code (step 2 above). It doesn't bring its own server, because the token belongs in your Claude Code config, not in a repo.

**Install, once:**

```
claude plugin marketplace add VimalKManoj/becoming
claude plugin install becoming@becoming
```

From your own checkout instead: `claude plugin marketplace add "D:\Dev\Full Stack Dev\form"`. Then restart Claude Code (or run `/reload-plugins`). `claude plugin validate integrations/claude-code` checks it.

**Which server:** the commands use the tools of a server named `becoming` or `becoming-prod`. When both are connected, set `BECOMING_SERVER` (for example `"env": { "BECOMING_SERVER": "becoming-prod" }` in `~/.claude/settings.json`), and the session-start summary tells Claude which one to use.

| Part | What it does |
|---|---|
| `/becoming:next [task]` | Finds the task you name, or lists the open ones and `whats_next` and asks; then `start_task` and `get_task`, reads the linked docs, and says the task, what done looks like, where to pick up and its plan. |
| `/becoming:done [notes or 45m]` | Checks the done-when, writes a summary of the session's changes, picks the skills, finds the PR (`gh pr view`) or the latest commit's link, and calls `complete_task`. Minutes only if you give them. |
| `/becoming:log <45m> [what changed]` | Logs an unfinished stretch with `log_session` (outcome progress or blocked, with the next step). Asks for the minutes if you don't give them. |
| SessionStart hook | `hooks/session-start.mjs` calls `list_tasks` and adds the tasks In progress (id, project, next step, done-when) to the session's context, so Claude can match the work to them. It reads the server's address and token from `BECOMING_MCP_URL` and `BECOMING_MCP_TOKEN`, or from the server named `BECOMING_SERVER` (default `becoming`) in the project's `.mcp.json` or `~/.claude.json`. It only reads and never blocks a session (it always exits 0). It says so in one line when Becoming can't be reached, and stays quiet when no server is set up. |

Only you run the commands (`disable-model-invocation`), and each is allowed just the Becoming tools it needs (plus read-only `git` and `gh pr view` for the evidence link).

## How it works

- `convex/mcp.ts` is the endpoint: Streamable HTTP at `/mcp` on the deployment's `.convex.site` address, answered with plain JSON (protocol versions 2025-03-26 to 2025-11-25). No SDK or new package.
- **Tokens** (`convex/assistants.ts`, table `apiTokens`):
  - `bcm_` plus 32 random bytes, made in an action so the randomness is real.
  - Only a SHA-256 hash is stored, with the first 12 characters for display.
  - At most 10 per account. Revoking deletes the row, and the token stops working at once.
- **The owner comes only from the token.** Every read and proposal runs as an internal function with that owner. Reads reuse the app's own code (`todayFor`, `projectsFor`, `projectFor`).
- **Trust** is `apiTokens.trust` (`ask`, `work` or `all`; none counts as `work`). `runPropose` builds the proposal, then either applies it at once through `applyProposal` (convex/inbox.ts, the same function the Inbox's Approve uses) or puts it in the Inbox. Task moves go through `setStatusFor`, so an assistant's move records a `before` snapshot and `tasks.undo` can undo it like your own.
- **Proposals** are checked early, so the assistant gets a clear error to fix, and checked again when they're applied.
  - The early checks cover lengths, the 8 skills, outcomes, a safe link, and whether the task is open.
  - Approval goes through `createTaskFor`, `createIdeaFor`, `addMilestoneFor` and `saveLoggedSession`. The last one follows the recap's rules: an open task, prerequisites done, a next step unless finished. It updates the task, the milestone, the pin and Proof the same way the recap does.
  - Constellation proposals go through `addPhaseFor`, `setMilestonePhaseFor`, `addDocFor` and `updateDocFor` (convex/constellation.ts), and `addResearchFor`, `addSourceFor`, `saveReportFor` and `setDecisionFor` (convex/genesis.ts). A plan is applied by `applyPlan` in convex/inbox.ts.
  - Each one records the assistant (the token's name) as its source: on tasks' events, docs, research sources and reports.
- **The Inbox** (`convex/inbox.ts`, table `inbox`) holds at most 100 proposals. Two kinds were added for task work at "Ask first": `move` (start, finish or block) and `taskEdit`. An approved session records `source` (the token's name), and Journey shows it as "via Claude Code".
- **Your data:** export and restore keep `source`; "Delete workspace data" also removes tokens and the Inbox.

## Next

1. **Sign in with Becoming (OAuth)** for the Claude app and ChatGPT, after the app is deployed. Better Auth's `mcp` plugin provides the endpoints. The Convex auth plugin already runs the same OIDC provider underneath, so it needs a careful spike, then root `/.well-known` routes on both the app and the Convex site.
2. **An end-of-session hook** that offers `/becoming:done` or `/becoming:log` when a session ends with work on a task still open.
3. **GitHub webhook and short task IDs.**
