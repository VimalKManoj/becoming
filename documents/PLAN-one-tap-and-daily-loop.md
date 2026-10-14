# Plan: one tap, an app that records itself, and a daily loop

Proposed 14 October 2026. **Decisions: all ten recommendations taken (owner, 14 October). Phase 1 built 14 October (uncommitted); Phases 2–5 next.**

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
7. **The check-in screen.** Replace it with remembered chips on Up next (time, energy, kind) that change the suggestion live.
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

  Tasks gained optional free **notes** (owner asked for a place to write about a task).
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

## Phase 2: The app records itself

*Work done in Claude Code lands in Becoming as it happens, with Undo, and with no approval for everyday moves.*

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

## Phase 3: Today becomes home

*Opening the app shows what you're on, what's next and what happened, and you act right there.*

**Backend**
- **`today.home`**, one query:
  - `inProgress`: up to 5 tasks, with their milestone;
  - `upNext`: up to 3 choices from `todayFor`, using the saved capacity and an optional kind filter;
  - `lastTime`: the last active day's moves and assistant runs, plus the last next step (and tomorrow's line from Phase 5);
  - `proposals`: how many items wait in the Inbox;
  - `pinnedNote`: the reason the pinned task wasn't offered, already computed today.
- **Capacity saved on the profile** (`capacity: { minutes, energy }`) instead of `sessionStorage`. Reminders use it too.
- `todayFor` gains an optional kind filter (Build, Small piece, Writing) to replace the tiles' trips to Work.

**Front end**
- **New Today layout:**
  - the greeting and date;
  - **On it now** (rows with Continue, Done and Focus);
  - **Up next**, which shows each card's reason and has inline chips for time (15 / 30 / 45 / 60 / 90 / 2h+), energy and kind;
  - **Last time** (with Undo on assistant moves);
  - the Inbox, for plans only;
  - the week bar.
- **The tiles, the check-in screen and the which-project screen go** (decision 7). Catch an idea and New project stay on the rail and pill "+".
- **Finish chains:** a finish on Today offers the `next` task in place, or the next milestone's first task when a milestone completes.
- **The pinned note** shows under Up next when the pin isn't offered.

**Fixes folded in**
- No 90-minute ceiling (2h+ chip); High-energy tasks visible with a note.
- Swap reasons per decision 6.
- The Sunday card counts days, not sessions.
- Onboarding: no promised "mood", and "A project" creates a project with its first step.
- Remove the unreachable `?intent=build` chips and stale comments.
- `recommended` is false when you came from a specific task.
- `NothingCard` uses the server's finer states (blocked-only, nothing open, waiting).

**Tests**
- `today.home` shape and limits.
- Saved capacity.
- Recommendations unchanged for the same inputs.
- Kind filter.
- The existing recommend tests stay green.

**Done when:**
- Today shows On it now, Up next and Last time.
- Every task action happens on Today.
- Nothing on Today navigates away except opening a project, Journey or Settings on purpose.

## Phase 4: Focus as a tool

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
| 2. The app records itself | Medium | 1 (Undo, finish result) | Yes |
| 3. Today becomes home | Large | 1, 2 (Last time uses assistant runs) | Yes |
| 4. Focus as a tool | Medium | 1 | Yes; can run in parallel with 3 |
| 5. The daily loop | Medium | 3 | Yes |

Each phase ships on its own:
1. dev first;
2. tests, typecheck, lint and build;
3. your check on dev;
4. production only on your go.

Docs are updated with each phase: this plan, PLAN.md, QA_PLAN, DATABASE, ASSISTANTS and CHANGE-HISTORY.

## Data changes at a glance

- `taskEvents.before` (Undo).
- `apiTokens.trust`.
- `artifacts.taskId` (optional).
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
