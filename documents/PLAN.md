# Becoming — full app plan and learning checkpoints

Updated: 24 September 2026. Follow ../agent.md for the working agreement.

## Product direction

An independent design-engineering practice app: choose useful daily work, balance projects/showcases/writing, develop ideas, capture evidence, and build a portfolio. Flexible sessions replace a rigid timetable. Gamification supports meaningful progress. Convex is the intended backend; future friends get private personal workspaces. Open-source release comes later.

## Current truth

| Area | Implementation | Verification | User review |
|---|---|---|---|
| Independent Next.js scaffold and documents | Present | Build/checks recorded 15 Sep | Walkthrough pending |
| Earlier browser-local prototype | Proof, Journey and Settings still use it; local Today/Ideas are no longer routed | 8 historical prototype tests recorded 15 Sep | Cloud migration pending |
| Convex task persistence | `/work` uses owner-scoped paginated Convex list/create/edit | Unit authorization tests and two-account browser flow verified 24 Sep | User review pending |
| Better Auth email/password | Implemented on /account in development | Browser flow and backend identity verified 17 Sep | Pending |
| Cloud Today and session lifecycle | Signed-in Today recommends owned feasible Work tasks and calls Convex start/cancel/recap; time/energy are temporary UI state | 17 tests, development sync and live start/reload/cancel/recap check 24 Sep | User review pending |
| Cloud Ideas | Signed-in notebook capture/edit and deliberate one-time task activation | 18 tests, development sync, and browser create/edit/reload/activate/Work checks 25 Sep | User review pending |
| Full projects, streaks, sharing | Planned | Not verified | Future phases |

Existing work is a starting point, not automatically accepted scope. Historical checks are not fresh verification. The prior roadmap is preserved as PLAN-2026-09-15.md.

## How we will proceed

Each numbered subphase is one small delivery: explain → discuss → implement → verify → teach back → user review. No automatic transition to the next subphase. Timeboxes may be estimated when a phase is agreed; they are not calendar deadlines.

## R — review the foundation together (available; review still pending)

**Outcome:** you can explain what is already built and decide what to keep.

- [ ] R1: walk through package.json, routes, layout, styling and the difference between the app and prototype.
- [ ] R2: trace one session from the screen to domain rules to browser storage, then reload it.
- [ ] R3: review the Convex schema and clearly separate prepared code from working cloud features.
- [ ] R4: agree on the next subphase and record accepted changes or simplifications.

**Files:** src/app/layout.tsx, src/app/[section]/page.tsx, src/components/workspace-screen.tsx, src/domain/workspace.ts, src/lib/local-store.ts, convex/schema.ts.

**Decisions:** keep or simplify the initial UI; identify what the user wants to implement themselves. No new dependencies or accounts.

**Exercise:** explain where a session is saved and why completing a smaller step leaves its parent unfinished.

**Review gate:** the user understands the foundation and explicitly chooses the next subphase. No implementation is required to complete this walkthrough.

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

## 3 — projects, ideas and recommendation refinement

**Status:** planned; local idea/task baseline already exists.

### 3A — projects and milestones

Add create/edit/archive for projects and milestones, link tasks, derive understandable progress and preserve historical references. Decide together whether milestones need a separate view.

**Gate:** archiving does not create dangling references or ready recommendations from archived projects. **Learn:** typed relationships and derived state.

### 3B — notebooks and ready work

**Bounded Ideas slice status (25 September):** implemented and verified in development; user review pending. `/ideas` now requires sign-in and uses owner-scoped Convex pagination, capture, note edits and one-time activation into a linked Ready task. The user chose to start fresh in Convex and preserve old browser data; no import or deletion occurred. Broader idea states, reverse activation, project fields, smaller-step editing at activation and prerequisite-cycle editing remain proposed for later review.

Persist brainstorm fields/references, reversible activation and links to original ideas. Add editable tasks, smaller steps and prerequisite-cycle validation. Split the initial large screen component into focused feature modules while changing these flows.

**Gate:** saving an idea does not schedule it; activation creates the intended linked task once. **Exercise:** follow an idea through to its first session.

### 3C — balanced suggestions

Review the last-six-session approach using actual usage. Discuss lane weighting, user pinning, swap reasons, infeasible tasks and no-candidate states. Explain every recommendation; avoid inventing tasks or using an AI score.

**Gate:** test neglected lanes, consecutive same-lane sessions, dependencies, low capacity and explicit user selection. **Evidence:** a technical breakdown of one rule and its trade-off.

## 4 — meaningful motivation and portfolio evidence

**Status:** planned; actual session history and link capture already exist.

### 4A — weekly commitment and streaks

Agree on what counts as a session, week boundaries, planned pauses and target effective dates. Store immutable historical commitments; derive streaks from records. Test midnight/timezone transitions, missed/paused weeks and edits.

**Gate:** changing a target does not rewrite past awards; rest creates no overdue backlog or fake progress. **Learn:** temporal data modelling. **Exercise:** explain a paused-week example.

### 4B — proof and publishing workflow

Build artifact editing, draft/ready/published status, publication links, portfolio candidates and links to originating sessions/projects. Publication status is tracking, not an external posting action.

**Gate:** a published record has a valid link; evidence remains attributable; nothing is posted automatically. **Evidence:** one completed component with its design/code/process notes.

### 4C — optional delight and assets

Discuss uploads, badges and a subtle celebration or garden only after the useful loop works. Verify file ownership, type/size limits and reduced-motion behaviour before shipping uploads/animations.

**Gate:** progress signals reflect real records, and all interactions remain accessible. No XP economy or mandatory daily posting by default.

## 5 — reliability, redesign and real use

### 5A — data control

Complete export/restore, migrations, account deletion and recovery. Test malformed backups, version mismatches, duplicate imports, interrupted operations and owner isolation. Select archive/delete semantics together.

### 5B — interface quality

Refine the user's chosen design with keyboard access, focus management, contrast, mobile layouts, reduced motion, meaningful loading/empty/error states and performance checks. New UI/motion libraries require discussion first.

### 5C — two-week personal trial

Use the app and collect recommendations accepted/swapped, planning effort, work completed across lanes and maintenance overhead. Decide whether telemetry is needed; do not add analytics silently. Make focused changes based on evidence.

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

**Current checkpoint:** review the cloud Ideas flow from capture to linked Work task, alongside Today. Use EXPERIENCE_MAP.md to redesign the dashboard and flows. The next proposed slices move Proof, Journey and Settings to Convex separately. The old browser workspace is preserved, with no import planned for the fresh-start path. The local folder is still named form; a branding/folder rename has not been performed. R1–R4 are not retroactively marked reviewed.

## Detailed learning handoffs

As requested on 17 September, each phase also requires a detailed local chapter under documents/phase-learning/. Use PHASE-TEMPLATE.md: explain all changed files, important code, decisions/alternatives, complete flows, checks and exercises. Backfilled historical chapters are labelled from recorded evidence; future chapters are proposals. Preserve personal notes. The notebook is ignored by Git. Phase 2C's chapter records its actual implementation; user review is still pending.
