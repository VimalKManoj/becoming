# Learning log

## 15 September 2026 — foundation and local core loop

### What changed

Created Form as an independent Next.js app with six routes, a token-based visual foundation, local validated storage and pure recommendation/session logic. Preserved the PRD and original prototype. Added a Convex schema and authenticated starter task functions, without creating a cloud deployment.

### Why this sequence

You can redesign and use the flow immediately, then learn exactly what moves from browser storage to server-authoritative Convex functions. The local learning mode is clearly labelled so it is not mistaken for cloud persistence.

### Trace a feature

1. Open Today and change capacity.
2. `recommend()` filters effort, energy, prerequisites and states, then balances recent lanes.
3. Start writes an active session through `updateWorkspace()`.
4. The store validates and persists before notifying React subscribers.
5. Recap calls `finishSession()`, which updates the task and adds session evidence exactly once.
6. Journey derives counts from real session records rather than mutable counters.

### Convex concepts already visible

Tables and indexes live in schema code. Functions derive owner from trusted identity. `tasks.recordSession` groups its writes in one mutation. Full cloud session parity, auth integration and live backend verification remain phase 2 work.

### Validation

The handoff reports the checks actually run. The automated suite covers capacity, dependencies, lane variety, smaller-step completion, idempotency, resumption notes, timezone boundaries and ownership helpers. These tests do not verify a deployed Convex backend.

### Deliberate limitations

The first screen component is a functional baseline, to be split while you refine the design. Browser writes are last-writer-wins across tabs. No cloud migration, historical streaks, full milestones, auth or automated ChatGPT connection is implemented. Source has not been published or licensed for public reuse yet.

## Template for the next entry

- Outcome and phase:
- Files worth reading:
- New concept learned:
- Decision and trade-off:
- What was tested, with evidence:
- What remains incomplete:
- Artifact to capture for your portfolio:

## Foundation verification — 15 September 2026

- TypeScript: passed.
- ESLint: passed with no lint warnings after configuration cleanup.
- Vitest 5.0.1: 8 tests passed across recommendation, session, timezone and ownership-helper behaviour.
- Dependency audit after patching the test runner: 0 reported vulnerabilities.
- Next.js production build: passed; all six workspace routes generated.
- Browser checks: active-session reload, saved recap persistence, parent remaining open after a smaller step, idea activation, required blocker/next-step validation, evidence visibility, and all six routes at 360px passed with no page errors.
- Desktop and mobile screenshots were visually reviewed. Local screenshots live in ignored test-results/.
- No Convex deployment or real-account isolation test was performed. Phase 2 remains open.

The test runner reports a non-blocking future Vite config-loader compatibility notice for vitest.config.ts. It does not affect the passing tests; rename that config to .mts when adopting native configuration loading.


## 16 September 2026 — collaborative workflow and full roadmap

Added agent.md with the user-required phase-by-phase mentoring agreement and linked it from AGENTS.md, preserving the generated Next.js guidance. Expanded PLAN.md into review checkpoints and small learning subphases covering the full app. Archived the prior plan. Existing implementation, historical verification and pending user review are now distinguished.

This was documentation-only. No dependencies, app behaviour, accounts or deployments changed. No application tests were rerun. Next is the R1 guided foundation walkthrough, not automatic Convex integration.


## 16 September 2026 — Phase 2A stack decision

User selected the recommended stack and Better Auth with Convex, with no TanStack now. Read current official integration guidance and recorded packages, request flow, configuration boundaries and the next small scope in STACK_DECISIONS.md. Installed Convex meets the documented minimum; runtime compatibility is not yet tested. No dependency, runtime code, deployment or credential changed. No tests rerun for this documentation-only checkpoint. Development-project status and live sign-in remain pending.


## 16 September 2026 — Becoming development connection

**Scope:** link the user's existing becoming project, generate types, sync the starter backend, and verify the connection. This does not include Better Auth installation or cloud UI migration.

**What changed:** Convex CLI stored its login outside the repository, created the git-ignored .env.local connection file, and generated convex/_generated API/server/database type helpers. The starter schema, indexes and functions were synced to the development deployment.

**Issue and decision:** the previous auth placeholder referenced AUTH_ISSUER_DOMAIN and prevented deployment. Removed that obsolete environment dependency and used an empty provider list until Better Auth is installed. The owner checks remain in place; this does not grant anonymous access.

**Verification:** Convex dev --once completed successfully; a live read-only tasks:list call without authentication returned the intended sign-in-required error. Git ignores .env.local. TypeScript checking completed after code generation. No production deployment, authenticated-user test or UI data migration was performed.

**Learn:** a deployment URL tells a client where the backend lives; generated types tell code how to call its functions. Neither automatically connects the existing React screens. The UI still uses browser-local storage.

**Exercise:** open the becoming development dashboard and inspect the tasks table indexes and tasks:list function. The tables may contain no records because local browser tasks were not uploaded.

**Next checkpoint:** review this connection, then implement Better Auth configuration and a small sign-in flow. The local folder/app branding still uses form pending a separate rename.

## 17 September 2026 — Phase 2B development email/password authentication

**Outcome:** user continued after manually committing groups 1–3. Added a real `/account` checkpoint for sign-up, sign-in/out and Convex identity confirmation. The six task/workspace screens remain explicitly browser-local. No commits were created or staged by the assistant.

**Files to read:** `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`, `src/lib/auth-client.ts`, `src/lib/auth-server.ts`, `src/app/api/auth/[...all]/route.ts`, `src/components/auth-provider.tsx`, `src/components/account-screen.tsx`, and `documents/AUTH_SETUP.md`. Generated component types were refreshed by Convex. Added an Account navigation link and environment template; configured only the development secret and localhost origin.

**Decisions:** email/password chosen by user. Packaged auth component avoids maintaining a separate generated auth schema. Installed Better Auth 1.6.22 plus Convex adapter 0.12.5; user approved Vitest 4.1.11 for peer compatibility and one documented provider type exception for upstream #420. Native form handling remains sufficient at this scale. Full compatibility investigation and trade-offs are in STACK_DECISIONS.md.

**Bug learned from:** a reactive user lookup can run as its session is revoked during sign-out. Throwing in that expected transition caused an error state. Return null for a missing/revoked auth session; retain strict denial for protected task operations. The first newline-sensitive edit did not apply; inspected the actual file, corrected the edit, resynced, and reran the browser checks successfully.

**Verification performed:**

- TypeScript and ESLint passed; nine Vitest tests passed, including trusted-identity ownership behavior.
- Next.js production build passed (this is a build, not a production deployment).
- Convex development sync succeeded with the packaged auth component.
- Browser registration, identity query, reload, sign-out with null session, signed-out reload, invalid-password error and subsequent valid sign-in all passed.
- An authenticated tasks:list read succeeded; an anonymous task query was rejected; an anonymous identity query returned no user.
- Mobile 360px layout had no horizontal overflow; desktop/mobile screenshots reviewed in ignored test-results/. No browser page errors on the final run.
- Final package installation audit reported zero vulnerabilities. `.env.local` remains ignored; secrets were never committed or printed.

**Limits:** verification/recovery email delivery, production configuration, multi-account task isolation, account deletion and local-data migration are not complete. Three labelled development test accounts remain from browser checks; no emails were sent. Vitest still emits the existing non-blocking future native-config-loader notice. The upstream provider type exception must be reviewed when upgrading dependencies.

**Exercise:** open `/account`, create your own development account, reload, sign out and try a wrong password. Explain why “Convex identity confirmed” proves more than a visible signed-in label, and why Today still uses browser storage. Trace the complete request in AUTH_SETUP.md.

**Next proposed phase:** 2C — owner-scoped task create/list/edit with real reactive persistence and pagination. Wait for the user's review before implementing it. Session migration remains 2D; earlier walkthroughs are not retroactively marked accepted.

## 18 September 2026 — detailed private phase notebook

User requested much deeper phase-by-phase learning documentation, including all files/decisions, file changes and important code, in a separate ignored folder. Added documents/phase-learning/ with completed-phase walkthroughs, explicit future-phase specifications, a full source-file guide, verified Git change history, annotated real code, exercises and a handoff template. Recorded all coverage as historical; no application tests were rerun for this documentation-only task.

Added /documents/phase-learning/ to .gitignore and expanded agent.md so every future handoff maintains these guides while preserving personal annotations. Existing concise shared docs remain available for future contributors. Corrected stale backend README/working-agreement descriptions of authentication. No runtime code, dependency, account or deployment changed; Phase 2C remains pending review. Documentation validation checks file links, catalogue coverage, fenced code blocks and ignore/tracking behavior.

Documentation checks on 18 September passed: 26 Markdown files, 209 local links resolved, all 61 current source/config/shared-document files covered, balanced fenced blocks, every learning file ignored and zero learning files tracked. Git diff whitespace check passed. Application tests were not rerun because runtime code did not change.

## 24 September 2026 — Phase 2C authenticated cloud tasks

**Objective:** make Work the first real private cloud feature without pretending the rest of the local workflow has migrated.

**Implemented:** `/work` now requires a Better Auth session confirmed by Convex. It renders a dedicated cloud task screen with reactive cursor pagination, create and edit forms, pending/error/success states, an empty-account state and explicit cloud labelling. A shared sidebar keeps navigation consistent with the five still-local sections. Account-page copy now describes the hybrid boundary accurately.

`tasks.listPage` derives the owner from `ctx.auth`, filters through the owner index, orders newest first and omits the owner token from its response. `tasks.create` keeps its server validation and optional owned-project check. `tasks.update` checks record ownership and patches only planning fields. New records start `Ready`; lifecycle/status changes stay out of this phase.

Added `convex-test` 0.0.56 because it executes the actual Convex schema and functions with synthetic identities. Tests prove one owner cannot list or edit another owner's task, owner is not exposed, a foreign project relation fails, and cursor pagination returns all records. TanStack, React Hook Form, a UI kit and migration tooling were not added.

**Verification performed:** `npm run check` passed TypeScript, ESLint and 11 tests after removing one unused test variable. `npm run build` passed optimized compilation, TypeScript and route generation. Convex synced successfully to the `becoming` development deployment. In the browser, signed-out Work showed the account gate; Account A created and edited a task; the edit survived reload; Account B saw an empty board. With two Work tabs open as Account A, a newly created task appeared in the second without reload. Signing out changed the other tab to the account gate. The temporary browser session was left signed out.

**Unexpected findings:** the old local Work JSX remained after the new early return; TypeScript correctly reported it as unreachable and it was removed. The account screen also contained stale copy saying tasks were shared browser data; the wording now distinguishes cloud Work from the remaining local sections. The first test-account request lacked the trusted Origin header and returned 403; retrying with the local origin succeeded. Two temporary development accounts and two tasks remain in the development database for this verification.

**Limits:** Today still recommends local tasks and cannot start the cloud task created in Work. No local task data was imported. Task completion/blocking, active sessions, recap evidence, verification/recovery email, production deployment and account deletion are incomplete. The existing Vitest future config-loader warning remains non-blocking.

**Exercise:** sign in at `/account`, add a task in `/work`, reload and edit it. Then trace `TaskForm` → `useMutation(api.tasks.create)` → `tasks.create` → the `listPage` subscription. Identify the two separate places that validate input and the server line that establishes ownership.

**Next proposed phase:** review this Work slice first. Then Phase 2D can connect start/cancel/recap and decide whether to import local records or begin cloud use from an empty account.

## 24 September 2026 — design handoff and Phase 2D preparation

Added `documents/EXPERIENCE_MAP.md` as a living design handoff. It maps all six workspace areas, account/onboarding, core journeys, state vocabulary, screen states, cross-screen relationships and design priorities. Each feature is labelled live cloud, local prototype, planned or optional so design work does not mistake the PRD for implemented behavior. No UI layout is prescribed; the user will shape the dashboard and flows.

The user asked to continue engineering while designing. Phase 2D begins with a bounded backend session contract. Local-data migration is undecided after reviewing the options; no import or automatic upload will be implemented in this slice.

### Phase 2D backend slice result

Added the `activeSessions` table and an optional `sessions.startedAt` field. `tasks.getActiveSession`, `startSession` and `cancelSession` establish one owned active full-task session. Reworked `recordSession` so the active document supplies the task, owner-scoped retry key and start time; recap validates contribution, next step and evidence before its transactional task/session/artifact update. The old starter recap had accepted a task ID and arbitrary client key, so this closes that trust gap for the future UI.

Three new `convex-test` cases cover anonymous/foreign starts, one-session behavior, cancellation without credit, invalid recap preservation, foreign recap denial, duplicate-recap idempotency, evidence creation, dependencies and status transitions. `npm run check` passed TypeScript, lint and 14 tests. `npm run build` passed optimized compilation, TypeScript and route generation. The `becoming` development Convex sync succeeded and added `activeSessions.by_owner`. The visible Today flow was not changed or live-browser-tested in this slice.

**Exercise:** read `tasks.startSession` then `tasks.recordSession`. Explain why the recap form will send an active-session ID rather than a task title, owner or new retry key. Try the replay test in `tasks.test.ts` and identify which query prevents duplicate history.

### Phase 2D smaller-step parity slice

**Objective:** support the same defined smaller action in cloud Work and the session contract before connecting Today. This remains a reviewable engineering slice, not a completed cloud Today experience.

Added optional action, done condition and minutes to the task schema and Work form. The server requires all three or none, and an edit with none clears the step. Starting a smaller session snapshots the selected action, condition, minutes, title and lane. Its recap records the snapshot, keeps the parent In progress when finished, and clears the current task step only if the user has not replaced it during the active session. No new dependency was added.

`convex/tasks.test.ts` now also checks partial-input rejection, mode conflict, snapshot preservation across an edit, preserving a replacement step, clearing a completed current step, and explicit removal by edit. `npm run check` passed TypeScript, ESLint and 16 tests. The Convex development sync and `npm run build` passed. A signed-in development Work task was edited to add a 15-minute smaller step; the action and done condition remained visible after a browser reload. This modified a disposable development task, not the user's browser-local Today records.

**Limit:** the visible Work form can define a smaller step, but Today does not yet call cloud start/cancel/recap. No local-data import, production deployment or email verification/recovery change occurred. The migration choice and dashboard UI direction remain for review.

**Exercise:** in `convex/tasks.test.ts`, read the test that starts “Sketch focus states,” edits the task to “Build keyboard flow,” and finishes the original step. Explain why the new step survives while the historical session still says what was actually done.

### Phase 2D cloud Today client slice

**Decision:** the user wants Convex to hold meaningful app data. Browser state should be limited to temporary UI choices. Existing browser-local records are not automatically imported or deleted while the import-versus-fresh-start decision is pending.

`tasks.todayOverview` now gives the signed-in user three feasible focuses from owned Ready/In progress tasks. It validates the chosen capacity and energy, excludes unfinished/foreign prerequisites, uses the last six owned session lanes for an explainable order, and includes the current owned focus snapshot. `CloudTodayScreen` renders the signed-in gate, recommendation, alternatives, active session, cancel and recap states. It invokes existing Convex start/cancel/recap mutations and keeps time/energy only in React state. `WorkspaceScreen` now dispatches Work/Today to cloud components **before** calling the local-storage hook, and the unreachable local Today JSX was removed. No new dependency was added.

`npm run check` passed TypeScript, ESLint and 17 tests. `npm run build` passed optimized compilation, TypeScript and route generation. The new Convex test verifies owner isolation, feasibility, active focus and removal of a finished smaller action from recommendations. The development Convex sync succeeded. In a disposable signed-in development account, the browser showed the 15-minute smaller action, restored an active focus after reload, cancelled without credit, and saved a truthful “Made progress” recap. The task then remained eligible with one recent session counted. This added one historical test recap to that development account; it did not change the user's personal account. User design review remains open.

**Limit:** Ideas, Proof, Journey and Settings still use local storage. Their screens cannot yet display the new cloud recap or artifact. The cloud Today query currently reads all eligible owner tasks before ranking; bound/paginate it in a growth pass. Existing browser-local records remain untouched. The user should review the Today hierarchy and decide whether to import old local data before later cloud migrations.

**Exercise:** create a task in `/work`, open `/today` in two signed-in tabs, start a session and reload the second tab. Trace `CloudTodayScreen` → `todayOverview` → `startSession` → `activeSessions` and explain why the selected minutes do not need to be stored in Convex.

## 25 September 2026 — bounded Phase 3B cloud Ideas

**Decision and objective:** the user chose Convex for meaningful data, a fresh cloud start, and preservation of old browser records. The agreed slice moves Ideas capture, note editing and deliberate activation into the signed-in account. A read-only visual audit showed one seeded example idea and zero recorded sessions in the old local UI; the browser tool could not inspect the complete raw storage object, so those observations are not a complete inventory. No old data was uploaded or deleted.

Added `convex/ideas.ts` with an owner-scoped paginated list, capture, notes update and transactional activation. Activation creates one Ready task linked through both `ideas.taskId` and `tasks.ideaId`; repeated calls return the original task. Added `convex/ideas.test.ts` to verify anonymous denial, account isolation, foreign update/activation rejection, validation and exactly one linked task after retry. Added `CloudIdeasScreen` with sign-in states, paginated notebook, capture and brainstorm forms, and a separate first-task form. The route now selects this cloud screen before the local-storage hook and removes the unreachable local Ideas UI. No new dependency or schema field was needed; the ideas table and task links were already prepared.

**Verification:** the first typecheck failed because the generated Convex API map did not yet include `ideas.ts`; `convex dev --once` regenerated it and synced the functions to the existing development deployment. `npm run check` then passed TypeScript, ESLint and 18 tests. `npm run build` passed compilation, TypeScript and route generation. In a signed-in disposable development account, an idea was created, its notes edited, activation created a linked Ready task, the idea and link survived reload, and Work showed that task. The fixture idea/task remain in the development account.

**Limits:** the cloud notebook supports one linked task per idea and note edits, but not rich reference fields, multiple steps, reverse activation or archival. Proof/Journey/Settings remain browser-local and cannot display cloud records yet. The old local workspace remains on the browser profile. No production deployment, email flow or ChatGPT integration changed.

**Exercise:** capture a short assignment in Ideas, leave it unactivated, then check Today. Return, press Make active, define the first task, and check Work. Trace `CloudIdeasScreen` → `ideas.activate` → both link fields → `tasks.todayOverview`.

## 29 September 2026 — Phase 2E cloud Journey history foundation

**Objective:** replace Journey's browser-local session history with saved recaps from the signed-in Convex account. This was the one bounded phase agreed after the cloud Ideas handoff. Weekly commitments, streaks, Proof and Settings remain outside it.

Added `journey.listPage`, an authenticated, owner-indexed, newest-first paginated query over saved `sessions`. It returns the focus snapshot, outcome, contribution, next step and date without exposing the internal owner token. The new `CloudJourneyScreen` gates Better Auth and Convex identity, subscribes to 12 recaps at a time, shows lane counts for the loaded records and offers an explicit older-page action. It labels counts as loaded-session counts; it makes no all-time or weekly claim. `WorkspaceScreen` routes Journey to this screen before the browser-local hook. No schema field or dependency changed, and the old browser copy remains untouched.

**Verification:** `convex dev --once` synced the query to the existing development deployment and regenerated API types. The first typecheck before codegen failed because `api.journey` was absent; after sync, TypeScript and ESLint passed. Vitest was blocked by Windows sandbox process spawning, then passed outside the sandbox: 5 files, 19 tests, including anonymous rejection, two-account isolation, cancelled-focus exclusion and pagination. The first production build was similarly blocked by sandbox process spawning; the rerun outside the sandbox passed compilation, TypeScript and route generation. Browser UI and user review remain pending; a production deployment was not performed.

**Learning check:** finish a disposable Today focus, open Journey and verify its contribution and outcome. Sign out and verify that Journey shows the account gate. Then inspect `journey.listPage` to explain why a second account sees no records. See the ignored `documents/phase-learning/phase-2E-cloud-journey.md` for the full file ledger, annotated code and exercises.

## 29 September 2026 — bounded Phase 4B cloud Proof gallery

**Objective:** connect Proof to the existing Convex Draft artifacts created when a Today recap includes an evidence URL. This follows the user's request to connect Proof after the Journey handoff. Editing, Ready/Published transitions, portfolio flags and external posting are outside this slice.

Added `proof.listPage`: a trusted-owner, paginated query over `artifacts.by_owner`. For each evidence item it reads its source session and includes contribution, lane, outcome and date only if that session has the same owner. A malformed cross-owner link returns no source details. Added `CloudProofScreen` with account/loading/empty states and a paginated private evidence gallery. `/proof` now takes this route before the browser-local hook; the old local Proof code is no longer rendered, while its browser data remains untouched. No new schema field or dependency was needed.

**Verification:** `convex dev --once` synced the function and regenerated API types against the development deployment. `npm run check` passed TypeScript, ESLint and 21 tests, including anonymous rejection, two-account isolation, cancelled-focus exclusion, pagination and malformed-link source privacy. The production build and signed-in browser Proof flow are separate checks recorded in the private phase guide; no production deployment or external post occurred.

**Learning check:** finish a disposable Today session with an HTTPS evidence URL, then open Proof. Confirm the link and contribution story match that recap. Sign out and confirm the account gate. Read `proof.listPage` and explain both owner checks: artifact index and linked session.

## 29 September 2026 — Phase 2F cloud Settings motive

**Objective:** replace the last routed browser-local Settings screen with a private account-backed motive. The user asked what remained while this phase was in progress; this entry records the completed bounded result. Weekly target/timezone rules and full cloud export were deliberately excluded.

Made `profiles.timezone` and `weeklyTarget` optional so a new profile can save just the motive without fabricated defaults. Added `settings.getProfile` and `saveMotive`: both derive owner from auth; save trims and validates 1–1000 characters, creates the first profile or patches only its motive. Added a signed-in cloud Settings form and connected the shared sidebar to the same reactive profile query. `WorkspaceScreen` now routes all six sections under `AuthProvider`, with no local-store screen mounted. The old browser copy was not imported or deleted. The routed Settings page no longer offers the old browser-only export as though it backed up the cloud account. No new dependency was added.

**Verification:** `convex dev --once` synced the schema/function and regenerated API types in the development project. `npm run check` passed TypeScript, ESLint and 22 tests; the new profile test covers anonymous rejection, A/B isolation, empty/oversize input, create/update, and preservation of existing timezone/target fields. `npm run build` passed compilation, TypeScript and route generation. Signed-in browser review and production deployment remain pending. See ignored `documents/phase-learning/phase-2F-cloud-settings.md` for the detailed ledger and exercises.

**Learning check:** save a motive in Settings, reload, then open Today and verify the same text in the sidebar. Sign out, sign in with a second account, and verify that account sees its own empty Settings. Trace `CloudSettingsScreen` → `settings.saveMotive` → `profiles.by_owner` → `WorkspaceSidebar`.

## 2 October 2026 — review fixes and task lifecycle

**Objective:** fix the fourteen issues from the 1 October review, as one agreed phase. The user chose the name Becoming, wanted to review before anything was committed, and included all four optional parts: task lifecycle and archive, removing the old browser-local code, the Next.js patch, and syncing to Convex development.

- **One client.** Each section page used to mount its own `AuthProvider`. Next 16 keeps only the current page mounted (its router bfcache holds one entry unless `cacheComponents` is on), so every sidebar click built a new `ConvexReactClient` and never closed the old one. In the browser, three sections gave three distinct clients. Now one module-level client lives in the root layout. A `(workspace)` route-group layout keeps the sidebar, top bar and a single sign-in gate mounted, so the six copy-pasted gates are gone. URLs are unchanged. `(workspace)/not-found.tsx` shows unknown addresses inside the shell.
- **Task lifecycle.** `tasks.listPage` takes a view (active/blocked/done/archived). New mutations: `unblock` (Blocked → Ready with a required next step), `reopen` (Done → In progress), and `archive`/`restore` (`archivedFrom` remembers the earlier status; archiving is refused while that task's session is open). Ideas gained archive/restore and a notebook/archived view; activation refuses an archived idea. Sessions now start or record only for Ready or In-progress tasks.
- **Today.** The ranking moved into a pure, tested `convex/lib/recommend.ts`, with plain-language reasons; a new account no longer sees "0 of your last 0 sessions". The screen keeps the previous answer while new capacity results load, so the controls stay mounted and keep focus. The recap is keyed by session and keeps its text on Back. Finishing a smaller step now requires the parent's real next step instead of saving filler text.
- **Other fixes.**
  - The motive can be cleared.
  - One `readableError` helper reads `ConvexError.data`, and one `Notice` component (with optional Undo) replaces repeated markup.
  - Work, Brainstorm and Make active forms open inside their card, and focus moves into them.
  - Account, error, README and mode-note copy is current, and tab titles read "Today · Becoming" and so on.
  - Next.js went to 16.3.8 (critical GHSA-vcvr-r3jv-pc5j); audit is clean.
  - `convex/model.ts` was replaced by the generated server helpers.
  - The unrouted `src/domain/*` and `src/lib/local-store.ts` were deleted (still in Git at 542b6f3), and `weekKey` moved to `convex/lib/time.ts`.
  - `vitest.config.ts` became `.mts`.
  - README's UTF-16 last line was replaced; its NUL bytes made Git treat the file as binary.

**Verification:**

- `npm run check` passed: TypeScript, ESLint and 33 tests in 8 files. New tests cover the ranking rules, reasons, views, unblock/reopen, archive/restore with active-session protection, unsafe evidence links, idea archive and motive clearing.
- `npm run build` passed. `npx convex dev --once` synced the development deployment, and the additive schema was accepted.
- Browser, signed out: the same Convex client and sidebar across five section navigations; per-section titles; brand fit at 1280px and 1000px; no horizontal scroll at 320px; the in-shell not-found page.

Earlier problems, each fixed: stale generated route types, a nullable test id, one unescaped apostrophe, and a not-found message hidden behind the sign-in gate. Signed-in screens were not clicked through by Claude; that walkthrough is the user's review.

**Learning check:** recap a disposable session as Blocked, open Work → Blocked → Unblock, give a next step, and confirm Today offers it while Journey keeps the Blocked recap. Then read `rankFocuses` and explain why two recent Projects sessions move a Writing task ahead. Detailed ledger and exercises are in the ignored `documents/phase-learning/phase-review-fixes.md`.

**Commits:** after reviewing the proposed grouping, the user had the work committed in six groups and pushed on 2 October. They are `e0a16c5` (Next.js 16.3.8), `0a85850` (Vitest config), `b1368d8` (backend), `bbd3ce8` (frontend), `88eacb0` (local code removal) and `287e948` (docs). Nothing is deployed.

## 2 October 2026 — product phases: gaps, quick wins, 4A, 4B, 3A, 3B, 3C, 4C, 5A, 5B

**Objective:** the user asked for everything before friends and production, without commits: the small gaps first, then the recommended order (4A, 4B, 3A, 3B, 3C, 4C), the quick wins, and the data and interface phases (5A, 5B). They will test signed in once everything is done. 5C (the two-week trial) is the user's to run and now has a guide. Phase 6 (open source, production, friend pilot) is deliberately not started. No dependency was added; everything uses Convex built-ins and browser APIs. Each chapter in the ignored `documents/phase-learning/` folder has the detailed ledger.

**Small gaps and quick wins.**
- `tasks.todayOverview` now names its state (first-run, blocked-only, waiting, nothing-open, nothing-fits, ready), so each empty Today is honest and points to the right next action.
- The Active Work view uses one index range (status "In progress" through "Ready", ascending), so finished work isn't scanned and in-progress tasks come first.
- Today shows the last saved contribution and its next step, a "Pick up here" for started work, elapsed time during a session, and remembers tonight's time and energy for the tab (sessionStorage only).
- Sessions store `plannedMinutes`, so Journey compares planned with actual time. Journey also shows each session's evidence.

**4A weekly rhythm.** Weeks run Monday to Sunday in the saved timezone.
- The first target applies to the current week. Later changes start next Monday, so finished weeks keep their target and result.
- Pauses cover this week or next; a paused week neither adds to nor breaks a streak.
- The browser derives week results and streaks from commitments and session end times, using tested pure functions (`lib/time.ts`, `lib/rhythm.ts`) that cover daylight-saving weeks in New York and Auckland. That's because a cached Convex query doesn't move with the clock, and the runtime's timezone data couldn't be verified.
- Today has a week strip; Journey has weeks, streaks and private weekly reflections.

**4B Proof workflow.**
- Views: All, Drafts, Ready to share, Published, Portfolio candidates. Details are editable: title, link, notes, skills.
- Published requires a link and a date that isn't in the future, and moving back clears both.
- Screenshots go to Convex storage with server-side type and size checks and one-owner-per-file. A rejected file is deleted and its reason returned, not thrown, because throwing rolled the deletion back; a test caught this.
- Journey can add evidence to a past session.

**3A projects and milestones.**
- Work has a Projects view with project status, ordered milestones and tasks grouped by milestone.
- Milestone completion is derived from linked tasks, and `completedAt` is refreshed after every task change.
- Only Active projects feed Today or can start a session, and sessions snapshot their project.
- A case-study draft (Markdown, copy or download) is assembled from the project's sessions, milestones, evidence and open steps (`lib/caseStudy.ts`).

**3B ideas and prerequisites.**
- Ideas have structured brainstorm fields and a derived stage. Activation can add a smaller step and link a project or milestone, or start a new project from the idea. "Move back to Ideas" archives open work.
- Tasks have editable prerequisites: owned, at most 10, and no self-links or loops (walked on the server). (Later the same day: archived work stops blocking and may stay linked; see the hardening pass.)

**3C recommendations.**
- Pins come first whenever they fit, and are explained when they don't. A pin clears itself when its task finishes or is archived.
- Choosing an alternative records an optional swap reason, and every session records whether it followed the top suggestion. Journey summarises both.
- A lane can be favoured slightly; it counts as one session fewer.
- Today reads a bounded candidate pool: the 200 oldest of each open status, plus the pin.

**4C delight.**
- Journey shows lifetime counts and a "firsts" timeline derived from records each time it's read (nothing stored as an award).
- A 12-week activity calendar is an accessible table with a text label on every day.
- Saving a session shows a short check-mark celebration, disabled under reduced motion.

**5A data control.**
- JSON export.
- Restore into an empty workspace only, as one transaction, rebuilding every link from original IDs and refusing other formats, other versions, broken references, unsafe links and duplicates.
- Batched deletion, including screenshots.
- Account deletion that confirms the password, deletes data, then deletes the Better Auth user (`user.deleteUser.enabled`).

**5B interface quality.**
- Measured WCAG contrast. Light muted text moved to `#5b6b5f` (4.73:1 on the softest background), and a new `--field-line` (#768478 light, #809181 dark) gives fields, chips and secondary buttons a 3:1 boundary on every background in both themes.
- Phone navigation is one scrolling row, 124px instead of 186px, and keeps the current section in view.
- An offline notice appears when the Convex connection drops.

**Verification:**
- `npm run check`: TypeScript, ESLint and 105 tests in 20 files (77 before the review passes below).
- `npm run build`: passes, routes unchanged.
- Browser checks while signed out: every route renders with its title and no runtime errors; at 320px there's no sideways scroll and the current section stays in view.

**Review pass (same day).** An independent read-through of the uncommitted changes found eight issues; seven are fixed and one is documented.
- Restore now applies the forms' own rules (smaller-step titles up to 1000 characters, brainstorm links, publication dates, lengths) and refuses prerequisite loops, self-links, more than 10 prerequisites and duplicate weeks. Text that is too long is refused, not cut short.
- Today forgets a chosen alternative and its swap reason after a session starts, or when that choice is no longer offered or has become the recommendation, so the "followed the suggestion" record stays honest.
- The task form's milestone select is controlled, so a milestone prefilled from a project survives the project list loading late. Saving waits for that list when the task has a project.
- Moving an idea back clears a pin on its task, and Work shows "Pinned for Today" only on Ready or In-progress tasks.
- The current-week window is now exact for UTC−12 to UTC+14: 14 hours ahead to 7 days 12 hours behind (it previously let the whole previous week through). A test pins the clock to fixed instants.
- Downloads release their temporary object URL a second after starting, not immediately.
**Second review pass (while writing the chapters).** Reading every line for the notebook found more small gaps; these are fixed:
- Evidence titles are limited to 1000 characters everywhere (the Proof edit form, Journey's add-evidence field and `addToSession` still used 160).
- `prerequisiteOptions` now includes every task that is currently named as a prerequisite, even an old or archived one, so editing a task can't drop one silently. (Superseded by the hardening pass: Work now reads prerequisites from `listPage`, and the form asks for its own task’s.)
- Restore also refuses a milestone from another project, an idea pointing at another idea's task and a future publication date, and checks each milestone's completion date against its restored tasks (keeping a true date). Settings and restore share one timezone-name rule (`lib/validate.timezoneValue`). The restore prompt says that profile settings will be replaced.
- `--field-line` reaches 3:1 on the soft background too (the swap chips, Cancel session and milestone buttons sit on it).
- Today now clears a stale choice outright, so an old swap reason can't reappear, and the save check mark no longer lingers on later messages.
- Copy: "Move back to Ideas" no longer claims a finished task was archived; Journey no longer says sessions "only ever add up" (deleting data removes them); the trial guide says which panels count only the loaded sessions.
- Comments and docs now say plainly that the image type is the browser's declared type.

**Hardening pass (the owner asked for the best fix of each item).**
- *Finished weeks:* the server now checks the week key against the person's own timezone (`weekKey` with 5 minutes of clock tolerance) whenever its runtime knows that timezone, and keeps the "current somewhere on Earth" window only as a fallback. The window alone still let, say, Kolkata edit last week early on Monday. Three tests cover the exact check, the fallback edges and both mutations.
- *Prerequisites:* an archived prerequisite no longer blocks (Done or Archived clears it; restoring it blocks again). Before, a task waiting on set-aside work silently vanished from Today. Existing archived links are kept on edit; new ones are refused by name. Work reads prerequisites from `listPage` itself, and the edit form asks for its own task's prerequisites, so neither depends on a capped list.
- *Today's swap reason:* the choice and its reason are one state, resolved by a pure, tested helper (`src/lib/today-choice.ts`).
- *Milestone links:* the task form submits project and milestone from state through hidden fields, so a loading list or a disabled select can't drop them, and Save no longer waits. `taskValues` has its own tests.
- *Contrast:* `src/lib/contrast.test.ts` reads the colour tokens from `globals.css` and fails if text drops below 4.5:1 or borders below 3:1 on any background, in either theme.
- *Restore* and *restored completion dates* were already the best fit; they gained no code, only the consistent archived-prerequisite rule.

Documented, not changed: a case study also includes sessions saved before a task joined the project (they have no project snapshot); dates in Journey entries and the case-study header use the browser's timezone, while weeks use the saved one; account deletion and the offline notice have no automated test.

- Documented, not changed: if `attachImage` fails for a reason other than a rejected file (for example the connection drops), the uploaded file stays in storage without a record. It is invisible and harmless; a periodic clean-up could remove it later.

Earlier problems, each fixed: an unescaped apostrophe (lint), a test-helper type, and the upload rollback above. One documentation script deleted part of DATABASE.md because of mixed line endings; it was restored from HEAD and re-applied. Signed-in screens were not clicked through by Claude: signing in would send a password to the cloud deployment. The development deployment was **not** synced this time. Run `npm run backend` before testing.

**Learning check:**
1. Set a weekly target, save two sessions, then change the target. Explain why this week's result doesn't change.
2. Create a project with one milestone and two tasks, finish both, and read `refreshMilestone` to explain when `completedAt` is set and cleared.
3. Export a backup and read `importBackup` to explain why restoring twice can't duplicate anything.

## Ember Glass redesign — 2 October 2026

The owner designed the app in claude.ai/design ("Becoming App Design"). The Claude Design connector failed to connect (HTTP 403), so the design was exported as a bundled HTML file and unpacked locally (assets base64 and gzip). It covers Today's screens (1a–1e) and a component library (1f–1k). Every other screen was designed in the same system. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

**What changed**
- **Foundation:**
  - New tokens (dark Ember Glass), with fonts self-hosted from the design export.
  - Shell: icon rail, phone pill, and a header with quick capture.
  - Primitives in `ui.tsx` and `visuals.tsx` (Mind Bloom, capacity dial, focus gauge, week dots).
- **Today** was rebuilt to the design: dial, focus card, alternatives, Rest tonight, focus orb, outcome tiles, skills in the recap, a save-failed state, and the three-column desktop dashboard.
- **Work, Ideas, Proof, Journey, Settings and Account** were rebuilt in the same system by five parallel builders, each owning its own files and stylesheet. Every feature was kept.
- **Additions that make the flow useful:**
  - links between screens (`?new=task`, `?view=`, `?project=`)
  - the bloom by month (`until`)
  - skills in Journey history
  - an active idea names its task
- **Backend (additive):** `sessions.skills`, `journey.bloom`, `journey.skillSuggestions`, `proof.pipeline`, and the read additions listed in DATABASE.md.

**Review pass.** An independent read-through found 10 issues; all were fixed except one item kept by choice.
- The timer and the recap rendered together. A display rule beat `hidden`; this also existed before the redesign. A global `[hidden]` rule fixes it.
- Proof ignored `?view=` on client-side links. It now uses `useSearchParams`.
- Today and Journey styles collided. Today's are now scoped.
- Focus was lost after Start and after quick capture.
- A Ready task's next step was hidden.
- Minutes allowed only steps of 5.
- "+ Task" appeared on finished projects.
- Several ARIA attributes were wrong.
- Work forgot its task view after visiting Projects.
- Kept by choice: the first-run EXAMPLE chip. It is in the owner's design and is labelled EXAMPLE.

**Verification**
- `npm run check`: TypeScript, ESLint and 113 tests in 23 files. `npm run build` passes.
- The preview pages were checked in the browser: desktop at 1440px, and every page at 360px with no horizontal scroll.
- Not checked by Claude: signed-in screens (signing in would send a password to the cloud deployment).
- The development deployment was **not** synced. Run `npm run backend` before testing; sessions now accept `skills`.

**Learning check**
1. Tag two skills in a recap, then tag one of them again on that session's evidence in Proof. Read `lib/bloom.ts` and explain why the petal grows by one, not two.
2. Open `/design-preview` and `/design-preview/journey` at phone width. Find where the shell switches from rail to pill (`globals.css`, 899px).
3. Open Work at `?view=projects&tasks=blocked`, return to Tasks, and read `workRoute` to explain why Blocked is still selected.

**Loading skeletons (6 October 2026).** Every text loading state is now a skeleton in the design system (`src/components/skeleton.tsx`). Each one mirrors its screen’s layout and breathes softly, its pieces slightly out of step; it holds still with reduced motion. Each still announces its loading text to screen readers. The workspace sign-in check shows the skeleton of the section being opened. Dev-only preview: `/design-preview/skeletons`.

**Ritual redesign (6 October 2026).** The owner drew the whole evening as one flow (*Becoming Ritual*, direction 2a), and the app now follows it.
- **Today** asks one question, "What's on your mind tonight?", and each answer narrows the suggestion: Build → which project → time and energy → one focus, with up to two alternatives from other lanes. Then the focus overlay, the recap, the bloom growing, and "Tonight is done."
- **New around it:** five-step onboarding, a quick-capture sheet (idea, task, project, pasted assignment), a new-project sheet, a gap card after three days away, and a Sunday card for the weekly review.
- **Screens rebuilt:** Work (lanes, project page, a task sheet holding every lifecycle action), Ideas (brainstorm, Make active), Journey (contributions graph, bloom, week; Proof as a tab with a three-step publish flow; the three-step weekly review that lines up next week's steps) and Settings (side nav, reminder and focus preferences).
- **Backend:** additive only — a `weekPlans` table, profile preferences, scoped `todayOverview`, and a few single-item reads for deep links (DATABASE.md).
- **Kept but moved:** everything the prototype didn't draw (prerequisites, smaller steps, pinning, archive, milestones, case study, full history, insights, data controls) is still reachable from sheets, footers and "All sessions".
- **Honest gaps:** reminders are saved but not sent; where a post went (X, LinkedIn…) isn't stored; Done and Blocked still come only from a recap.

**Verification**
- `npm run check`: TypeScript, ESLint and 126 tests in 24 files. `npm run build` passes.
- Browser: signed-out shell at desktop and phone width, no console errors. Not checked by Claude: signed-in screens (signing in would send a password to the cloud deployment).
- Run `npm run backend` before testing: the schema changed.

**Learning check**
1. On Today, pick Build, then a project. Read `scope` in `cloud-today-screen.tsx` and `inScope` in `convex/tasks.ts`: what does the server receive, and why are the alternatives drawn from the whole pool?
2. Save a weekly plan, then read `lib/recommend.ts`: where does a lined-up task rank against a pinned one?
3. Open `/journey?tab=proof&publish=<id>` with an id from another account. Read `proof.get` and explain why the page says "This evidence isn't here." instead of crashing.

**Review fixes (6 October 2026).** A read-through found no ownership gaps but 16 issues; the important ones are fixed. Overlays and sheets now behave as real dialogs (focus in, background inert, Escape, focus back); links with a bad id show an honest empty state instead of crashing; the recap keeps your draft; onboarding never saves its example. `npm run check` (126 tests) and the build pass.

**Email verification, password reset and Google (9 October 2026).** Better Auth already had all three; the app only needed to send email and show the screens. Email goes through Resend's HTTP API from Convex (no package), and locally the link is printed in the backend terminal instead. Google is switched on by two Convex environment variables, so the button never appears half-configured. Learning check: read `sendEmail` in `convex/lib/email.ts` and explain why it logs the link on localhost but throws everywhere else.

**Assistants and the Inbox (9 October 2026).** Becoming now speaks MCP, so Claude Code can ask what to work on and log what you did. The design choice that matters: assistants only *propose*. Everything waits in an Inbox on Today and goes through the same rules as the app when you approve it, so the Journey stays yours. Learning check: read `runPropose` and `approve` in `convex/mcp.ts` and `convex/inbox.ts`, and explain why a proposal is validated twice.

**Reminders that send (9 October 2026).** A cron checks every 15 minutes who has just reached their reminder time in their own timezone. The trick that kept this free of dependencies: Web Push with an *empty* message only needs a signed request (a small ES256 token made with Web Crypto), not encryption. The phone shows text that lives in the service worker. Learning check: read `vapidHeader` in `convex/lib/webpush.ts` and the test that verifies its signature with Node's crypto. What would change if the notification had to carry tonight's task title?

**Tasks move freely (9 October 2026).** A task no longer needs the focus timer to change: `tasks.setStatus` starts, blocks or finishes it from anywhere, and every move lands in a new `taskEvents` history (the base for timelines and the activity feed in Phase 2). Learning check: in `lib/bloom.ts`, why does a finished task skip the skills its own sessions already counted?

**The project constellation (9 October 2026).** Work → Projects → Visual shows a project as a map, built to match the owner's design: where it came from (idea, research, report, decision), the docs it stands on, and one cell per task in each phase, with replay from real dates. Two choices hold it together. First, nothing on the map is stored as a number: `constellation.get` derives every %, code and edge from the records on each read. Second, Claude keeps it current only through the Inbox, and `import_plan` sends a whole plan as one item that only adds what's missing. Learning check: read `stateAt` in `src/components/constellation/model.ts` and the `timeline` line in `convex/constellation.ts`, and explain why an imported task finished on 15 September shows as ready when replay is set to 14 September.