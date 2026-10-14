# Plan: tasks you move freely, focus as its own tool

Proposed 9 October 2026.

**Decided (9 October):**
- the week counts **active days** (option A);
- finishing offers an **optional "what changed"** note;
- focus runs as a **floating chip** by default;
- assistant status changes **apply at once with an Undo**.

**14 October:** Phases 3–5 below (focus decoupled, In progress on Today, assistant status tools) are replaced by [PLAN-one-tap-and-daily-loop.md](PLAN-one-tap-and-daily-loop.md), which carries over the decisions above. Phase 6 (project insights) stays here.

**Phase 1 is built; Phase 2 (rethought, below) is built 12 October:** `tasks.setStatus`, the `taskEvents` history, Start / Done / Blocked anywhere in Work and on Today's focus card, and skills on finished tasks in the bloom. Phases 2–6 are next.

## Why

Today a task only moves forward through a focus session. Start shows the full-screen timer, and the task changes status only through the recap form. That suits a sit-down evening, but not real work:
- you start something in the afternoon;
- you finish it in Claude Code;
- you mark it blocked from your phone.

The goal is a **linear, issue-tracker style** model.
- **Tasks have a status you change any time, from anywhere:** Work, Today, the task sheet, or an assistant through MCP. No timer, no form.
- **Focus is a separate tool.** You can start a timer whenever you like, with or without a task. It never appears unless you ask for it.
- **The record still grows by itself.** Every status change, logged stretch of work and focus session lands in a history per task and project, so Journey, milestones and the bloom stay complete.

## The new model

### 1. Task status workflow (anytime)

```
Ready ──start──▶ In progress ──done──▶ Done
  ▲                 │   ▲
  │              block  unblock
  │                 ▼   │
  └───reopen──── Blocked
Any status ──archive──▶ Archived ──restore──▶ previous status
```

- **One mutation** `tasks.setStatus({ taskId, status, note? })` replaces the recap as the way tasks move.
  - **Start** sets `startedAt` (first time only). Starting a task with unfinished prerequisites asks "start anyway?" rather than refusing.
  - **Done** sets `completedAt`, clears the pin and completes the milestone when it's the last open task (as today).
  - **Block** asks for what's blocking it (one line). That becomes the next step, as the recap does today.
  - **Reopen** and **unblock** need a next step, as they do now.
- **Where you can do it:**
  - a status menu on every task row in Work (one click, like Linear);
  - buttons in the task sheet;
  - "Start" and "Done" on Today's focus card, without the timer;
  - keyboard shortcuts in Work later (S start, D done, B block).
- **Optional "what changed" when finishing.** A small inline field after Done, never a full-screen form. **(decide: optional prompt, or nothing?)**
- **Skills move onto tasks.** A task can carry its skills when it's created or edited. On Done, they count toward the bloom once, even with no session. Focus recaps can still add skills.

### 2. Task activity history (new table)

`taskEvents`: owner, taskId, projectId, kind, at, source (`app`, `Claude Code`…), and an optional note or next step.
- **kind** is one of: created, started, blocked, unblocked, done, reopened, archived, restored, edited, logged, focused.
- **Every mutation writes one event.** That gives:
  - a timeline on the task sheet ("Started 3 Oct · Blocked 5 Oct: waiting on API key · Done 8 Oct");
  - project progress over time: tasks done per week, and how long tasks sit in progress;
  - a Journey activity feed, which assistants can read through MCP.

Existing sessions become "focused" events in the feed. No data is lost.

### 3. Focus, separate and optional

- **A Focus button you can reach from anywhere:** the rail, the phone pill, and Today. Choose a task or "just focus", and a duration.
- **Not full-screen by default.** Focus runs as a **floating timer chip** while you keep using the app. Tap it to expand the current orb screen (quotes, lo-fi), and collapse it again. **(decide: chip by default, or full screen?)**
- **Ending:** **Stop** saves the time with nothing else asked. **Stop and note** opens a short version of today's recap: outcome, what changed, skills, link.
  - The task's status changes **only if you choose to** ("mark it done", "blocked").
- **Schema:** `activeSessions.taskId` and `sessions.taskId` become optional ("just focus" isn't tied to a task), and sessions get a `kind` field (`focus` or `log`).
- **Manual "Log work"** on a task: "I spent 40 minutes on this yesterday". Assistants already do this through `log_session`.

### 4. What counts toward your week and streak **(decide)**

Today a week counts **sessions**. Two honest options:
- **A. Active days:** a day counts when you did any real work: a task started, finished or logged, or a focus session. It suits the linear model, and "3 evenings a week" stays meaningful.
- **B. Sessions only, as now.** Moving tasks without focusing wouldn't count, which defeats the change.

Recommended: **A**, with the week line saying what counted ("Tue: finished 'Wire the endpoint'").

### 5. Today becomes "my work tonight"

The ritual stays: greeting, "What's on your mind", the check-in and the suggestion. Around it:
- **In progress:** your started tasks, each with **Done**, **Block** and **Focus on this**.
- **Tonight's suggestion:** **Start** (status only), **Focus** (timer), or **Done already?**
- **The Inbox** stays above the rest.

### 6. Assistants (MCP)

New proposal tools:
- `start_task`, `complete_task` and `block_task` (with a reason);
- `update_task` (title, estimate, done-when, skills);
- `log_work` (replaces `log_session`, with an optional task).

New reads:
- `get_activity` (project or task timeline, last N days);
- `project_progress` (done and remaining per milestone, recent pace).

Approval: still the Inbox **(decide)**:
- **a.** Everything waits for approval, as now.
- **b.** Status changes apply at once with an Undo in the Inbox history, while new tasks and logged time still wait.
- Recommended: **b**, so Claude Code can say "marked done" while you stay in control.

## Phases

| Phase | What | Size |
|---|---|---|
| 1 | `tasks.setStatus` with events; status menu in Work and the task sheet; Start / Done on Today without the timer; skills on tasks | Medium |
| 2 | `taskEvents` timeline on the task sheet; Journey activity feed; week counting option A; migrating existing sessions into the feed. **Rethought 12 October, see "Phase 2, rethought" below:** Journey tracks work, not focus | Medium–large |
| 3 | Focus decoupled: optional task, floating chip, quick stop or stop-and-note, "Log work" | Medium–large |
| 4 | Today's "In progress" section and the new card actions | Small–medium |
| 5 | MCP: status tools, `get_activity`, `project_progress`, auto-apply with undo (if chosen) | Medium |
| 6 | Project insights: tasks done per week, time in progress, milestone burn-up | Later |

**10 October, part of Phase 3 done early (at the owner's request):** focus starts only when asked for. Build, Small piece, Write, a new project, Pick up here and Or choose from every Projects task all open Work, where you choose the task; the project page shows **Up next** (three open tasks, each with Start and no timer) instead of Plan it for tonight. The way into the check-in and timer is the **Focus session** tile on Today or a task's **Start a focus session**. Still ahead in Phase 3: an optional task, the floating chip and quick stop.

Each phase keeps the app working and is testable alone. **Migration:** existing tasks keep their status; existing sessions stay sessions and appear as "focused" events. Nothing is deleted.

## Phase 2, rethought: Journey tracks work, not focus (decided 12 October)

**Why:** Journey counted only focus sessions. 50 finished tasks (moved by hand, by Claude Code, or backfilled from PLAN.md) showed nowhere, and the bloom stayed empty because they carried no skills. Focus is a tool you may use; it isn't what makes progress count.

**Decisions (owner, 12 October, on the recommendations):**
1. **The unit of progress is something moving forward**: a task finished, started or logged, a milestone or phase completed, wherever it happened (the app, an assistant through MCP, a backfilled plan). A focus session is one optional kind of entry that adds time.
2. **Journey is a feed of what you did**, newest first and grouped by day: finished, started, blocked and logged tasks, focus sessions with their minutes, milestones and phases completed. Every entry names its source (you, the assistant, or "backfilled from your plan": recorded more than a day after it happened).
3. **Week, streak and graph count days with progress** (option A from 9 October): a day counts when anything moved forward. The contribution graph weighs a finish above a start; days made only of backfilled work show lighter. **Weeks, the streak and the graph start from the week of your first activity** (backfilled work included), and the bloom's months from that month. Weeks before you first set a target are judged by that first target. The graph shows only the weeks since then, with bigger squares when there are few (owner, 12 October, replacing "from the week you joined", which itself revised "backfilled work counts toward past weeks").
4. **The bloom grows from finished work.** A finished task's skills are its own, or else its milestone's, or else its phase's. Phases and milestones get skills (8 fixed ones), tagged in the app or by an assistant (`import_plan` and `add_phase` carry skills; re-sending a plan adds skills to phases and milestones that have none). Journey shows a tidy-up card while finished tasks have no skills, to tag them phase by phase. No guessing from the lane.
5. **Time is enrichment, never the gate.** Sessions keep their minutes, recaps and the estimate and choice insights. A reminder isn't sent once anything moved forward that day, and Today's "Tonight is done" follows the last thing you finished today, from a session or not.
6. **Later (6):** evidence links on finished tasks (an assistant can attach a commit or PR) becoming Proof drafts, and the weekly review opening with what you finished.

**Built 12 October** (checks: 176 tests, typecheck, lint, build; Journey checked with example data through a stand-in client). **Build:** schema (`skills` on phases and milestones); `journey.feed` (taskEvents joined to tasks, projects and sessions, plus milestone and phase completions); `rhythm.overview` and `journey.activity` return work moments beside sessions; week counting by active days in `use-rhythm.ts` and `week.tsx`; bloom with inherited skills and an untagged count; skill chips on phase and milestone sheets and the tidy-up card; MCP skills; reminders and Today's done screen; tests and docs.

## What changes elsewhere

- **The recap overlay** becomes "stop and note" and is no longer the only path. The reward (bloom growing) shows after a note with skills, or when a task with skills is marked done.
- **The recommender** keeps In progress first and stops treating "has had a session" as the only signal of momentum.
- **Docs and QA:** Part B6 (Today), B5 (Work) and B8a (assistants) get rewritten; DATABASE gets `taskEvents` and the optional `taskId`.
- **Backups:** export and restore carry events and the new fields.
