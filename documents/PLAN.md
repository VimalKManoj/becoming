# Becoming — full app plan and learning checkpoints

Updated: 2 October 2026 (product phases). Follow ../agent.md for the working agreement.

## Product direction

An independent design-engineering practice app: choose useful daily work, balance projects/showcases/writing, develop ideas, capture evidence, and build a portfolio. Flexible sessions replace a rigid timetable. Gamification supports meaningful progress. Convex is the intended backend; future friends get private personal workspaces. Open-source release comes later.

## Current truth

| Area | Implementation | Verification | User review |
|---|---|---|---|
| Independent Next.js scaffold and documents | Present | Build/checks recorded 15 Sep | Walkthrough pending |
| Earlier browser-local prototype | Source removed 2 Oct with your approval (still in Git history at 542b6f3); data already in a browser profile is untouched | 8 historical prototype tests recorded 15 Sep | No import planned for fresh cloud start |
| Convex task persistence | `/work` uses owner-scoped paginated Convex list/create/edit | Unit authorization tests and two-account browser flow verified 24 Sep | User review pending |
| Shared client and workspace shell | One Convex client for the whole app (root layout); a `(workspace)` route-group layout holds the sidebar, top bar and one sign-in gate; per-section tab titles; name is Becoming | Browser, signed out, 2 Oct: same client and sidebar across five navigations; build passes | User review pending |
| Task and idea lifecycle | Work views (Active/Blocked/Done/Archived); unblock, reopen, archive/restore tasks; archive/restore ideas | 33 tests, build and development sync 2 Oct; signed-in browser review pending | User review pending |
| Better Auth email/password | Implemented on /account in development | Browser flow and backend identity verified 17 Sep | Pending |
| Cloud Today and session lifecycle | Signed-in Today recommends owned feasible Work tasks and calls Convex start/cancel/recap; time/energy are temporary UI state | 17 tests, development sync and live start/reload/cancel/recap check 24 Sep | User review pending |
| Cloud Ideas | Signed-in notebook capture/edit and deliberate one-time task activation | 18 tests, development sync, and browser create/edit/reload/activate/Work checks 25 Sep | User review pending |
| Cloud Journey history | Signed-in, paginated saved recaps with lane counts over visible results | 19 tests and development sync 29 Sep; browser review pending | User review pending |
| Cloud Proof gallery | Signed-in, paginated recap evidence with linked session context | 21 tests and development sync 29 Sep; browser review pending | User review pending |
| Cloud Settings motive | Signed-in profile motive saved in Convex and shown across the sidebar | 22 tests, development sync and build 29 Sep; browser review pending | User review pending |
| Small gaps and quick wins | Today's honest empty states; Active view uses one index range with In progress first; last-time card, pick-up-here, elapsed time, planned vs actual, evidence in Journey, remembered capacity | 105 tests, build, signed-out browser checks 2 Oct | User review pending |
| 4A weekly rhythm | Timezone and weekly target (first applies now, later changes next Monday), planned pauses, streaks, week strip, Journey weeks and reflections | Same | User review pending |
| 4B Proof workflow | Edit, Draft/Ready/Published (link and date required), portfolio candidates, screenshots (Convex storage), evidence for past sessions | Same | User review pending |
| 3A projects and milestones | Projects, ordered milestones with derived completion, task links, Today excludes inactive projects, case-study Markdown | Same | User review pending |
| 3B ideas and prerequisites | Structured brainstorm, idea stages, activation with project or smaller step, move back to Ideas, prerequisites with loop checks | Same | User review pending |
| 3C recommendations | Pinning, swap reasons, lane preference, bounded candidate pool, Journey insights | Same | User review pending |
| 4C delight | Lifetime counts, firsts, 12-week activity calendar, save celebration (reduced-motion aware) | Same | User review pending |
| 5A data control | JSON export, all-or-nothing restore into an empty workspace, batched deletion, account deletion | Same | User review pending |
| 5B interface quality | Contrast fixes (muted text, field borders), compact phone navigation, offline notice | Contrast measured; 320px checked signed out | User review pending |
| Ember Glass redesign | The owner's design across every screen: rail and pill navigation, serif headline and quick capture, Today's dial, focus card, orb and outcome recap, Mind Bloom from tagged skills, proof pipeline, milestone timeline; Work, Ideas, Proof, Journey, Settings and Account rebuilt in the same system; dev-only preview pages | 113 tests, build, preview pages checked at 360px and 1440px 2 Oct; signed-in review pending | User review pending |
| Ritual redesign | The owner's *Becoming Ritual* flow (direction 2a) replaces Ember Glass: Today asks "What's on your mind tonight?", then which project, a ten-second check-in and one focus with explicit alternatives; focus, recap, reward and "Tonight is done"; gap and Sunday cards; 5-step onboarding; quick capture and new-project sheets; Work lanes and project page with a task sheet; Ideas brainstorm and Make active; Journey Progress (12-month contributions, bloom, week) and Proof (3-step publish flow), the 3-step weekly review with lined-up steps; Settings with a side nav, reminder and focus preferences. Proof moved under Journey (`/proof` redirects). Dev-only preview pages removed | 126 tests, typecheck, lint and build 6 Oct; signed-out browser check only (signed-in screens not yet seen) | User review pending |
| Email verification, password reset, Google sign-in | Sign-up confirms the email (Resend, or the Convex logs locally), "Forgot password?" with an emailed reset link, "Continue with Google" once its OAuth client is set; Google-only accounts can be deleted without a password | 130 tests, typecheck, lint 9 Oct; screens checked signed out; sending real email and Google need your Resend key and Google client | User review pending |
| Assistants (MCP) and the Inbox | Becoming as an MCP server at `/mcp` on the Convex site: reads (tonight's focus, projects, tasks, week, sessions) and proposals (log work, add task, idea, milestone, next step) that wait in the Inbox on Today until approved; access tokens in Settings → Assistants; Journey shows "via Claude Code". Claude app and ChatGPT (OAuth) after deployment | 135 tests, typecheck, lint 9 Oct; end-to-end on the dev deployment with a test identity (reads, proposals, approval, revoke) | User review pending |
| Evening reminders that send | Every 15 minutes, people whose chosen time just arrived (their timezone, chosen days, no session yet today, no planned pause) get one email (Resend) and a notification on each device that turned it on (Web Push, no package); installable app with icons for iPhone | 139 tests, build 9 Oct; push signing checked on the dev deployment; email needs `RESEND_API_KEY`, phones need the deployed https address | User review pending |
| Tasks you move freely (Phase 1 of PLAN-tasks-and-focus) | Start / Done / Blocked / back to Ready anywhere, with no timer: a one-tap Start or ✓ on Work's cards, the task sheet's status buttons, Start without the timer and Done already? on Today's focus card; an optional "what changed" and skills when finishing; every move recorded in `taskEvents`; finished tasks grow the bloom | 144 tests, build 9 Oct | User review pending |
| Project constellation (PLAN-project-constellation, C1–C6) | Work → Projects → **Visual**: one project as a living map, matching the owner's design. Genesis (idea, research, report, decision), the project orb, docs and the phases they feed, one hexagon cell per task; phase and genesis levels; a side panel; replay from real dates. Phases and docs are edited on the project page; research, report and decision in Ideas → brainstorm. Claude keeps it current through new MCP tools, and `import_plan` sends a whole plan as one Inbox item. Becoming's own plan is waiting in the Inbox | 165 tests, typecheck, lint and build 9 Oct; the three levels checked against the design's data at 1440px; signed-in walkthrough pending | User review pending |
| Friends, production, open-source release (6A–6C) | Not started by design | — | Future phases |

Existing work is a starting point, not automatically accepted scope. Historical checks are not fresh verification. The prior roadmap is preserved as PLAN-2026-09-15.md.

## How we will proceed

Each numbered subphase is one small delivery: explain → discuss → implement → verify → teach back → user review. No automatic transition to the next subphase. Timeboxes may be estimated when a phase is agreed; they are not calendar deadlines.

## R — review the foundation together (available; review still pending)

**Outcome:** you can explain what is already built and decide what to keep.

- [ ] R1: walk through package.json, routes, layout, styling and the difference between the app and prototype.
- [ ] R2: trace one session from Today through `tasks.startSession` and `tasks.recordSession` to Journey, then reload it. (Until 2 Oct this traced the browser-local store, which has since been removed.)
- [ ] R3: review the Convex schema and clearly separate prepared code from working cloud features.
- [ ] R4: agree on the next subphase and record accepted changes or simplifications.

**Files:** src/app/layout.tsx, src/app/(workspace)/layout.tsx, src/app/(workspace)/[section]/page.tsx, src/components/workspace-shell.tsx, src/components/cloud-today-screen.tsx, convex/tasks.ts, convex/lib/recommend.ts, convex/schema.ts.

**Decisions:** keep or simplify the initial UI; identify what the user wants to implement themselves. No new dependencies or accounts.

**Exercise:** explain where a session is saved and why completing a smaller step leaves its parent unfinished.

**Review gate:** the user understands the foundation and explicitly chooses the next subphase. No implementation is required to complete this walkthrough.

## Review fixes — 1–2 October 2026 (implemented; user review pending)

**Outcome:** the fourteen issues from the 1 October review are fixed, and the task loop has no dead ends. The user chose the name Becoming and all four optional parts: lifecycle and archive, removing the old browser-local code, the Next.js patch, and syncing to Convex development. Together with the pending 2E/4B/2F work, it was committed in six logical groups and pushed on 2 October (e0a16c5 to 287e948).

- One Convex client for the whole app, instead of a new one on every section change (verified in the browser). The `(workspace)` route-group layout keeps the sidebar and the single sign-in gate mounted across sections.
- Work views: Active, Blocked, Done, Archived. Tasks can be unblocked (to Ready, with a next step), reopened (to In progress), archived and restored (to their previous status). Ideas can be archived and restored, and an archived idea can't be activated.
- Today keeps its controls on screen while results update. The recap keeps your text on Back and resets for each session. Reasons come from one tested ranking module, `convex/lib/recommend.ts`. Finishing a smaller step asks for the parent's real next step.
- The motive can be cleared. A shared error helper reads `ConvexError` data. Next.js 16.3.8 fixes a critical audit advisory. `model.ts` and the unrouted local workspace are gone; `weekKey` moved to `convex/lib/time.ts`.

**Schema:** additive only. Task status gains `Archived`, plus optional `tasks.archivedFrom` and `ideas.archivedAt`. No migration.

**Verification (2 Oct):** TypeScript, ESLint and 33 tests pass, the build passes, and the development deployment is synced. Signed-out browser checks were run. Signed-in screens still need your walkthrough.

**Exercise:** recap a disposable session as Blocked, unblock it in Work, and confirm Today offers it again while Journey still shows the blocker. The details are in the ignored `documents/phase-learning/phase-review-fixes.md`.

## 0 — foundation and visual ownership

**Status:** baseline implemented; user review pending.

**Scope:** independent app, six routes, shared shell, editable design tokens, TypeScript, lint/tests, environment template and documents.

**Learn:** App Router, server/client boundaries, components, styling and lockfiles. Next.js provides routing/builds, React provides the interface, TypeScript checks types, Tailwind/CSS handle styling. Lucide supplies icons; Zod validates runtime input; ESLint/Vitest check code and behaviour.

**Decisions:** discuss any replacement of the initial stack or component system before adding it. The UI is deliberately revisable.

**Gate:** install and build independently; show where to change a route and design token. **Exercise:** change one visual token and inspect desktop/mobile.

## 1 — a useful evening, locally

**Status:** baseline implemented; user review pending. Cloud parity is not complete.

**Scope:** capacity and energy → recommendation → start → recap → next step. Include idea capture/activation, task creation, blocking, evidence links, weekly counts and local export.

**Learn:** pure functions, state transitions, validation, persistence and hydration.

**Rules to review:** prerequisites exclude work; large tasks only fit through explicitly defined smaller steps; unfinished sessions need resumption context; duplicate recap IDs cannot award credit twice; completed smaller steps cannot keep resurfacing.

**Gate:** task choice fits capacity, a recap persists across reload, blocked work leaves the candidate pool, and errors do not silently discard data.

**Exercise:** add one recommendation test. **Evidence:** capture a short Today → recap demo and one explained design decision.

## 2 — Convex, one real flow at a time

**Status:** schema and starter functions prepared. Phase 2A: user selected Better Auth with Convex on 16 September; TanStack excluded. Development email/password integration verified 17 September, with the approved temporary provider type exception documented in STACK_DECISIONS.md. See STACK_DECISIONS.md. Phase 2B connection checkpoint completed: existing becoming cloud development project linked, starter functions/schema synced, and anonymous task reads rejected. Better Auth email/password integration and signed-in behaviour verified in development; user review pending.

### 2A — backend and identity decision

Explain documents, IDs, indexes, queries, mutations and actions using our tables. Compare authentication options with current official documentation when this subphase starts. Discuss developer experience, extra services, account requirements, portability and maintenance. Choose a provider with the user before installation.

**Gate:** user can explain Next.js versus Convex responsibilities and selects the auth approach. **Exercise:** identify which operations are queries, mutations or actions.

### 2B — development connection and sign-in

**Status (17 September):** implemented and verified in development. Registration, sign-in/out, reload, wrong-password handling, trusted Convex identity, and anonymous task rejection pass. Nine tests, lint, TypeScript and production build pass. Email verification/recovery and two-account data isolation remain future gates. User review is pending.

Create/configure the user's development deployment through their account, generate official API types, set up authenticated providers and explicit sign-in/loading/error states. Keep dev and production separate. Never copy the portfolio's credentials.

**Gate:** trusted identity reaches Convex; unauthenticated calls fail; no owner ID is accepted from the browser. **Exercise:** inspect one authenticated function in the dashboard.

### 2C — tasks with real persistence

**Status (24 September):** implemented and verified in development; user review pending. `/work` requires a valid Better Auth/Convex identity and is the only cloud task source. It supports reactive paginated listing plus create/edit for title, lane, effort, energy, done condition and an optional three-part smaller step. New tasks start `Ready`. Status changes and focused sessions remain Phase 2D.

Connect owner-scoped task create/list/edit queries and mutations. Use typed generated API references, server-side validation and useful error messages. Add pagination rather than treating the starter 200-record cap as complete behaviour.

**Gate evidence:** reload persistence and two-tab reactive updates verified; Account B cannot list Account A's records, the backend rejects a foreign edit and foreign project reference, and pagination was tested. Signing out also changed the other open Work tab to its account gate. **Exercise:** trace a task form through the mutation to the subscription update.

### 2D — session parity and migration

**Cloud Today slice status (24 September):** implemented and verified in development; user review pending. One active session per owner, start/cancel/recap, owner checks, status updates, replay-safe recap and optional evidence are in Convex. A Work task may have an optional smaller action, minutes and done condition. Today now recommends from owned cloud tasks, shows an active focus after reload, and saves or cancels through Convex. Capacity and energy are temporary screen state. The user chose Convex for meaningful app data. Existing browser-local data was not imported or deleted; the fresh-start choice was settled on 25 September.

Add server-backed start/cancel/recap, smaller-step snapshots, contribution evidence and transactional idempotency. Discuss whether to import local records or begin with an empty cloud workspace. An import requires ID mapping and batch deduplication, never an automatic raw upload.

**Gate:** full local-session behaviour works on Convex; duplicate/invalid writes are rejected; migration is deliberate; two-account and reload checks pass. **Evidence:** diagram and demo of a reactive, authenticated session flow.

### 2E — cloud Journey history foundation

**Status (29 September):** implemented and verified by static checks, owner-isolation/pagination tests, and development sync; browser review pending. `/journey` now requires sign-in and reads saved Convex recaps. The screen shows recent contributions and lane counts for the sessions loaded so far; it does not claim an all-time total, weekly target, or streak. Cancelled sessions create no recap and do not appear. No schema or dependency change was needed.

**Gate:** a Today recap appears for its owner in Journey, older pages load, and another account cannot see it. **Exercise:** finish a disposable session in Today, open Journey, then sign out and confirm the account gate appears.

### 2F — cloud Settings motive foundation

**Status (29 September):** implemented and verified by static checks, owner-scoped profile tests, development sync and local build; signed-in browser review pending. `/settings` requires sign-in and saves the motive to an owner-scoped Convex profile. The shared sidebar subscribes to that motive across all six workspace screens. `profiles.timezone` and `weeklyTarget` became optional so a new account does not receive invented defaults; existing values remain untouched. The old browser workspace is preserved but no longer mounted. The browser-only export button was removed from the routed Settings page because it did not export cloud work.

**Gate:** save motive, reload and navigate; the same account sees it while another account does not. The UI must not imply weekly targets or cloud export work yet. **Exercise:** trace `CloudSettingsScreen` → `settings.saveMotive` → `profiles` → `WorkspaceSidebar`.

## 3 — projects, ideas and recommendation refinement

**Status:** 3A, 3B and 3C implemented 2 October; see each section. Signed-in review is pending.

### 3A — projects and milestones

Add create/edit/archive for projects and milestones, link tasks, derive understandable progress and preserve historical references. Decide together whether milestones need a separate view.

**Gate:** archiving does not create dangling references or ready recommendations from archived projects. **Learn:** typed relationships and derived state.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- Work has a Projects view: create, edit, Mark done, Archive, Make active.
- Ordered milestones: add, edit, move, remove. Removing one unlinks its tasks, so nothing is left dangling.
- Each project's tasks are grouped by milestone. Progress shows counts as well as a percentage.
- Milestone completion is derived from its tasks.
- Only Active projects feed Today. Sessions snapshot their project.
- A case-study draft (Markdown, copy or download) is assembled from saved records. See `documents/phase-learning/phase-3A-projects.md`.

### 3B — notebooks and ready work

**Bounded Ideas slice status (25 September):** implemented and verified in development; user review pending. `/ideas` now requires sign-in and uses owner-scoped Convex pagination, capture, note edits and one-time activation into a linked Ready task. The user chose to start fresh in Convex and preserve old browser data; no import or deletion occurred. Broader idea states, reverse activation, project fields, smaller-step editing at activation and prerequisite-cycle editing remain proposed for later review.

Persist brainstorm fields/references, reversible activation and links to original ideas. Add editable tasks, smaller steps and prerequisite-cycle validation. Split the initial large screen component into focused feature modules while changing these flows.

**Gate:** saving an idea does not schedule it; activation creates the intended linked task once. **Exercise:** follow an idea through to its first session.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- Ideas can be edited in full: title, lane, notes and structured brainstorm fields.
- A stage is shown: Captured, Brainstorming, Active or Archived.
- Activation can add a smaller step and link a project or milestone, or start a new project from the idea.
- "Move back to Ideas" archives open work and unlinks it.
- Tasks have editable prerequisites, with server checks against self-links, archived links and loops.

### 3C — balanced suggestions

Review the last-six-session approach using actual usage. Discuss lane weighting, user pinning, swap reasons, infeasible tasks and no-candidate states. Explain every recommendation; avoid inventing tasks or using an AI score.

**Gate:** test neglected lanes, consecutive same-lane sessions, dependencies, low capacity and explicit user selection. **Evidence:** a technical breakdown of one rule and its trade-off.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- A pinned task comes first whenever it fits. When it doesn't, Today explains why.
- Choosing an alternative asks an optional one-tap reason, recorded with the session.
- Settings can favour one lane slightly; it counts as one session fewer.
- Today reads a bounded candidate pool.
- Journey shows accepted vs swapped suggestions.

The rule review with real usage belongs to the 5C trial.

## 4 — meaningful motivation and portfolio evidence

**Status:** 4A, 4B and 4C implemented 2 October; see each section. Signed-in review is pending.

### 4A — weekly commitment and streaks

Agree on what counts as a session, week boundaries, planned pauses and target effective dates. Store immutable historical commitments; derive streaks from records. Test midnight/timezone transitions, missed/paused weeks and edits.

**Gate:** changing a target does not rewrite past awards; rest creates no overdue backlog or fake progress. **Learn:** temporal data modelling. **Exercise:** explain a paused-week example.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- **Rules:** Monday to Sunday in the saved timezone. Every saved recap qualifies.
- **Targets:** the first target applies this week; later changes start next Monday.
- **Pauses:** this week or next. A pause neither adds to nor breaks a streak.
- **Where it shows:** a week strip on Today, and weeks, streaks and reflections in Journey.
- **Implementation:** week maths runs in the browser with tested pure functions, including daylight-saving weeks.

### 4B — proof and publishing workflow

**Bounded cloud Proof gallery status (29 September):** implemented and verified by static checks, owner-isolation/pagination tests and development sync; browser review pending. `/proof` now requires sign-in and reads owned Draft artifacts created from Today evidence links, with contribution, lane, outcome and date from the owned source session. It does not edit artifacts or mark them Ready/Published. The old browser-local Proof remains preserved but is no longer routed. No new schema field or dependency was needed.

Build artifact editing, draft/ready/published status, publication links, portfolio candidates and links to originating sessions/projects. Publication status is tracking, not an external posting action.

**Gate:** a published record has a valid link; evidence remains attributable; nothing is posted automatically. **Evidence:** one completed component with its design/code/process notes.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- Proof has views: All, Drafts, Ready to share, Published and Portfolio candidates.
- Each piece of evidence has editable details: title, link, notes and skills.
- Published needs a valid link and a date that isn't in the future, and moving back clears both.
- A portfolio-candidate flag.
- Screenshots in Convex storage, limited to PNG, JPEG, WebP or GIF of up to 5 MB and checked against server metadata.
- Journey's "Add evidence" attaches evidence to a past session.

Nothing is ever posted.

### 4C — optional delight and assets

Discuss uploads, badges and a subtle celebration or garden only after the useful loop works. Verify file ownership, type/size limits and reduced-motion behaviour before shipping uploads/animations.

**Gate:** progress signals reflect real records, and all interactions remain accessible. No XP economy or mandatory daily posting by default.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- Journey shows lifetime counts and a "firsts" timeline, both derived from records, so nothing is awarded twice.
- A 12-week activity calendar works as a table, with a text label on every day and paused weeks named.
- A short check-mark celebration plays when a session is saved, and is turned off under reduced motion.
- Screenshot uploads shipped in 4B. There is no XP or badge economy.

## 5 — reliability, redesign and real use

### 5A — data control

Complete export/restore, migrations, account deletion and recovery. Test malformed backups, version mismatches, duplicate imports, interrupted operations and owner isolation. Select archive/delete semantics together.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- **Export:** JSON with original IDs. Screenshots aren't included; their evidence links are.
- **Restore:** only into an empty workspace, in one transaction, with every link rebuilt. Each record passes the same rules as the form that created it (lengths, links, smaller steps, brainstorm, publication date). Rules that span records are checked before anything is written: repeated IDs, prerequisite loops, self-links, more than 10 prerequisites, a milestone from another project, an idea pointing at another idea's task, a publication date in the future, two commitments or reflections for one week, and a malformed timezone. Milestone completion is checked against the restored tasks (a true date is kept, a missing one filled in, a wrong one cleared). An archived prerequisite is allowed, because real data can contain one. Restoring replaces the profile settings (motive, timezone, target, preferences) of an account that has nothing else yet. Another format, another version and broken references are refused too, and a failure changes nothing.
- **Delete workspace data:** in batches, including screenshots.
- **Delete account:** confirms the password first, then data, then the Better Auth user.
- **Not done:** password recovery needs an email provider (production gate, 6B).

### 5B — interface quality

Refine the user's chosen design with keyboard access, focus management, contrast, mobile layouts, reduced motion, meaningful loading/empty/error states and performance checks. New UI/motion libraries require discussion first.

**Status:** Implemented 2 October and verified by automated tests, typecheck, lint and a production build; your signed-in walkthrough is pending. Committed and pushed 10 October.
- **Contrast**, measured with the WCAG formula:
  - Muted text now passes 4.5:1 on every background (light #5b6b5f).
  - Fields, chips and secondary buttons use a `--field-line` border (#768478 light, #809181 dark) that passes 3:1 against paper, surface and the soft panel background in both themes.
- **Phone navigation:** one scrolling row instead of two wrapped rows (124px instead of 186px), keeping the current section in view.
- **Offline notice:** shown when the Convex connection drops.
- Focus moves into every in-card form, and every view has loading, empty and error states. No library was added.

### 5C — two-week personal trial

Use the app and collect recommendations accepted/swapped, planning effort, work completed across lanes and maintenance overhead. Decide whether telemetry is needed; do not add analytics silently. Make focused changes based on evidence.

**Status:** ready for you to run. The app now records what the trial needs, without analytics:
- whether each session followed the suggestion, and the swap reason;
- planned vs actual time;
- lane balance, weekly results and reflections.

See `documents/TRIAL_GUIDE.md` for what to note each evening and what to review at the end.

**Gate:** the app reduces decision effort and helps finish work. **Exercise:** explain one design change based on observed use. **Deliverable:** an honest portfolio case study with before/after evidence and limitations.

## 6 — friends and open-source release

### 6A — repository readiness

Choose the license, public/private visibility, contribution model and private security-reporting channel with the user. Add CI, clean sample data, fresh-clone setup instructions, screenshots and architectural notes. No license has been chosen yet.

### 6B — production deployment

Choose frontend hosting, set up separate production Convex/auth configuration, and document limits/cost considerations and rollback. Verify sign-in, real owner isolation, exports/deletion and production error states. Publishing requires the user's go-ahead.

### 6C — small friend pilot

Friends receive separate private workspaces, not shared team data. Invite only when authorized; collect feedback and fix concrete problems before broadening scope.

**Gate:** fresh setup is reproducible, no personal data or credentials are in the repository, and multi-account tests pass. **Learn:** releases, environment separation, contribution workflow and support.

## 7 — optional connections, after the core proves useful

Structured assignment import, context export for ChatGPT, scheduled-task integration, GitHub/Figma references and publishing helpers are separate proposals. Recheck current platform capabilities, privacy and costs before selecting an integration. Preserve the existing ChatGPT assignment schedule unless the user requests a change. No model API is required by the core product.

## Phase handoff checklist

- [ ] Outcome and exact scope explained before implementation.
- [ ] Meaningful decisions discussed and recorded.
- [ ] Changes and data flow explained with relevant files.
- [ ] Actual verification and unverified areas reported.
- [ ] Plan, architecture/database notes and learning log updated as needed.
- [ ] One exercise or manual check provided.
- [ ] User review received before the next subphase begins.

**Current checkpoint (2 October, product phases):** implemented and verified by automated tests, typecheck, lint and a production build, but not yet tested by you while signed in:
- small gaps and quick wins;
- phases 4A, 4B, 3A, 3B, 3C and 4C;
- phases 5A and 5B.

Committed and pushed on 10 October 2026 as nine commits (`8f4f195` to `cd17634`), together with everything built up to 9 October: the Ritual redesign, email and Google sign-in, assistants and the Inbox, reminders, tasks that move freely, the project constellation, and project archive and delete.

**Before testing,** run `npm run backend` once. It pushes the additive schema and the new functions to your development deployment; nothing was synced for you this time.

**Suggested walkthrough order:** Settings (rhythm, lane preference), Today, Work (tasks, then projects), Ideas, Proof, Journey, then data export in Settings.

**Then:** the two-week trial (5C, `documents/TRIAL_GUIDE.md`). Phase 6 (open-source readiness, production, friend pilot) is deliberately not started.

The app and tab titles say Becoming, while the folder and package name are still `form` / `form-workspace`. The old browser data stays in its browser profile; its code is removed. R1–R4 are not retroactively marked reviewed.

## Detailed learning handoffs

As requested on 17 September, each phase also requires a detailed local chapter under documents/phase-learning/. Use PHASE-TEMPLATE.md: explain all changed files, important code, decisions/alternatives, complete flows, checks and exercises. Backfilled historical chapters are labelled from recorded evidence; future chapters are proposals. Preserve personal notes. The notebook is ignored by Git. Phase 2C's chapter records its actual implementation; user review is still pending.
