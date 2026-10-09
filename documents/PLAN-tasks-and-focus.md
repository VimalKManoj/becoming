# Plan: tasks you move freely, focus as its own tool

Proposed 9 October 2026.

**Decided (9 October):**
- the week counts **active days** (option A);
- finishing offers an **optional "what changed"** note;
- focus runs as a **floating chip** by default;
- assistant status changes **apply at once with an Undo**.

**Phase 1 is built:** `tasks.setStatus`, the `taskEvents` history, Start / Done / Blocked anywhere in Work and on Today's focus card, and skills on finished tasks in the bloom. Phases 2–6 are next.

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
| 2 | `taskEvents` timeline on the task sheet; Journey activity feed; week counting option A; migrating existing sessions into the feed | Medium |
| 3 | Focus decoupled: optional task, floating chip, quick stop or stop-and-note, "Log work" | Medium–large |
| 4 | Today's "In progress" section and the new card actions | Small–medium |
| 5 | MCP: status tools, `get_activity`, `project_progress`, auto-apply with undo (if chosen) | Medium |
| 6 | Project insights: tasks done per week, time in progress, milestone burn-up | Later |

Each phase keeps the app working and is testable alone. **Migration:** existing tasks keep their status; existing sessions stay sessions and appear as "focused" events. Nothing is deleted.

## What changes elsewhere

- **The recap overlay** becomes "stop and note" and is no longer the only path. The reward (bloom growing) shows after a note with skills, or when a task with skills is marked done.
- **The recommender** keeps In progress first and stops treating "has had a session" as the only signal of momentum.
- **Docs and QA:** Part B6 (Today), B5 (Work) and B8a (assistants) get rewritten; DATABASE gets `taskEvents` and the optional `taskId`.
- **Backups:** export and restore carry events and the new fields.
