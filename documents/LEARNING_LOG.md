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
