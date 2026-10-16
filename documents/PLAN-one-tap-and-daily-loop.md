# Plan: one tap, an app that records itself, and a daily loop

Proposed 14 October 2026. **Decisions: all ten recommendations taken (owner, 14 October). Phase 1 built 14 October; Phase 2 shipped 15 October; Phase 3 shipped 15 October; Phase 4 built 16 October (uncommitted); Phase 5 next.**

- **Source:** the first-tier ideas in [IDEAS-flow-and-return.md](IDEAS-flow-and-return.md) (sections 3A–3G).
- **Supersedes** Phases 3–5 of [PLAN-tasks-and-focus.md](PLAN-tasks-and-focus.md): focus decoupled, In progress on Today, and assistant status tools.
- **Separate:** your redesign of the phase and milestone flow. This plan doesn't change how phases and milestones are structured.

**Already decided (9 October), carried over:**
- finishing offers an **optional** "what changed";
- focus runs as a **floating chip**;
- assistant status changes **apply at once with an Undo**.

## Why

Becoming is good at holding the work (projects, phases, milestones, the map, Journey) and clumsy at moving it:
- every status change is a form;
- the same task acts differently on each screen;
- Today sends you elsewhere;
- your real work in Claude Code only arrives through one-by-one approvals;
- the reward only follows a timed session.

The goal of this plan is that **a normal evening needs no data entry**:
- what you did shows up on its own;
- the next step is one tap away;
- every finish is felt;
- the day ends with one line that starts tomorrow.

## The evening this plan aims for

1. You open Today. **On it now** shows the two tasks In progress. **Up next** shows R2, with its reason. **Last time** says: "Claude Code · 9:40 pm · finished R1" and "Last night you said: trace one session".
2. You tap **Focus** on R2. A chip follows you around the app while you work in Claude Code. `/becoming:done` there finishes R2 with a summary, its skills and the PR link.
3. Becoming shows the finish: "+Systems · 0B 2 of 4 · Next: R3. Start?" There's an Undo, and nothing to approve.
4. At 10 pm, **Close the day** lists what moved. You type one line for tomorrow, and that line is in tomorrow's reminder.

## Decisions (taken 14 October: the recommendation in each)

1. **Assistant trust levels.** Default per token: *apply work, ask for plans*.
   - Work means status, notes, logged time, new tasks and ideas.
   - Plans means phases, milestones, docs and `import_plan`.
   - The other levels are *ask first* (today's behaviour) and *apply everything*.
2. **"Done when" on new tasks.** Optional at creation. Today asks for it the first time it suggests the task. Otherwise it stays required, as now.
3. **The status circle.** A tap cycles Ready → In progress → Done. Blocked, Back to Ready, Archive, Pin, Focus and Delete live in its menu (the ⋯ button, right-click, or a long press on a phone). **Changed 14 October (owner):** a tap that changed the status straight away was confusing for a first-time user. Clicking the circle now opens a status menu instead: each status with what it means (Ready "Not started yet", In progress "You're working on it", Blocked… "Something's in the way", Done "Finished"), the current one ticked, then focus, pin and archive. The ⋯ button is gone. Finishing takes two taps, still with no forms and with Undo.
4. **Undo.** A 6-second toast, plus "Undo" on the task's latest timeline entry until something else changes it.
5. **Deleting tasks.** Only from Archived. That's where mistakes go first.
6. **Swap reasons.** Remove them, from the schema use, Journey's stats and the docs, since nothing asks for them. The alternative is one tap on "Choose".
7. **The check-in screen.** Replace it with remembered chips on Up next (time, energy, kind) that change the suggestion live. **Withdrawn 15 October (owner):** the quick tiles and the check-in stay (see Phase 3, rethought).
8. **Focus pause.** Yes. **Focus without a task:** later (4b), because sessions currently need a task.
9. **The daily close.** Suggested on Today after 8 pm once something moved that day; never required, never nagging.
10. **Text written by Claude** (review drafts, done-when suggestions). Only through MCP and Claude Code; no model API key in the app (keeps the PRD's choice).

## Phase 1: One tap (built 14 October)

**As built:**
- **Placement.** The status circle sits inside the existing rows and cards rather than replacing them, so the Work and List designs stay as drawn. It appears on:
  - each project's up next and each loose task on the Work overview;
  - the one-lane view and Blocked/Done/Archived;
  - the project's Up next and its milestone rows;
  - the milestone sheet, the task sheet and the Visual panel.
- **Menu.** Clicking the circle opens the status menu (see decision 3, changed 14 October). It never covers the circle, and scrolls when the screen is short. Hovering the circle says "Ready · click to change status".
- **Toasts.** One with actions stays 6.5–8 s and pauses while pointed at or focused.
- **Unblocking without a note** restores the next step from before the block, instead of keeping the blocker.
- **Same choices everywhere.** Capture and the new-project sheet gained energy, and every estimate picker is 15/30/45/60/90. Done-when is optional in quick capture and a new project's first step too.
- **The task sheet, redesigned (14 October, owner: "cleaner and easier"):**
  - one breadcrumb line with ×, then the title;
  - one action row: a status button that opens the menu, the next step, and ▶ Focus;
  - a properties list (Done when, Next step, **Notes**, Time, Energy, Skills, then Built from, Waiting on, Smaller step and Sessions when they apply), each edited where it's shown;
  - the latest 3 history entries, with "Show all";
  - quiet links at the foot.

  Tasks gained optional free **notes** (owner asked for a place to write about a task), and so did projects (a Notes card on the project page), milestones and phases (in their sheets).
- **Also in this phase:** the dead all-lanes view and the old Up next/plan CSS are gone; the DoneForm and NextStepForm are no longer used.
- **Checks:** 189 tests (10 new in `convex/oneTap.test.ts`), typecheck, lint and build. Checked in the browser on dev with a throwaway account: quick add, start, finish with the finish card, Undo, block with a reason, unblock, and in-place edits (done-when, size, energy, skills), at phone and desktop widths. No console errors.

*Every task interaction in two taps or fewer, with no typing, the same everywhere, reversible.*

**Backend**
- `tasks.setStatus`:
  - Notes become optional for block, unblock and reopen. Without one, the current next step is kept. Blocked with no reason shows "Blocked" in the history.
  - It returns `{ eventId, finish? }` (below).
- **Undo.**
  - `taskEvents` gains `before?: { status, nextStep, startedAt?, completedAt?, pinned? }`, written by every move.
  - `tasks.undo({ eventId })` restores that state and deletes the event, but only if it's still the task's latest event. Otherwise it refuses with "It changed since; move it yourself."
  - Milestone completion is re-synced (`lib/projects.ts`). Archive and restore use the same path.
- **`finish` result on Done:**
  - the task's effective skills;
  - its milestone (`code`, `title`, `done`, `total`, `completedNow`);
  - `phaseCompletedNow`;
  - `next`: the next Ready or In-progress task in the same milestone, or else the same phase.
- **`tasks.quickAdd({ title, lane?, projectId?, milestoneId? })`** with defaults: 30 minutes, steady energy, and `doneWhen: ""` (if decision 2 is yes). The recommender accepts an empty done-when.
- **`tasks.edit({ taskId, title?, nextStep?, doneWhen?, minutes?, energy?, skills? })`** for in-place edits. The next step becomes directly editable for the first time.
- **`tasks.remove`** for archived tasks only. It cascades its events and session links the same way a project delete does.
- **`tasks.noteOn({ eventId, note })`** adds "what changed" after the fact, from the toast.

**Front end**
- **One `<TaskRow>`** with a `<StatusControl>`:
  - the circle (empty = Ready, half = In progress, ✓ = Done, slash = Blocked) and its menu;
  - title, code, minutes, and the next step on hover or always (decide visually).
  - It replaces the cards and rows in: the Work overview (loose tasks and each project's up-next), the one-lane view, project List rows, Up next, the milestone sheet, Done/Blocked/Archived lists, and the Visual panel's actions.
  - **On phones the control stays visible.** This removes `.pl .act{display:none}`.
- **`useTaskMove()`**: one hook for every move. It calls `setStatus`, then shows a toast with **Undo**, plus **Add a note** after Done. Toasts gain an action and last 6 seconds (`ritual-context.tsx`, `notice.tsx`'s `action`).
- **`<QuickAdd>`** at the bottom of each milestone, Up next and each lane. Type a title and press Enter. "More…" opens the full form.
- **The task panel edits in place:** title, next step, done-when, minutes, energy chips, skills chips. The full form stays for project, milestone, prerequisites and the smaller step.
- **`<FinishMoment>`**: a small card for about 6 seconds: "✓ Done · +Systems +Frontend · 0B ▰▰▱▱ 2 of 4 · Next: R2 **Start**". A completed milestone gets a one-line "Milestone complete" (Phase 5 makes it bigger).

**Fixes folded in** (from IDEAS §G)
- ▶ means **focus** everywhere; starting is the circle.
- Unblock is one path (the circle menu).
- Estimate chips are the same everywhere: 15 / 30 / 45 / 60 / 90 / custom.
- Capture and the new-project sheet show the energy picker.
- "Done and archived projects" opens the right chip.
- Tasks of a Done project can't be started from a lane.
- The two first-task paths log their "created" event (`createWithFirstStep`, `ideas.activate`).
- Remove the dead all-lanes `Lanes` branch and the old `.w-upnext`, `.w-plan` and `.w-timeline` CSS.

**Tests**
- Moves without notes.
- Undo restores everything; it refuses after a later change.
- Undoing a finish un-completes its milestone.
- `quickAdd` defaults; `edit` validation.
- `finish` counts and `next`.
- `remove` only from Archived.
- Update `taskStatus.test.ts`, which expects the old required notes.

**Done when:**
- From any screen, a task goes Ready → In progress → Done in two taps without typing.
- Every move can be undone for 6 seconds.
- The next step is editable in place.
- Phones show the controls.
- Every finish shows its skills, milestone progress and the next task.

## Phase 2: The app records itself (built 15 October)

*Work done in Claude Code lands in Becoming as it happens, with Undo, and with no approval for everyday moves.*

**As built** (ASSISTANTS.md has the full reference):
- **Trust per token** (`apiTokens.trust`, decision 1). New tokens and tokens without a value are "work" (Record my work):
  - work applies at once: `start_task`, `complete_task`, `block_task`, `update_task`, `set_next_step`, `log_session`, `add_task`, `capture_idea`;
  - plan changes still wait in the Inbox: milestones, phases, docs, research, reports, decisions and `import_plan`;
  - "ask" sends everything to the Inbox; "all" applies everything.
  - Settings → Assistants has the choice under each token (Ask first / Record my work / Everything), with one line saying what it means.
- **One apply path.** `applyProposal` (convex/inbox.ts) is what both the Inbox's Approve and an applied tool call run, so the rules are the same either way. Two new Inbox kinds hold task work at "ask": `move` (start, finish, block) and `taskEdit`. Each result says `"applied"` or `"waiting for approval"`.
- **New tools:** `start_task`, `complete_task`, `block_task`, `update_task` (title, next step, done-when, minutes, notes); reads `get_task` and `get_activity` (Journey's feed, through `journey.feedFor`). Older tool descriptions now say whether they apply or wait.
- **Changed from the plan:**
  - No separate `log_work`: `log_session` already does it, and `/becoming:log` uses it.
  - Evidence without a session: `complete_task` without `minutes` puts the summary and link on the task's history (the "done" entry's note). With real minutes it logs a finished session, and the link becomes a Proof draft as the recap does. So `artifacts.taskId` wasn't needed.
  - `activity.assistantRuns` moves to Phase 3, where Last time is its only reader.
  - The plugin ships no `.mcp.json`: the token stays in your Claude Code config. The commands use the `becoming` or `becoming-prod` server, and `BECOMING_SERVER` picks one.
- **The `work_on_task` prompt** takes an optional `task`; with one it starts from `get_task`, without one it lists the open tasks and asks.
- **Front end:**
  - **Undo on the latest history entry** in the task sheet, for your moves and an assistant's (shown "via Claude Code"). `constellation.taskStory` now returns each entry's id and whether it can be undone.
  - **Work on this with Claude**, at the task sheet's foot and in the status menu: it copies a ready prompt (the task's id, done-when, next step and how to record the work). In the sheet it also shows the prompt to copy by hand, with `/becoming:next <id>`.
  - **Inbox:** "Approve all N", oldest first, stopping at the first refusal; "Status" and "Task edit" items.
- **Fixed on the way:** undoing a move put back the skills from before it, so skills added since were lost. Now only undoing a finish restores skills, since a finish is the only move that sets them.
- **The Claude Code plugin** (`integrations/claude-code/`, local marketplace `.claude-plugin/marketplace.json`): `/becoming:next`, `/becoming:done`, `/becoming:log`, and a SessionStart hook that adds the tasks In progress to the session's context. Validated with `claude plugin validate`; the hook was run against the dev deployment.
- **Tests:** `convex/assistantsWork.test.ts` (each trust level, start/update/complete/block, finishing with minutes making a session and a Proof draft, plan changes waiting, owner-only trust, approving a move, `get_task`, `get_activity`, the prompt, Undo of an assistant's move) and an Undo-keeps-skills case in `oneTap.test.ts`. The Inbox-flow tests in `assistants.test.ts` now use an "ask" token.

**Follow-up, 15 October: connecting is easy.** The owner: connecting "sits in the settings and not an easy way to set up". Built:
- **Today's badge** beside the date: "Connect Claude Code" until an assistant has connected (hideable on the device), then "Claude Code · connected · active today".
- **A connect sheet** opened from the badge, onboarding and Settings: what it does (with a motion graphic), one command to copy (now `--scope user`), and "Connected", which appears by itself when Claude Code first calls. It ends with the trust choice and the plugin's install commands.
- **Onboarding:** a fourth line on the intro ("Build with Claude Code, and your work records itself here.") and a new "Your assistant" step after the rhythm, with the graphic and "Connect it after setup" or "Not now".
- **The plugin installs from GitHub:** the marketplace is now named `becoming`, so it's `claude plugin marketplace add VimalKManoj/becoming` then `claude plugin install becoming@becoming`.
- No backend change.

**The plan as written** (kept for reference):

**Backend**
- **New MCP tools** (in `convex/mcp.ts`). They apply at once through `setStatusFor` and `saveLoggedSession`, with `source` set to the token's name:
  - `start_task(task)`;
  - `complete_task(task, summary?, skills?, evidence_url?)`;
  - `block_task(task, reason?)`;
  - `update_task(task, next_step?, done_when?, title?, minutes?)`;
  - `log_work(task, minutes, summary, outcome)`.
- **Evidence on tasks.** `complete_task`'s `evidence_url` creates a Proof draft. The task form can't do this yet: Proof needs a session today, so an artifact gets an optional `taskId` next to `sessionId`.
- **Trust per token.**
  - `apiTokens.trust`: `"ask" | "work" | "all"` (decision 1).
  - At "ask", every tool proposes to the Inbox as now. At "work", plan tools still propose.
- **New read tools:**
  - `get_task(task)`: the full context. That's done-when, next step, milestone and phase, the docs it's built from with links, and recent history.
  - `get_activity(since?)`: the Journey feed (planned in Phase 5 of the old plan).
- **A `work_on_task` MCP prompt** that turns a task into instructions: the context, plus "call start_task now and complete_task with a summary when done-when is met".
- **`activity.assistantRuns`**: assistant events since the last close, grouped by source and run, where a run is a stretch with gaps under 30 minutes. Today's Last time uses it.

**Front end**
- **Settings → Assistants:** a trust selector per token, with one line explaining each level.
- **"Work on this with Claude"** in the task panel and the circle menu. It copies a ready prompt: the task's context, its id and the MCP instructions.
- **Inbox:** only "ask" items and plans remain. "Approve all from this run" handles a batch.
- **Task timelines and Journey** keep the "via Claude Code" badge. Assistant moves carry the same Undo.

**Claude Code integration** (a plugin in the repo, `integrations/claude-code/`)
- `.mcp.json` for the Becoming server, with the token from an environment variable.
- **Slash commands:**
  - `/becoming:next` picks or confirms a task, calls `start_task` and loads `get_task`;
  - `/becoming:done` sends `complete_task` with a summary of what changed in the session, the skills, and the PR or commit link;
  - `/becoming:log` sends `log_work`.
- **A SessionStart hook** prints the In-progress tasks into the session's context, so Claude knows what's active and can match work to them.
- ASSISTANTS.md documents the setup.

**Tests**
- Each tool at each trust level: apply or propose.
- Ownership, validation, and undo of an assistant move.
- `get_task` contents.
- Runs grouping.
- The existing MCP tests stay green.

**Done when:**
- In a Claude Code session, `/becoming:next`, then the work, then `/becoming:done` moves the task in Becoming, with summary, skills and PR link.
- It's visible on Today within seconds, with Undo.
- Nothing waits for approval.

## Phase 3: Today keeps its tiles, and gains two things (rethought 15 October, built 15 October)

**As built:**
- **Placement (owner, while it was being built):** "make it small like the week streak at the bottom and add just above it". First shipped as two slim bars above the week bar (`39c2e88`).
- **Redesign (owner's "Today · A" board, 15 October):** one card below the tiles, "where things stand", that turns through up to three slides every 6 seconds: **On it now** (the latest task In progress, its status circle, "Project · code · +N more", ▶ Focus), **Last time · Mon** ("Monday · You finished … Claude Code finished …", Pick up →) and **This week** (seven hexagon days in their lane colours, "1 of 6 evenings · …", Journey →). It replaces the week bar. Each tab's bar fills while it waits; pointing at the card or focusing inside it holds it; a tab picks a slide; slides flip on a 3D axis with a blur; with reduced motion it never turns by itself. Slides with nothing to say are left out. The board's streak ring around the rail's orb isn't in its current markup, so the rail is unchanged.
- **`today.home({ today, timezone })`** (convex/today.ts), one query:
  - `onItNow`: up to 3 tasks In progress, latest moved first (by their latest task event), each with its project and plan code ("0A·2", the constellation's); `moreInProgress` counts the rest;
  - `lastTime`: the moves (finished, started, blocked, worked on) of today, or else of the last day something moved, in your timezone. One per task (its latest that day), grouped by who made them (you first, then each assistant), plus `pickUp`: the latest of those tasks still open with a next step;
  - `openByLane`: open tasks per lane, for the tiles.
- **On it now:** the status circle (the usual menu), the title (opens the task sheet right on Today; `TaskSheet` and `EditTaskSheet` are now exported from the Work screen), "Project · code · +N more" and ▶ Focus.
- **Last time:** "Yesterday · You finished “R1” and started “R2”. Claude Code finished “R3”." with **Pick up**, which opens the task you left off on. With it, the prompt card drops "A note from last time", and the away block (3+ days) keeps its headline but leaves "where you were" to Last time.
- **Tiles:** Build reads "Next: <task> · 30 min" (the best Projects choice); Small piece and Write say how many are open.
- **Fixes folded in:**
  - the check-in has **2h+** (240 minutes);
  - a task you chose yourself (▶ Focus) is offered even when it needs more time or energy than you said, with a note (`chosenFocus` in lib/recommend.ts), and it no longer counts as "recommended";
  - swap reasons are retired (decision 6): `startSession` no longer takes one and Journey no longer mentions them; old sessions keep theirs, so the schema and backups still carry the field;
  - the Sunday card counts days, not sessions;
  - onboarding promises "your time and energy", not "mood", and "A project" opens the New project page after setup;
  - the unreachable `?intent=build|small|write` links and the plan's project chips are gone (`?task=` stays);
  - the empty plan says why, by the server's state: first run, blocked only, nothing open, waiting on prerequisites, or nothing fits.
- **Tests:** `convex/today.test.ts` (On it now order, limit, code and ownership; Last time's day window, grouping by source and pick-up; none before anything moved; a chosen task bigger than tonight) and the updated recommendation test.

**The plan as written:**

*Today stays as it is, with the greeting, the prompt card, the quick tiles and the week bar. It gains two compact blocks, so you can act on what you're doing and see what happened without leaving.*

**Owner, 15 October:** "I like the way it is now with the quick tiles but maybe add something to it." Of the four additions offered, the owner chose **On it now** and **Last time**. The two not chosen were a "Suggested next" card up front and a near-finish nudge. Decision 7 (replacing the check-in with chips) is withdrawn: the tiles and the check-in stay.

**Backend**
- **`today.home`**, one query:
  - `inProgress`: up to 3 tasks In progress, each with its project and milestone code, sorted by most recently moved;
  - `lastTime`: what moved since your previous visit (or on your last active day):
    - finished, started and blocked tasks, grouped by who moved them (you, or an assistant such as Claude Code);
    - the next step you left on the most recent one;
    - (Phase 5) tomorrow's line.
- When was the "previous visit"? It's the start of the current local day, or the last active day when nothing moved today. That needs no new table.

**Front end**
- **On it now**, between the prompt card and the tiles. It shows only when something is In progress:
  - up to 3 rows, each with the status circle (the same menu as everywhere), title, "Project · 0B", and ▶ Focus;
  - clicking the title opens the task sheet;
  - "+ N more in Work" when there are more.
- **Last time**, one or two lines under the greeting, replacing the "A note from last time" card:
  - for example "Yesterday: finished R1, started R2 · Claude Code finished 2";
  - the next step you left, with **Pick up** (which opens that task);
  - hidden on a first visit.
- **The tiles stay.** Their subtitles get a little livelier where it's cheap. For example, Build reads "Next: R2 · 45 min" for the suggested project, and Small piece and Write show how many are open.
- The away block (3+ days) stays as it is. When Last time has something to say, it takes over the away block's "where you were" part, so the two don't repeat each other.

**Fixes folded in** (unchanged from the first version)
- No 90-minute ceiling in the check-in (a 2h+ chip); High-energy tasks visible with a note.
- Swap reasons per decision 6.
- The Sunday card counts days, not sessions.
- Onboarding: no promised "mood", and "A project" opens the New project page.
- Remove the unreachable `?intent=build` chips and stale comments.
- `recommended` is false when you came from a specific task.
- `NothingCard` uses the server's finer states (blocked-only, nothing open, waiting).

**Tests**
- `today.home`: in-progress limits and order; Last time grouping by source and its day window.
- The existing recommend tests stay green.

**Done when:**
- With something In progress, Today shows it above the tiles, and it can be continued, finished or focused on right there.
- Today says in a line what moved last time, including an assistant's work, and offers to pick up the last next step.
- The tiles and the check-in work as before.

## Phase 4: Focus as a tool (built 16 October)

**As built:**
- **The focus layer** (`src/components/focus/focus-layer.tsx`, `FocusProvider` in the workspace shell, `useFocus()`) owns a running session everywhere: the chip, the full focus view, the recap, the reward and the switch prompt. Today no longer takes over the screen when a session runs.
- **One tap.** ▶ Focus in the status menu, the task sheet, Today's card, Work's rows and the map panel calls `useFocus().start`: the session starts at once, with a toast saying the timer is in the corner. On the task you're focusing on, the button reads "◉ Focusing" (the menu offers "Open the focus view"). Starting from Today's plan opens the full view.
- **Switching:** with a session running on another task, "Switch to this one?" offers **Save "…" first** (the recap; the reward then offers **Start "<the new one>"**), **Switch now** (nothing recorded for the current one; `startSession({ replace: true })`) and **Keep going**.
- **The chip** (bottom right; above the pill on phones): the orb, the title, elapsed / planned, **Pause/Resume** and **Stop** (the recap); tapping it opens the full view, which now has **Minimise** (and Escape) and Pause. The tab title reads "24:10 · Wire the endpoint" ("⏸" while paused) and goes back to the page's own title when the session ends.
- **Pause:** `activeSessions.pausedAt` and `pausedMs`; `focus.pause` and `focus.resume`; `focus.active` returns them. Saving moves the session's `startedAt` later by the paused time, so every "minutes" (endedAt − startedAt) leaves the pause out, as a logged session's start already is its end minus its minutes.
- **Time's up:** once per session (per tab) a soft two-note chime made in the browser (`profiles.focusChime`, Settings → During focus, on by default), a notification only if notifications are already allowed, and the chip glows. Nothing stops the timer.
- **Lighter recap:** "What changed" is optional (Journey then reads "Focused N min."), the next step starts as the task's current one, and the reward has **Start another** (Today's check-in) beside Done for tonight.
- **Work:** moving a task with a session running shows "Finish it first" with **Finish the session**, which opens the recap.
- **Any length:** `startSession` takes `minutes` (5–240). Today's "15 more minutes" starts a 15-minute session on the last task when it isn't finished.
- **Not done:** focus without a task (4b) stays for later. Starting focus doesn't move a task to In progress; the recap does, as before.
- **Tests:** `convex/focus.test.ts` (pause arithmetic, saved while paused, an empty "what changed", any task at any length, switching, the chime setting).

**The plan as written:**

*A timer on any task in one tap, visible everywhere, noticed when it ends.*

**Backend**
- **No capacity gate.** `startSession` already takes any open task; only Today's flow gated it.
- **Pause:**
  - `activeSessions` gains `pausedAt?` and `pausedMs?`;
  - new `pauseSession` and `resumeSession` mutations;
  - the elapsed time excludes paused time.
- **Lighter recap.** The contribution ("what changed") may be empty; Journey shows "Focused N min". The next step defaults to the current one.
- **4b, later: focus without a task.** `activeSessions.taskId` and `sessions.taskId` become optional, and the recap can attach the session to a task afterwards.

**Front end**
- **Focus** in the circle menu, on Today's cards and in the task panel starts at once. If a session is running, it asks "Switch to this one?".
- **A global `<FocusChip>`** in the workspace shell (bottom right on desktop, above the pill on phones):
  - the task, elapsed and planned time, Pause, Stop (opens the recap) and Expand (the full-screen focus view, now optional).
  - The tab title becomes "24:10 · R2 trace one session".
- **When the planned time is reached:**
  - a soft chime (a setting);
  - a browser notification if allowed;
  - the chip glows.

  Nothing stops the timer automatically.
- **Recap sheet:** outcome (Finished / Progress / Blocked), an optional one-line "what changed", the next step pre-filled, and Save. The reward offers **Start another** next to Done for tonight.
- **Work shows the running session.** Moving its task offers "Finish the session first?" instead of an error.

**Fixes folded in:** "15 more minutes" starts a 15-minute focus on the last task.

**Tests**
- Pause and resume arithmetic.
- An empty contribution.
- Starting from any task regardless of size or energy.
- Switching sessions.

**Done when:**
- From any task, focus starts in one tap and stays visible across pages.
- The end of the planned time is noticed.
- Stopping and saving takes two taps.

## Phase 5: The daily loop

*Each day ends with one line that starts the next. The reminders speak in your words. Big finishes feel big.*

**Backend**
- **The daily close:**
  - a new `dayCloses` table: `{ owner, day, tomorrow, taskId?, at }`;
  - `today.close({ tomorrow, taskId? })`;
  - `today.moves(day)` for the close's list.
- **Reminder content**, in order of preference:
  1. tomorrow's line ("Last night you said: …");
  2. a near finish ("One task finishes *Review the foundation*");
  3. the week ("One more day makes your week");
  4. the suggested task, using the saved capacity instead of a fixed 45 minutes and steady energy.

  The email subject follows the same choice. Production push needs the VAPID keys set, an ops step you do. For push text, the service worker fetches the line on `push`, so no payload encryption is needed.
- **Moments:**
  - `journey.moments`: milestone completed, phase completed, week met, a new first;
  - each is shown once (`momentsSeen` on the profile), even when an assistant caused it.
- **A weekly look-back built from records:**
  - what shipped, grouped by milestone;
  - what stalled (In progress for 7 or more days);
  - where the time went (projects and kinds);
  - skills that grew.

  A `draft_week_review` MCP tool lets Claude propose the "what I learned" text, and the `weekly_review` prompt is updated to match.

**Front end**
- **Close the day** appears on Today after 8 pm once something moved, and is always available as a button. It shows:
  - today's moves (listed for you);
  - "Tomorrow starts with…" (free text, or pick a task);
  - Save, which leads to "Tonight is done."
- **The next day,** Last time starts with "Last night you said: …", with Start when it names a task.
- **Moments overlay:** a milestone or phase completion, or a met week, shown once, on the next open if it happened elsewhere. A milestone moment offers a Proof draft.
- **The weekly review's** Look back uses the built look-back. Prompt it on Friday evening as well as Sunday.
- **Settings:** a reminder preview ("Tonight's email would say: …").

**Fixes folded in**
- The Settings reminder copy (any move counts, not only a saved session).
- MCP `get_week` counts days.
- The Proof empty-state label and the Done view hint.
- EXPERIENCE_MAP's email-verification line.

**Tests**
- Saving the close.
- Reminder text priority.
- A moment shown once.
- Look-back contents.
- Push text fetch.

**Done when:**
- A day ends with a one-minute close.
- The next evening's reminder and Today open with your own words.
- A milestone finished in Claude Code still gets its moment the next time you open Becoming.

## Order and size

| Phase | Size | Depends on | Ships alone? |
|---|---|---|---|
| 1. One tap | Medium | – | Yes, and it changes the daily feel straight away |
| 2. The app records itself (built 15 Oct) | Medium | 1 (Undo, finish result) | Yes |
| 3. Today keeps its tiles, gains On it now and Last time (built 15 Oct) | Small | 1 (Last time reads task events; richer with 2) | Yes |
| 4. Focus as a tool (built 16 Oct) | Medium | 1 | Yes; can run in parallel with 3 |
| 5. The daily loop | Medium | 3 | Yes |

Each phase ships on its own:
1. dev first;
2. tests, typecheck, lint and build;
3. your check on dev;
4. production only on your go.

Docs are updated with each phase: this plan, PLAN.md, QA_PLAN, DATABASE, ASSISTANTS and CHANGE-HISTORY.

## Data changes at a glance

- `taskEvents.before` (Undo).
- `apiTokens.trust` (built 15 October).
- `artifacts.taskId` (optional; not needed after Phase 2, see "Changed from the plan").
- `profiles.capacity`, `profiles.momentsSeen`.
- `activeSessions.pausedAt` and `pausedMs`.
- New table `dayCloses`.
- 4b only: optional `taskId` on `activeSessions` and `sessions`.

All additive; no migration of existing rows.

## Not in this plan (second tier, see IDEAS §3A5–A11, §5)

- The command palette and keyboard shortcuts.
- Drag and drop and the board view.
- An acting map and search.
- Stable short IDs.
- Project health.
- Git and PRs as sources.
- The weekly card and changelog.
- Splitting, checklists, snooze.
- The Claude Code statusline.
- Auto-screenshots and portfolio sync.
