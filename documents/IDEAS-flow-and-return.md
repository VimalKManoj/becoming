# Rethinking how Becoming works

14 October 2026. These are ideas, not decisions. The first tier is planned in [PLAN-one-tap-and-daily-loop.md](PLAN-one-tap-and-daily-loop.md). They come from a full walk through the code: Today and focus, the task lifecycle in Work and on the project pages, Journey, Ideas, Proof, the Inbox and reminders, and the PRD.

## 1. What's in the way today

1. **Two apps share one shell.**
   - Today is an *evening coach*: check in, get one suggestion, time it, write a recap.
   - Work is a *project tracker*: projects, phases, milestones, tasks and the map.

   You use the tracker, and most of your real work happens in Claude Code. The coach is still the only path that feels finished, with a reward and a story. The tracker's interactions are thin by comparison: a status chip, a modal and a form.
2. **Every move costs a form.**
   - Blocking, unblocking and reopening all need typed text.
   - A new task needs "Done when", minutes and energy.
   - The full task form has 12 inputs and fills the screen.
   - "Mark done" is two clicks into a sheet.
   - You can't edit a task's next step directly at all; it changes only through block, unblock, reopen, a recap or an assistant.
3. **The same task behaves differently in each place.**
   - ▶ means "start (status)" in the one-lane view but "focus session" on the Work overview.
   - Done has a shortcut in one view only.
   - Unblock is built three different ways.
   - The Visual map can't change anything.
   - On a phone, the project list hides its action buttons (`.pl .act{display:none}`).
4. **Today sends you away.** Six of its seven tiles leave Today. Build goes to a project page. Pinning, editing, unblocking and archiving all live in Work. A running focus session is invisible outside Today.
5. **The app is always behind reality.** Claude Code does the work, but the app hears about it only through Inbox proposals you approve one by one. Assistants can't start, finish or block a task. So you end up doing data entry after the fact, which is the opposite of motivating.
6. **The reward sits on the path you don't use.** A timed session ends with the bloom, "+1 Skill" and "That counts." Finishing a task any other way (Done already?, Work, an assistant) gets a 3-second toast.
7. **Very little pulls you back.**
   - Reminders are generic. Push isn't set up in production, and the email suggests a task picked for a fixed 45 minutes.
   - There's no "here's what you did yesterday" and no "tomorrow starts with…".
   - The weekly review exists, but only a Sunday card prompts it.

## 2. What it should be

**A place that already knows what you did, makes the next step one tap away, and shows you it added up.**

Principles to hold every change against:
- **Record, don't ask.** Work done anywhere (Claude Code, git, the app) shows up on its own. Typing is for things only you know.
- **One tap, with undo.** Every status change is instant and reversible. Ask nothing when undo is enough.
- **Same task, same controls, everywhere.** One row component, one status control, one panel.
- **Focus is a tool, not a gate.** The timer is available on any task in one tap; nothing has to pass through it.
- **Every finish is felt.** Small for a task, bigger for a milestone, biggest for a phase or a met week.
- **Structure grows from work.** Phases and milestones help you see; they never have to exist before you can work.

## 3. Ideas

### A. Make every task interaction one tap

1. **One task row everywhere.**
   - Give each task a status circle like Linear or Things: tap it to cycle Ready → In progress → Done, or open its small menu for Blocked, Archive and Pin.
   - Use the same row on the Work overview, project List, one-lane view, Today, the Visual panel and phones (no hidden actions).
2. **Undo instead of forms.**
   - Done, start, block, archive and Inbox approvals apply at once, with a toast like "Done · Add a note · Undo" (`Notice` already has an `action` slot for this).
   - Drop the required text on unblock and reopen, which can keep the old next step. "What's blocking it" becomes optional, with a nudge.
3. **Quick add in place.**
   - At the bottom of every milestone, lane and the Up next list, add an input where you type a title and press Enter.
   - Done-when, minutes and energy become optional with defaults. Today asks for done-when the first time it suggests the task, or Claude fills it in.
   - Optional shorthand: `Fix the login retry 30m #0B`.
4. **Edit in place.** Click a task's title, next step or done-when to edit it. The next step finally becomes directly editable. Skills get set on the task itself.
5. **A side panel, not a modal.** The task panel opens to the right of the list and stays open as you move between tasks: arrow keys or clicks, no closing and reopening.
6. **A command palette and shortcuts.**
   - Ctrl/⌘K anywhere: jump to any project or task, create, start, finish, log work.
   - In lists: J and K to move, S start, D done, B block, P pin, F focus, E edit. The S/D/B shortcuts were planned in PLAN-tasks-and-focus.
7. **Drag and drop.**
   - Reorder tasks (today they're stuck in creation order) and drag them between milestones.
   - Reorder milestones within a phase. Today ↑/↓ swaps across phases.
8. **A board view.** Add a third project view next to List and Visual: the current phase as Ready, In progress and Done columns you drag between. It's the quickest way to *work* a project; the map is the quickest way to *see* one.
9. **Make the map act.** Selecting a task on the Visual map opens the same panel with the same actions. Add tasks and milestones from the map.
10. **Search.** Global search across tasks, projects, ideas and docs, plus search inside the "Waiting on" picker (up to 300 checkboxes today).
11. **Stable short IDs** like `BEC-42` instead of positional codes, which change when you reorder. The IDs can then be used in commits, Claude prompts and URLs.

### B. Today becomes home

1. **Three blocks instead of seven tiles:**
   - **On it now:** the tasks In progress, each with Continue, Done and Focus.
   - **Up next:** 1–3 suggestions with their "why", filtered by inline chips (time, energy, lane) instead of a separate check-in screen. The chips are remembered, not asked every time.
   - **Last time:** what moved yesterday (including what Claude did) and the next step you left yourself.

   Build, Small piece and Write become filters on Up next, not trips to other pages.
2. **Finishing chains into the next thing.**
   - Mark something done and the card shows "2 of 4 in *Review the foundation* · Next: R2, trace one session. Start?".
   - Finishing the last task in a milestone gets its own moment.
3. **Every finish is felt.** Any finish lights its skill's petal and ticks the milestone bar, wherever it happened, even through Claude Code. Show the pinned task's reason when it isn't offered (the server already computes it and Today never shows it).
4. **A daily close, about 2 minutes, at the end of the evening:**
   - The app lists what moved today (from activity, so nothing to type).
   - You set tomorrow's first step in one line.
   - Done.

   Tomorrow, that line is the first thing on Today and in the reminder. This is the daily loop.
5. **Merge the Inbox into "Last time".** Assistant activity appears as what happened, grouped by session: "Claude Code · 9:40 pm · finished 3, started 1". Each item has Undo, and only structure changes, like a new plan or a new phase, still wait for approval.

### C. Let the app record the work

This has the biggest impact, because it removes the data entry.

1. **Assistant status tools with undo.** Add `start_task`, `complete_task`, `block_task`, `update_task` and `log_work`. They apply at once and show in "Last time" with Undo. This was decided on 9 October, in Phase 5 of PLAN-tasks-and-focus, and not built yet.
2. **Trust per assistant.** In Settings → Assistants, each token gets one of three levels:
   - "apply status and notes, ask for structure" (the default);
   - "ask for everything" (today's behaviour);
   - "apply everything".
3. **A Claude Code end-of-session hook or plugin.**
   - When a Claude Code session ends, it sends what was done, matched to tasks by ID or by Claude's judgement, plus the skills practised and the PR or commit link as evidence.
   - Since you mostly build with Claude Code, this alone would keep Becoming current without you lifting a finger.
4. **Start a task, hand it to Claude.** On any task, "Work on this with Claude" copies a ready prompt, or opens it through MCP, with the task's done-when, next step, the docs it's built from, and an instruction to mark it done. The loop runs from Becoming to Claude Code and back.
5. **Git as a source.** Commits or PRs that mention `BEC-42` move that task through a GitHub webhook (planned as 11B). Each merged PR becomes a Proof draft.
6. **Skills inferred, not tidied.** Whoever finishes a task suggests its skills from the work: Claude, or the milestone's defaults. The tidy-up card becomes rare.
7. **"Sync with repo" in one click.** Re-runs `import_plan` from the repo's docs, so the plan follows PLAN.md instead of drifting.

### D. Focus as a tool, not a gate

1. **One tap from any task.** Remove the check-in and plan screens from the path when you already chose the task. Today's 90-minute cap and energy filter currently make some tasks impossible to focus on.
2. **A floating focus chip that follows you across the app,** with pause, stop and a quick note (planned as Phase 3). Show the remaining time in the tab title.
3. **When the planned time ends,** play a gentle sound and send a notification. Today nothing happens.
4. **Focus without a task:** "just 25 minutes", which you attach to a task afterwards, or not at all.
5. **A lighter recap.**
   - "What changed" is optional, or pre-filled from Claude's summary when there is one.
   - The next step is one line, defaulting to the current one.
   - From the reward, offer "Start another" as well as "Done for tonight".

### E. Structure that grows with the work

1. **One current milestone per project, always visible.** It sits on the project row, and Today draws from current milestones first. It shows things like "1 task left to finish 0B" when a milestone is nearly done.
2. **Keep phases and milestones, but make them cheap.**
   - Create inline, drag to regroup, and rename by clicking.
   - A milestone without a phase is fine, and so is a task without a milestone.
   - Use one name for "not in a group" (the code uses three today).
3. **Project health on the project page:**
   - tasks per week;
   - a burn-up for the current phase;
   - stale tasks ("In progress for 9 days");
   - blocked tasks waiting longest.

   This was planned as Phase 6.
4. **Lanes vs projects.** "Projects" is both a lane and an entity, and "One-offs" means the Projects lane without a project. Consider making lane a *kind of work* tag (Build, Small piece, Writing) that projects and loose tasks both carry, and rename the lanes so the words stop colliding.

### F. Coming back every day

1. **Reminders that say something.**
   - Use your own next step ("Last night you said: wire the retry toast") or a near finish ("One task finishes *Review the foundation*").
   - Mention the week ("One more day makes your week").
   - Time them to when you usually work, which can be learned from activity, and use the capacity you usually pick.
   - Add push (VAPID keys) in production.
2. **A morning or lunchtime glance on the phone.** The PWA opens straight to "On it now" and "Last time", with one-tap Done. Five seconds of contact during the day keeps the thread alive for the evening.
3. **Moments, sized to the event.**
   - task: a petal and a tick;
   - milestone: a short full-screen moment, plus a Proof draft offered;
   - phase: a bigger one, with a summary of what the phase delivered;
   - a met week: a card.
4. **A weekly review that Claude drafts.**
   - The look-back is written from activity (what shipped, what stalled, where the time went), and you only edit and set the intention.
   - Prompt it on Friday evening and Sunday, and by email on Sunday.
5. **A shareable weekly card.** "This week: 9 finished, 2 milestones, Motion and Systems grew", which you can post or keep. Proof stops being only a link tracker and becomes a running build log.
6. **An auto-built changelog per project.** Finished tasks and milestones become a dated story, a ready draft for the case study (4A·2) and the portfolio (1D·3).
7. **An optional daily chain within the week.** The weekly streak stays the main signal. Showing "3 days this week" as a ring (not a daily streak that punishes) gives a reason to do 10 minutes today.
8. **A friend later.** An accountability partner sees only your weekly card (with 10C).

### G. Quick fixes found along the way

**Today**
- Tasks over 90 minutes or needing High energy can't be focused on unless they have a smaller step (capacity chips stop at 90).
- The pinned task's "why it wasn't offered" note is computed but never shown (`overview.pinned`).
- Swap reasons exist in the schema and in Journey's stats, but nothing asks for them. Either add one tap on "Choose" or remove them.
- The Sunday card says "{n} of {target} sessions" but counts days.
- Onboarding promises a "mood" check-in that doesn't exist.
- Onboarding's "A project" creates a loose task, not a project.
- "15 more minutes" lands on Open, not on a plan.
- "‹ Change" skips back past the check-in.
- The reward has no "start another".
- `?intent=build` chips and the "Plan it for tonight" comment are unreachable leftovers.
- Starting focus from a Work task counts as "followed Today's top suggestion".

**Work**
- Mobile hides the project-list actions.
- There's no task delete.
- `moveMilestone` swaps across phases.
- "Done and archived projects" opens the Active chip.
- Tasks of a Done project can still be started from `?lane=`.
- Unblock is implemented three ways.
- The all-lanes `Lanes` branch is dead code.
- Replay leftovers (`stateAt`, `STEPS_PER_DAY`) and old `.w-upnext`, `.w-plan` and `.w-timeline` CSS remain.
- Estimate chips differ between forms (15/20/30/45, 15/30/45/60, 15/30/45/60/90).
- Energy is fixed at Steady in capture and the new-project sheet.
- `createWithFirstStep` and `ideas.activate` log no "created" event.

**Copy and numbers**
- Settings says reminders skip only after a saved session, but any task move counts.
- The Done view hint still talks about "a session's recap".
- Proof's empty state points to "Progress → All sessions".
- MCP `get_week` counts sessions, not days.
- Lane balance in recommendations uses sessions only, not task moves.
- The reminder's suggestion uses a fixed 45 minutes and Steady energy.
- EXPERIENCE_MAP still lists email verification as planned.

## 4. A suggested order

1. **The feel (A1–A4, B3).** One task row and status control everywhere, undo instead of required text, quick add, editable next step, a reward on every finish. Smallest change, biggest difference in how it feels day to day.
2. **The app records itself (C1–C3).** Assistant status tools with undo, trust levels, the Claude Code end-of-session hook. After this, most days need no data entry.
3. **Today as home (B1, B2, B4, B5, D1–D2).** On it now, Up next, Last time; finishing chains into the next task; the daily close; the floating focus chip.
4. **The return loop (F1–F4).** Reminders with your own words, push in production, moments by size, a review Claude drafts.
5. **Power and structure (A5–A11, E1–E3).** The side panel, the palette and shortcuts, drag and drop, the board view, an acting map, search, stable IDs, project health.
6. **Story (F5–F8, C5).** A weekly card, the changelog, git and PRs as sources, a friend.

Fold section G's quick fixes into whichever step touches the same screen.

## 5. More ideas (second round)

### H. Working with tasks, faster

1. **Multi-select and bulk actions.** Shift-click or ⌘-click rows, then move them to a milestone, set lane or size, mark them done, or archive them. Useful after an import or a sprint.
2. **Saved views (smart lists).** For example:
   - "Quick wins": Ready, 30 minutes or less, low energy.
   - "Waiting": blocked, or waiting on another task.
   - "Stale": In progress for 7 or more days.
   - "Practises Motion": tasks tagged with a skill.

   Pin a few to Work's sidebar.
3. **A checklist inside a task.** Lightweight checkboxes for the steps of one sitting, so a task stays one evening without being split into five tasks. Ticking the last box suggests Done.
4. **"This is too big" → split.** One action turns a task into 2–4 smaller tasks in the same milestone, typed by you or proposed by Claude. It replaces the three-field "smaller step", which is hard to understand and rarely used.
5. **Snooze and soft dates.**
   - "Not now" hides a task from Up next until a chosen day.
   - Soft buckets (This week, Next week, Someday) give it a place in time without deadlines, which the PRD rules out.
6. **Convert anything.** A task can become an idea or a milestone, an idea a task, a milestone a phase. Nothing has to be retyped when you realise it's bigger or smaller than you thought.
7. **Recurring tasks and practices.**
   - "Write 15 minutes every Tuesday" and "Weekly PR review" come back on their own.
   - Practices could be a fourth kind of thing beside projects, ideas and loose tasks. They count toward the week but never pile up when missed.
8. **Links on tasks.** Attach a PR, Figma frame, URL or file, with a preview card. Evidence then lives on the task, not only on sessions (today Proof needs a session).
9. **"Now unblocked" moments.** When a prerequisite finishes, the tasks waiting on it light up on Today: "R2 is ready now that R1 is done."
10. **Log work without a timer.** "Log 40 min on BEC-42" from the task, the palette or the phone (planned as 8C·2). It covers work done away from the app.
11. **Learn your estimates.** Journey already knows "you spend about 1.3× your plan". When you create a task, suggest the adjusted estimate ("30 min → about 40 for you").
12. **A WIP limit.** A gentle note when more than 3 tasks are In progress: "Finish one before starting another?" It keeps the In progress list honest.

### I. Projects and structure

1. **Project templates.** Side project, portfolio piece, blog series, client job: each starts with sensible phases and milestones. Or "From a repo": Claude reads the docs and drafts the plan (import_plan already exists).
2. **A timeline view.** Phases as bars on a real time axis, built from actual activity, with a forecast at your pace: "Phase 08 finishes around 2 Nov."
3. **A "Someday" status.** It sits between Active and Archived: parked, out of Today, easy to bring back.
4. **A decision log per project.** Decisions and the reasons behind them, like ADRs. Ideas already record decisions in genesis; carry the same idea into the life of a project.
5. **A project retrospective when it's done.** Three prompts (what worked, what didn't, what you'd keep), pre-filled from the changelog. They feed the case study.
6. **All current milestones across projects** on one screen: the "what am I actually pushing on" view.
7. **Doc freshness.** "PLAN.md changed after the last sync. Sync now?" Read from the repo link through GitHub.
8. **A notes page per project.** Free markdown for things that aren't tasks: links, references, rough thinking.

### J. Ideas

1. **Capture from anywhere:**
   - an email address (`ideas@mail.byvm.in`, using Resend's receiving, which is off right now);
   - the phone's share sheet (PWA share target, Android);
   - a browser bookmarklet that saves the page with your note;
   - a voice note, transcribed.
2. **Quick idea scoring.** Excitement, effort and impact, one tap each. The notebook can then sort by "most exciting, least effort" when you're choosing what to start next.
3. **Ideas attached to projects** as "future features", so a project's wishlist doesn't clutter its plan.
4. **Ideas resurfacing.** One idea a week comes back with "still interested?": keep, start or let go. The notebook stays alive instead of growing forever.

### K. Insight

1. **When you work best.** A weekday-by-hour heatmap of finishes, which also feeds reminder timing.
2. **Skill balance in suggestions.** "You haven't practised Motion in 3 weeks." Up next can weigh skills, not just lanes.
3. **Personal records.** Best week, fastest milestone, longest streak, most finished in a day. Light, and only shown when beaten.
4. **A monthly and yearly recap,** generated from records: what you built, how the bloom grew, firsts, a few highlights.
5. **A "body of work" timeline.** Every project as a row across the months, built from real activity: a picture of the last year at a glance.

### L. Proof and portfolio

1. **Screenshots captured automatically.** When the Claude Code hook reports a finished UI task, it captures a screenshot of the running app (Playwright) as a Proof draft.
2. **Before-and-after pairs** for a task or milestone.
3. **Publish to your portfolio site.** Items marked Published sync to your portfolio project's backend, so the portfolio updates itself from Becoming.
4. **A case-study builder.** Changelog, decisions, retrospective and proof become a structured draft. 4A·2 already drafts from records, so this extends it.
5. **An opt-in public build log** at `becoming.byvm.in/@you`: weekly cards and published proof, nothing else.

### M. Assistants

1. **A Claude Code statusline** that shows the current Becoming task and its time, e.g. `BEC-42 · 25m`. Every Claude Code session is visibly tied to a task.
2. **Slash commands in Claude Code:**
   - `/becoming next` picks a task and loads its context;
   - `/becoming done` finishes it with a summary;
   - `/becoming log` logs time.
3. **Bind a Claude session to a task at its start.** The first thing a session does is ask `whats_next`, or reuse the task you handed over. Everything after it is attributed automatically.
4. **MCP resources.** Expose each project's plan and docs as resources, so Claude gets the context without a tool call.
5. **The Claude app and ChatGPT** through "Sign in with Becoming" (OAuth, 7D·3), so the evening check-in can happen from the phone's Claude app.
6. **Claude-assisted fields in the app.** "Write the done-when", "Break this down", "Estimate". These need either a model API key, which the PRD avoided, or a trip through Claude Code/MCP. Decide which before building.

### N. Phone and platform

1. **Home-screen shortcuts** (PWA `shortcuts`): Today, Catch an idea, Log work.
2. **An offline queue.** Taps made offline are saved and sent later. Today only a notice is shown.
3. **A browser extension** for capturing an idea from any page, or starting focus on a task.
4. **A calendar feed** (`.ics`) of the planned week's evenings, so they show next to everything else. Read-only, with no deadlines.
5. **Built-in ambient sound** for focus instead of a YouTube link: rain, café, brown noise.
6. **A low-energy mode.** On tired evenings, Today shows only tasks of 15 minutes or less and needing low energy, with a calmer screen. Showing up still counts.

### O. Data and connections

1. **Export to Markdown.** Per project: plan, changelog and decisions. Good for Obsidian or the repo.
2. **Outgoing webhooks.** Post to Discord or Slack when a milestone completes, or send the weekly card somewhere.
3. **Import from GitHub Issues, Linear or Notion** into a project, using the same `import_plan` rules.
4. **A backup on a schedule.** The JSON export already exists; run it weekly to a place you choose.

### P. Together (after the friend pilot)

1. **An accountability partner** who sees only your weekly card and can send one reaction.
2. **"Focusing now" presence.** See when a friend is in a focus session and join with your own task, like body doubling.
3. **A shared project** with one collaborator: same plan, separate journeys.

### Standouts from this round

- H4 split, H3 checklist and H5 snooze would make tasks easier to shape.
- M1 statusline and M2 slash commands would make Claude Code and Becoming feel like one tool.
- L1 auto-screenshots and L3 portfolio sync would turn your work into proof with no effort.
- J1 email and share-sheet capture would mean ideas never get lost.
- K2 skill balance in suggestions would give the bloom a purpose beyond display.
