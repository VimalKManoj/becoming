# Becoming — end-to-end QA plan

Work through this from top to bottom: first locally (Parts A–C), then deployment (D–E), then the same checks on the live app (F). Each step says **what to do** and **what you should see**. Tick the boxes as you go. When something is off, write it down using the bug template at the end and keep going; then send me the list.

Written 2 October 2026; Part B rewritten 6 October and updated 8 October 2026 for the Ritual redesign and the polish round after it. Parts A and B passed on 8 October. Everything up to 9 October was committed and pushed on 10 October (D1).

> **Safety rules for the whole plan**
> - Use test accounts with test passwords for everything destructive (restore, delete). Your real account comes last, and only on the deployed app.
> - Never paste passwords, `.env.local` contents, `BETTER_AUTH_SECRET` or deploy keys into chat, screenshots or bug reports.
> - Production changes happen only when you decide to go (Part D). Claude won't touch production without your explicit go.

---

## What's already covered by automated tests

`npm run check` runs TypeScript, ESLint and **126 tests in 24 files**. Real Convex functions run in memory (convex-test), alongside pure rules tested without a database. Covered:

- **Isolation and sign-in:** owner isolation between accounts, and anonymous access is refused.
- **Tasks:** views, lifecycle (unblock, reopen, archive, restore), prerequisites (loops, the limit of 10, archived prerequisites stop blocking), pins.
- **Today:** ranking and reasons, empty states, session start/cancel/recap, smaller steps, unsafe links refused.
- **Projects:** milestones and their derived completion, case-study data.
- **Ideas:** stages, brainstorm validation, activation options, moving back.
- **Proof:** editing, publish rules, candidates, screenshots (type, size, reuse), pipeline counts.
- **Rhythm:** weekly targets taking effect next week, pauses, streaks, the exact week window per timezone, reflections.
- **Mind Bloom:** the eight fixed skills, counting, the month window.
- **Data:** export and restore (every rule, rollback on failure), batched deletion.
- **Ritual flow:** Today scoped by intent, project or task (bad link ids match nothing), alternatives from other lanes, lined-up steps first, weekly plans, onboarding and preferences, single-item reads for deep links.
- **Interface helpers:** colour contrast of the Ritual text tokens, the task form, Work's address handling, the date line, greeting, week line and other wording.

**Not covered automatically. That's what you're testing:**
- the screens wired to the real backend (buttons calling the right thing)
- sign-up, sign-in and sign-out
- account deletion
- screenshot upload through a real browser
- the offline notice
- real phones
- the deployed environment

---

## Part A — Local setup (once, about 15 minutes)

You need two terminals in `D:\Dev\Full Stack Dev\form`.

- [x] **A1. Tools.** `node -v` shows 22.14 or newer. Run `npm install` if `node_modules` is missing or `package.json` changed.
- [x] **A2. Environment file.** `.env.local` exists with `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`. Don't open it in a shared screen. If it's missing, `npm run backend` creates it when you link your dev deployment.
- [x] **A3. Convex dev environment variables.** Check that both exist without printing the secret:
  - `npx convex env get SITE_URL` should show `http://localhost:3001`.
  - Open the dashboard (`npx convex dashboard`), go to Settings → Environment Variables, and check that `BETTER_AUTH_SECRET` exists (don't copy it anywhere).
  - If `SITE_URL` is missing, run `npx convex env set SITE_URL http://localhost:3001`.
- [x] **A4. Automated checks (expect all green).**
  - `npm run check`: 126 tests pass, no lint errors.
  - `npm run build`: the route list ends without errors.
- [x] **A5. Sync the backend (important; it hasn't been synced since the redesign).** In **terminal 1**, run `npm run backend` and leave it running.
  - **Expect:** it reports the schema and functions pushed, then keeps watching for changes.
  - It may ask to apply new indexes: accept. Every change is additive.
  - If it reports a schema validation error, stop and send me the message.
- [x] **A6. Re-check after sync.** `npm run check` again. `convex/_generated` was regenerated, and the types must still pass.
- [x] **A7. Start the app.** In **terminal 2**, run `npm run dev`, then open `http://localhost:3001`.
  - **Expect:** a redirect to `/today`, a dark ember screen, and a "Sign in to plan tonight." card.

---

## Part B — Local feature tests, in order

Do these in Chrome (or Edge) on desktop first, with DevTools open (F12) on the **Console** tab. Any red error is worth noting.

> Updated 6 October 2026 for the Ritual redesign, and 8 October for the polish round: Bricolage Grotesque headlines with no italics (emphasis is colour only), rising embers behind the screens, weekly target up to 6, two-step new project, Build always opens the project list, a smaller prompt card, smoother tile hovers and no focus-card blink. Run `npm run backend` once before testing: the schema gained `weekPlans` and new profile fields.

### B0. Signed out (2 minutes)

- [x] Visit `/today`, `/work`, `/ideas`, `/journey` and `/settings`.
  - **Expect:** a sign-in prompt in the Bricolage Grotesque headline face for each, no private data, no console errors. Small embers drift up behind the content, faint over the centre and clearer at the sides.
- [x] Visit `/proof`.
  - **Expect:** it redirects to `/journey?tab=proof`.
- [x] Visit `/nothing-here`.
  - **Expect:** "This page isn't in your *workspace.*" with a way back to Today.
- [x] Desktop width shows the 92px rail: the orb, Today, Work, Ideas, Journey. Narrow the window below about 900px.
  - **Expect:** the rail is replaced by a floating pill at the bottom, and the current section expands to show its label.

### B1a. Email verification, password reset and Google (added 9 October)

- [ ] Create an account. **Expect:** "Check your email." with **Send the link again**. Locally, copy the link from the backend terminal (`[email not sent: …]`). Open it. **Expect:** you're signed in and the account page says "Email confirmed."
- [ ] Before confirming, try to sign in. **Expect:** "Check your email." with "Confirm your email first. We've just sent a new link."
- [ ] Open a used or old confirmation link. **Expect:** "That confirmation link has expired or was already used…".
- [ ] **Forgot password?** → enter your email → **Send the link**. **Expect:** "Check your email." (the same answer for an unknown email). Open the link: "Choose a new password." Mismatched passwords are refused; saving says "Password changed. Sign in with your new password." Other signed-in tabs are signed out.
- [ ] Open the reset link again. **Expect:** back to "Forgot your password?" with "That reset link has expired or was already used…".
- [ ] Once `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set: **Continue with Google** appears; signing in lands on Today. With the same email as an existing account, it joins that account.
- [ ] A Google-only account: Settings → Delete account asks only for DELETE (no password field).

### B1. Accounts

Use a fake address such as `qa-a@example.test`. Email isn't verified, so it doesn't need to be real. Passwords must be 12–128 characters.

- [x] Open `/account`: a single screen with no scrolling — the form on the left and the Mind Bloom on the right (desktop). Choose **Create an account** under the Sign in button. Create **Account A** (name "QA Tester").
  - **Expect:** "Hello, QA." (first name only, "QA" in ember) and a mint dot with "Convex identity confirmed for QA.", plus "Open Today →".
- [x] Reload the page.
  - **Expect:** still signed in.
- [x] Sign out, then sign in with a **wrong** password.
  - **Expect:** a readable error, and the form still works.
- [x] Sign in correctly.
- [x] In a **private/incognito window**, create **Account B** (`qa-b@example.test`). Keep that window for isolation tests.

### B2. Onboarding (Account A, first visit to Today)

- [x] Open Today with the brand-new Account A.
  - **Expect:** the setup overlay: "A mind that grows one evening at a time." ("grows" in ember, upright) and three numbered lines. Step dots at the top, **Skip setup** on the right, a light breathing glow and embers rising behind.
- [x] **Begin** → pick a motive (Ship things people can touch / Get a little better at my craft / Make one small thing better every week) → **Continue** → pick 3 evenings a week; leave the reminder on → **Continue**.
  - **Expect:** five equal choices, 2 to 6 a week, filling the row. The reminder line says sending starts once notifications are set up.
- [x] Pick **A project** → **Continue**.
  - **Expect:** "Make it small enough to start." with an EXAMPLE tag and the example shown as placeholder text only (nothing pre-filled). Type your own first step and done-when, pick 30 min.
- [x] **Start my first evening**.
  - **Expect:** the overlay closes with a toast. Today shows your motive under the greeting. Reload: setup doesn't come back.
- [x] In Account B, press **Skip setup**.
  - **Expect:** it closes and nothing is created.

### B3. Settings

- [x] Open Settings from the avatar (rail bottom, or top right on a phone).
  - **Expect:** "Your *direction.*" with a sticky side nav: Motive, Rhythm, Reminder, How Today chooses, During focus, Account, Your data. Clicking an item scrolls there; the active item follows as you scroll.
- [x] **Motive:** edit it and press Enter.
  - **Expect:** a toast, and the preview updates.
- [x] **Rhythm:** use − / + to change the target.
  - **Expect:** it goes from 1 to 6 (+ stops at 6). A toast; if you already had a target, the change starts next Monday.
- [x] **Plan a pause next week:** switch it on, then off.
  - **Expect:** the lilac "Week N … is a planned pause" note appears and goes.
- [x] **Reminder:** change the time and days.
  - **Expect:** saved, with the honest note that nothing is sent yet.
- [x] **How Today chooses:** tap **Favour Writing**, then **Equal attention**.
- [x] **During focus:** switch the quotes and the lo-fi player off and on (these show up in B6).
- [x] **Account:** your name, email, Sign out and "Account status →".

### B4. Capture and new project

- [x] Press **+** (rail or pill).
  - **Expect:** the capture sheet with Idea / Task / Project / Paste assignment. On a phone it slides up from the bottom. Each tab has its own note under the form; switching tabs keeps what you typed.
- [x] **Idea:** "Magnetic cursor playground" → save.
  - **Expect:** a toast; it's in Ideas.
- [x] **Task:** a title, a done-when, Showcases, 20 min → save.
  - **Expect:** it's in Work's Showcases lane.
- [x] **Paste assignment:** paste a few lines → save.
  - **Expect:** you land on that idea's brainstorm (`/ideas?idea=…`) with the text under notes.
- [x] **Project** (or "+ New project" anywhere): step 1 of 2 asks for the name "QA project", why it matters and the lane → **Next: the first step →**. Step 2 of 2 asks for the first step, estimate and done-when; "‹ QA project" goes back with your text kept.
  - **Expect:** neither step needs scrolling on a laptop screen. **Save to Work for later** puts it in Work with that first step as its next task.
- [x] Make another and press **Start the first step tonight**.
  - **Expect:** Today opens the check-in for that project.

### B5. Work

- [x] Open Work.
  - **Expect:** "+ Add task" and "+ New project" at the top, active projects as wide cards, then Projects / Showcases / Writing lanes with status chips. An empty lane says so.
- [x] Tap a task.
  - **Expect:** a task sheet with its status, minutes, energy, project and milestone, done-when, next step, prerequisites and smaller step, and actions: Plan it for tonight, Pin for tonight, Edit, Archive.
- [x] **Edit** a task: add a smaller step (15 min) and a prerequisite → save.
- [x] **Pin for tonight**, then check Settings → How Today chooses shows the pinned task.
- [x] **Archive** a task, then open **Archived** from the links under the lanes and **Restore** it.
- [x] Open a project.
  - **Expect:** "‹ Work", lane · status, name and purpose, the milestones card (or its empty message), and a "Next step" card with **Plan it for tonight**.
- [x] Add milestones "Usable" and "Polished"; open one to add a task, move it, rename it, remove it (with confirmation).
- [x] **Case study draft:** copy and download work. **Mark done**, then **Make active** again.
- [ ] **Archive a project with open tasks** (changed 9 October): one Ready, one In progress, one Blocked, one Done, plus a task in another project that has one of them as a prerequisite.
  - **Expect:** "Project archived with its open tasks…"; the open three are in Work → Archived, the Done one stays Done, and the waiting task in the other project can now appear on Today. **Make active** brings the three back with their old statuses; a task you had archived on its own before stays archived.
- [ ] **Delete project** (added 9 October) on a throwaway project with a task and one saved session.
  - **Expect:** a sheet naming what goes (tasks, sessions, evidence, milestones, phases, docs), with **Archive instead** and **Keep it**. **Delete for good** returns to Work with "… deleted."; the project, its tasks and that session are gone from Work and Journey, and an idea it came from is back in Ideas. With a focus session running on its task, Delete is disabled with an explanation.
- [x] Open `/work?new=task` and `/work?view=blocked`.
  - **Expect:** the full task form, and the Blocked list.

### B6. Today — the evening

- [x] Open Today.
  - **Expect, top to bottom:** the mono date line, "Good evening, QA." (or morning / afternoon), your motive, the compact lilac prompt card, then "What's on your mind tonight?" with Build, Small piece, Write, Catch an idea, Reflect (Publish only appears when something is ready to share), and the week bar.
- [x] Press **Another ↻** a few times.
  - **Expect:** it cycles questions, a spark from your newest idea, and a note from your last next step or this week's intention.
- [x] Hover the intent tiles.
  - **Expect:** a slow, smooth lift with a soft shadow, a warm tint fading in and the dot growing; no snapping.
- [x] **Build**.
  - **Expect:** "Which project tonight?" every time, with each active project's next step, progress and "Last worked …"; one marked Suggested. "Start a new project" and "Or any Projects task →" below. With no projects it says "No projects yet." above the new-project button.
- [x] **Start a new project** from there → both steps → **Start the first step tonight**.
  - **Expect:** the check-in for that new project.
- [x] Choose a project → the check-in: tap 30 and Steady → **Show my focus →**.
  - **Expect:** "‹ Change · BUILD · 30 MIN · STEADY ENERGY", the "Working on" project chips, the focus card (lane · project tag, facts, done when, "Why this:"), and up to two alternatives from other lanes. The card appears once, with no blink or swap; if it's still loading you see a pulsing placeholder in its shape.
- [x] Press **Choose** on an alternative.
  - **Expect:** a toast, "Your chosen focus", and "Why this: You chose this one yourself."
- [x] **Small piece** and **Write** scope the focus to Showcases and Writing. With nothing fitting, you see "Nothing fits tonight." with Change tonight and + Add a task.
- [x] **Start focus**.
  - **Expect:** the focus overlay: orb and timer, a quote every 30 seconds (if on), the lo-fi row (if on; play opens the stream in a new tab). Reload: the session is still running.
- [x] Hover **Cancel session**: it brightens and keeps its underline (never dark). Cancel once (expect a toast, nothing recorded), start again, then **Finish**.
- [x] **Recap:** "Made progress", a next step, skills Motion and Frontend, an evidence link → save.
  - **Expect:** the reward: the bloom ripples and the grown petals glow. **Done** shows "Tonight is *done.*" with the session, the week dots and Catch an idea / 15 more minutes / See my bloom.
- [x] Do a **Blocked** recap on another task.
  - **Expect:** it asks what's blocking it; the task moves to Blocked.
- [x] **Offline save test:** open the recap, set DevTools → Network → Offline, press save.
  - **Expect:** the red failed card with **Retry save**; your text stays. Back online, retry saves.
- [x] **Gap card:** in an account whose last session was 3+ days ago, Today shows "N days since your last session", the last session and its next step, and **Pick up here** (after Made progress), **Unblock it in Work** (after Blocked) or "It's finished. Choose what's next below." (after Finished).
- [x] **Sunday:** on a Sunday, a mint card "Look back, then shape next week." → **Begin · 3 min** opens the review. Once next week is planned it shows "Week N is planned" with **Adjust**.
- [x] **Publish:** once evidence is Ready to share (B8), the Publish intent appears; it leads to the publish flow.
- [x] Account B with no tasks: Build → check-in → "Nothing's ready yet." and no invented work.

### B7. Ideas

- [x] Open Ideas.
  - **Expect:** capture buttons, a stage/Notebook/Archived chip row and idea cards.
- [x] Open an idea.
  - **Expect:** its brainstorm view (or "Not brainstormed yet"), with Make active, Keep as an idea, Edit brainstorm and notes, Archive.
- [x] **Edit brainstorm and notes**: add a hook, a smallest build, two skills. Try a reference like `javascript:alert(1)`.
  - **Expect:** saved; the bad reference is refused with a readable error.
- [x] **Make active**: pick a lane, a first step and done-when → save.
  - **Expect:** "It's in Work, *ready.*" with Back to Today and Open Work. The task is in Work.
- [x] On the active idea: **Move back to Ideas** (confirm). Make it active again with **Start a new project from this idea**.
- [x] **Archive** an idea and restore it from the Archived view.

### B8. Journey — Progress, Proof and the weekly review

- [x] Open Journey.
  - **Expect:** the header with Progress / Proof tabs (arrow keys switch them; the address changes).
- [x] **Progress:** the 12-month contributions graph (cells fade in; each has a date tooltip), streak and session chips, Mind Bloom for this month (month chips for earlier months), "Review & plan the week", This week, and the three latest sessions with **All sessions →**.
- [x] **All sessions** (`?view=history`): paginated history with skills and evidence, lane balance, estimates and suggestions, body of work and firsts, your weeks with reflections. **+ Add evidence** on an older session makes a Draft.
- [x] **Proof tab:** Draft / Ready to share / Published count tiles (they filter), "★ Portfolio candidates", evidence rows with **Open**.
- [x] Open a Draft: edit details, add a screenshot (PNG under 5 MB works; a PDF and an image over 5 MB are refused), **Mark ready to share**.
- [x] **Publish it**.
  - **Expect:** the header hides; step 1 Context → step 2 Where (chips, link, "Published on"; a future date is refused) → **Mark as published** → step 3 "It's out in the *world.*" → **Done** with a toast.
- [x] Back to draft, portfolio candidate toggle, Delete (with confirmation).
- [x] **Weekly review** (`/journey?view=review`, or Reflect on Today):
  - Look back: sessions against target, minutes, petal growth, a sentence about the week; write what you learned → Next.
  - Plan ahead: evenings 2–6 or "Plan a pause instead", line up a few steps, an intention → Next.
  - Your week: the summary → **Save my week**.
  - **Expect:** a toast and Today. The lined-up steps now rank first ("Lined up this week") and the prompt card can show your intention.

### B5a. Moving tasks without the timer (added 9 October)

- [ ] In Work, press **▶** on a Ready card. **Expect:** "Started …" and the card says In progress, with no timer.
- [ ] Press **✓** on an In progress card. **Expect:** the task sheet opens on "What changed? · optional" with skill chips. Add a note and two skills, then **Mark done**. **Expect:** it moves to Done; the Mind Bloom (Journey) grows for those skills.
- [ ] Open a task: **Blocked…** needs a reason, which shows as "Blocked by". **Unblock** asks for the next step.
- [ ] On an In progress task, use **Move back to Ready**. **Expect:** Ready again.
- [ ] Today → Build → **Show my focus**: under **Start focus** there are **Start without the timer** (Ready tasks) and **Done already?**. Both work without the focus screen.
- [ ] Start a focus session on a task, then try to mark it done in Work. **Expect:** "This task has a focus session running…".

### B8a. Assistants and the Inbox (added 9 October)

- [ ] Settings → **Assistants** → "Claude Code" → **Create a token**. **Expect:** the token and a ready-to-paste Claude Code command, shown once. After **Done**, only its first characters show in the list, with "not used yet".
- [ ] Run the command in a terminal, start `claude`, and ask "what should I work on tonight? 45 minutes, steady energy". **Expect:** the same focus Today would give, with its reason. The token now shows "last used".
- [ ] Ask Claude to log what you did. **Expect:** it says the session is waiting in your Inbox. Today shows "From your assistants · 1 waiting" with the session details. Journey and the week don't change yet.
- [ ] **Approve** it. **Expect:** "Logged to your Journey."; the task moves to In progress (or Done); Journey → All sessions shows "via Claude Code"; an evidence link becomes a Proof draft.
- [ ] Ask it to capture an idea, then **Discard** it. **Expect:** nothing appears in Ideas.
- [ ] Ask it to log work on a task that doesn't exist. **Expect:** a clear error, or a proposal with a new task if you said so.
- [ ] **Revoke** the token in Settings. **Expect:** Claude Code's next call fails with "Missing or unknown Becoming access token".
- [ ] In Account B, check that none of A's tasks show through a token made in A.

### B8b. Evening reminders (added 9 October)

- [ ] Settings → Evening reminder on. **Expect:** "By email" and "On this device" switches. Without `RESEND_API_KEY`, the email line says nothing is sent yet.
- [ ] Chrome on desktop: turn **On this device** on and allow notifications, then **Send a test notification**. **Expect:** a "Becoming" notification; clicking it opens Today.
- [ ] Turn it off. **Expect:** **Send a test** disappears (no devices).
- [ ] Leave reminders on and wait for your chosen time (7:30, 8:30 or 9:30 pm) on a day without a session. **Expect:** one notification (and an email, once Resend is set up). At most one per evening; none after you've saved a session; none in a planned-pause week.
- [ ] After deploying: on iPhone, Share → **Add to Home Screen**, open Becoming from there, and turn on **On this device**.

### B8c. Project constellation (added 9 October)

- [ ] Today → Inbox: the **Whole plan** item "Plan for Becoming: 12 phases, 44 milestones, 74 tasks, 12 docs". **Expect:** each phase listed with its milestone and task counts and how many are done, "Show all 12 phases", and the doc codes. **Approve**. **Expect:** "Plan added to the project."; Work → Projects shows Becoming.
- [ ] Work → Projects → **Visual**, Becoming selected. **Expect:** the overview as in the design: Genesis ("Started as a project", since no idea is linked yet), the orb with "N% FORMED", 12 docs, 12 phase rows with one cell per task (filled = done, outline = ready, red = blocked). The URL keeps `visual=1` on reload.
- [ ] Click a doc, then a phase. **Expect:** its edges and the phases or docs it connects light up, the rest dims, and the side panel describes it.
- [ ] Double-click a phase (or "Open phase NN ›"). **Expect:** the large hexagon with % and "N OF M TASKS", milestones as clusters (coded like 05A), tasks as cells. Click a cell for its story and timeline; ‹ › steps through phases; Back and the breadcrumbs return.
- [ ] Press play on the scrubber. **Expect:** the map rebuilds day by day from 15 September; dragging to the end shows today.
- [ ] Ideas → an idea's brainstorm: add a research thread with a source, a report with a finding, and a decision. Make it active into a new project, then open that project's Visual. **Expect:** Genesis shows the idea, research, report and decision.
- [ ] On the project page: add a phase, link a doc to it, and set a milestone's Phase. **Expect:** the Visual tab updates at once.
- [ ] At 390px wide the map scales down, then scrolls sideways; nothing overlaps. Under reduced motion nothing breathes or flows.
- [ ] Ask Claude Code "show me the constellation for Becoming" and "what's in phase 09?". **Expect:** answers that match the map.

### B9. Cross-cutting checks

- [x] **Isolation:** in Account B's window, every screen shows **none** of A's tasks, ideas, sessions, proof or settings. Then go the other way: a task created in B never appears in A.
- [x] **Real-time:** open Work in two tabs of Account A and create a task in one.
  - **Expect:** it appears in the other without a reload.
- [x] **Offline notice:** set DevTools → Network → Offline on any screen.
  - **Expect:** "You're offline…". Back online, it disappears.
- [x] **Phone layout:** open DevTools device toolbar (Ctrl+Shift+M) and test iPhone SE (375px) and a 320px width on every screen.
  - **Expect:** no sideways scrolling, the bottom pill navigation with **+** in the middle opening the capture sheet, and the avatar at the top right.
- [x] **Keyboard only:** put the mouse away and use Tab, Shift+Tab, Enter and Space through Today → start → recap → save.
  - **Expect:** a visible ember focus ring everywhere, nothing unreachable, and the outcome tiles working with the arrow keys.
- [x] **Reduced motion:** Windows Settings → Accessibility → Visual effects → Animation effects **off**, then reload.
  - **Expect:** no blooming, breathing or rising; states change instantly.
- [x] **Zoom 200%** (Ctrl and +): every screen is still usable.
- [x] **Screen reader (optional):** Windows Narrator (Ctrl+Win+Enter) on Today. The bloom and week dots should read out as text.

---

## Part C — Data controls (local, with throwaway accounts only)

> **Claude ran the backend side of C1–C5 on 8 October** against the dev deployment, using test identities rather than passwords (`npx convex run --identity`). It seeded an account (motive, rhythm, a project with a milestone, a task waiting on another, an idea, a recap with skills and evidence, a reflection, a weekly plan), then:
> - **C1:** exported it, and the export had every record.
> - **C2:** restored it into an empty account, with identical counts and every link rebuilt (prerequisite, project, milestone, weekly-plan steps, skills, the Draft proof, the motive).
> - **C3:** a second restore was refused and nothing was duplicated.
> - **C4:** a wrong format, a wrong version, a broken reference and a missing section were each refused, and nothing changed.
> - **C5:** deleting emptied the account in one batch.
>
> All test data was removed afterwards. In the screen, an invalid JSON or `.txt` file is refused before upload, with "That file isn't valid JSON, so it can't be a backup." Still yours: the clicks themselves (download, file picker, the Type DELETE button) and **C6**, which needs a real sign-in and password.

- [ ] **C1. Export (Account A):** Settings → Your data → Export.
  - **Expect:** `becoming-backup-YYYY-MM-DD.json` downloads. It contains your records (screenshots aren't included, but their links are). Keep it out of shared folders.
- [ ] **C2. Restore into an empty account:** create **Account C** (`qa-c@example.test`) and restore A's backup.
  - **Expect:**
    - a summary of what will be restored, and a note that profile settings will be replaced
    - after restoring, C has the same tasks (with prerequisites), projects and milestones (with the same completion dates), ideas (linked), sessions with skills, the Mind Bloom, proof, rhythm and reflections
- [ ] **C3. Restore twice:** try restoring the same file into C again.
  - **Expect:** a refusal, because the workspace isn't empty, and nothing is duplicated.
- [ ] **C4. A broken file:** restore a `.txt` file, or a JSON file with one character removed.
  - **Expect:** a readable refusal, and nothing changes.
- [ ] **C5. Delete workspace data (C):** Settings → Your data → Delete workspace data, type `DELETE`.
  - **Expect:** the button stays disabled until DELETE is typed; then everything is gone and C can still sign in.
- [ ] **C6. Delete account (C):** Delete account, type `DELETE` and enter the password. First try a wrong password.
  - **Expect:** with the wrong password nothing is deleted. With the right one you're signed out and sent to Account, and signing in as C fails.
- [ ] **C7. Clean-up:** delete Account B the same way. Keep Account A until the end of local testing; delete it once you're done.

**When Parts B and C pass:** send me your bug list, or "all clear". I'll fix anything found, re-run `npm run check` and `npm run build`, and tell you which steps to repeat.

---

## Part D — Deployment (only when you decide to go)

These are the steps for the recommended set-up: **Vercel** for the Next.js app, plus a separate **Convex production** deployment for data. Hosting hasn't been formally chosen yet (see STACK_DECISIONS), so tell me if you prefer something else.

> **Production gate:** email verification, password reset and Google sign-in exist (9 October). Production Convex also needs a new pair of `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK` for notifications (AUTH_SETUP.md). Production needs `RESEND_API_KEY` on Convex, or sign-up is refused. Without a verified domain in Resend, email only reaches your own Resend address: fine for **your own use**, not for friends yet. Google needs its production redirect URI and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on production Convex.

- [x] **D1. Commit and push.** Done 10 October 2026: nine commits on `main` (`8f4f195` to `cd17634`), pushed to GitHub (`VimalKManoj/becoming`).
> **Deployed 10 October 2026:** **https://becoming-evenings.vercel.app** (Vercel, from `main`), on Convex production `uncommon-goat-661`.
> - **Production Convex variables:** `BETTER_AUTH_SECRET` (new, made by a script that never prints it), `RESEND_API_KEY` (a sending-only key) and `SITE_URL`.
> - **Vercel variables:** `CONVEX_DEPLOY_KEY` (only `deployment:deploy` permission, no expiry), `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`. `NEXT_PUBLIC_SITE_URL` isn't read by the app, so it isn't set.
> - **Left for later, by choice:** notifications (no production VAPID keys, so reminders send email only) and Google sign-in (no OAuth client, so its button stays hidden).
> - **Email:** without a verified domain, Resend only delivers to the address the Resend account was made with, so create your production account with that email.
> - **Smoke test (D6), checked by Claude in the browser:** `/` → `/today` with the sign-in prompt; `/account` shows the sign-in form; `/design-preview` and `/cx-preview` answer 404; `/api/auth/get-session` answers 200; the bundle points at `uncommon-goat-661`; production shows all 19 app tables.

- [x] **D2. Create the Convex production deployment.**
  1. In the Convex dashboard, open the **becoming** project and select **Production**. It's created on first use.
  2. Go to Settings → **Deploy keys** and generate a **production** deploy key.
  
  Copy it straight into Vercel in D4; don't save it anywhere else.
- [x] **D3. Set the production Convex environment variables.**
  1. Generate a **new** secret, different from dev: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  2. In the dashboard (Production → Settings → Environment Variables), set:
     - `BETTER_AUTH_SECRET` = that secret
     - `SITE_URL` = your final app URL, for example `https://becoming-xxxx.vercel.app`. You can fill this in after D5 once you know the URL, then redeploy.
- [x] **D4. Create the Vercel project.**
  1. Import the GitHub repo. Framework: Next.js.
  2. **Build command:** `npx convex deploy --cmd 'npm run build'`. This pushes the Convex functions and schema to production, then builds the app against them.
  3. **Environment variables** (Production environment only):
     - `CONVEX_DEPLOY_KEY` = the production deploy key
     - `NEXT_PUBLIC_CONVEX_URL` = the production `https://<name>.convex.cloud` address
     - `NEXT_PUBLIC_CONVEX_SITE_URL` = the production `https://<name>.convex.site` address
     - `NEXT_PUBLIC_SITE_URL` = your app URL
  4. **Preview deployments:** turn them off for now (Settings → Git), so branch previews never build against production data.
- [x] **D5. Deploy.**
  - **Expect:** the build log shows Convex pushing functions, then `next build` finishing with the route list.
  - If `SITE_URL` wasn't known in D3, set it now and redeploy.
- [x] **D6. Smoke test (2 minutes).**
  - The app URL redirects to `/today` and shows the dark sign-in card.
  - `/account` loads.
  - `/design-preview` answers **404**: sample pages never appear in production.
  - The Convex dashboard (Production) shows the tables and functions.

---

## Part E — First use in production

- [ ] **E1.** Create **your real account** with a strong, unique password (use a password manager).
- [ ] **E2.** Settings: motive, timezone and weekly target.
- [ ] **E3.** Add real tasks and projects, or restore a backup. Restore only works into an empty account, so do it straight after creating the account if you want your local data.

---

## Part F — QA on the deployed app

Repeat the critical path from Part B, then the production-only checks.

**Critical path** (with your real account, plus one throwaway production account for isolation):
- [ ] Sign up, sign out and sign in (B1).
- [ ] Settings: motive, rhythm and lane (B2).
- [ ] Work: a task, a project with a milestone, a prerequisite and a pin (B3–B4).
- [ ] Ideas: capture via Ctrl+K, then Make active (B5).
- [ ] Today: dial, start, orb, recap with skills and evidence, then check the bloom and week dots (B6).
- [ ] Proof: ready, publish, a screenshot upload (a real PNG) (B7).
- [ ] Journey: bloom, rhythm, history (B8).
- [ ] Export a backup and keep it safe (C1).

**Production-only checks:**
- [ ] **On your phone** (real device, mobile data and Wi-Fi):
  - sign in
  - the bottom pill navigation, and **+** for capture
  - a full session from start to recap
  - Proof screenshot upload from the camera roll
  - **Expect:** the timezone is correct and the week dots land on the right day.
- [ ] **Two devices:** with Today open on your laptop, start a session on your phone.
  - **Expect:** the laptop switches to the running session on its own.
- [ ] **Sign out on one device:** the other device stays signed in until its own session ends.
- [ ] **HTTPS:** a lock icon, no mixed-content warnings in the console, and sign-in survives a browser restart.
- [ ] **Isolation:** the throwaway production account sees none of your data. Afterwards, delete it from Settings (C6).
- [ ] **Logs:**
  - The Convex dashboard → Production → **Logs** shows no repeated errors while you test.
  - Vercel → the project → **Logs** shows no 500 errors.
- [ ] **Speed:** Chrome DevTools → Lighthouse (mobile) on `/account` and `/today`. Note the Performance and Accessibility scores; Accessibility should be 90+.
- [ ] **Backups:** export again at the end, and store it somewhere private.

---

## What Claude does alongside your testing

| When | What I run or do | Why |
|---|---|---|
| Before you start (now) | `npm run check` and `npm run build`. All green at 113 tests | Baseline |
| After A5 (sync) | Re-run `npm run check` against the regenerated types, if you tell me it synced | Catch type drift |
| While you test locally | Fix each bug you report, add a test for it where possible, and re-run the checks | Each fix verified |
| After fixes | List exactly which plan steps to repeat | No full re-test needed |
| Before D1 | Propose commit groups and messages (no attribution trailer); final check and build | Clean history |
| D2–D5 | Only with your explicit go: walk through each setting with you and check the build log you paste (secrets removed) | Production safety |
| After D6 | Check the live site's signed-out pages, titles, the 404 previews and phone layout in my browser (with your permission for the URL) | Independent smoke test |
| After Part F | Turn your findings into fixes, and update PLAN, LEARNING_LOG and the trial guide | Shared record |

**Optional extra:** I can add Playwright end-to-end tests that drive a real browser through sign-up → task → session → recap → proof on a local disposable account, run with `npm run e2e`. That means one new development dependency, so it needs your approval first.

---

## Bug report template

```text
Where:    (local or live) · screen · width (desktop / 375 / 320) · account (A/B/C/real)
Step:     plan step number, e.g. B6 "Recap with Made progress"
Did:      what you clicked or typed (no passwords)
Expected: what this plan said
Saw:      what happened (copy any red console error text)
Screenshot: optional, with no private data visible
```
