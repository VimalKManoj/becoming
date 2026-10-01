# Database design — Convex

## Mental model

Convex stores documents in tables. Each document has `_id` and `_creationTime`. A schema validates document shapes; indexes support predictable query access. Relationships use typed document IDs. This is not SQL: a referenced ID is not an automatic ownership or foreign-key policy. Functions must verify existence, ownership and state.

## Current schema

| Table | Important fields | Index and use |
|---|---|---|
| profiles | owner, motive; optional timezone and weeklyTarget | by_owner: retrieve private motive; later rhythm settings |
| projects | owner, title, purpose, status | by_owner: project list |
| ideas | owner, title, notes, lane, optional taskId, optional archivedAt | by_owner: notebook and archived views |
| tasks | owner, title, lane, status (Ready / In progress / Blocked / Done / Archived), optional archivedFrom, projectId, ideaId, minutes, energy, doneWhen, nextStep, dependencies, optional smaller action/done condition/minutes | by_owner: Active view; by_owner_status: Today candidates and the Blocked/Done/Archived views |
| activeSessions | owner, taskId, startedAt, optional chosen-focus snapshots | by_owner: one active session per account |
| sessions | owner, taskId, key, lane/title/done-condition snapshots, outcome, contribution, nextStep, evidence, endedAt | by_owner_endedAt: history; by_owner_key: idempotency |
| artifacts | owner, sessionId, title, url, status, portfolioCandidate | by_owner: proof gallery |
| weeklyCommitments | owner, week, target, paused | by_owner_week: historical weekly target |

Indexes in Convex are not declared uniqueness constraints. Application code uses an indexed read and insert in one mutation when uniqueness is required. The current recap mutation derives its `(owner, key)` retry identity from an owned active-session ID.

```mermaid
erDiagram
  PROFILES ||--o{ PROJECTS : "same owner"
  PROJECTS o|--o{ TASKS : contains
  IDEAS o|--o| TASKS : activates
  TASKS ||--o{ SESSIONS : records
  SESSIONS ||--o{ ARTIFACTS : produces
  PROFILES ||--o{ WEEKLY_COMMITMENTS : defines
```

The diagram expresses intended logical ownership; it is not database-enforced cascading behaviour.

## First mutation walkthrough

`tasks.create` reads the authenticated identity, verifies an optional project's ownership, checks title/effort/energy/done condition, then inserts a ready task. Its caller does not submit owner, state, or creation time.

`tasks.startSession` validates identity, the owned ready/in-progress task and prerequisites, and creates one active record for the owner. `tasks.cancelSession` removes that record without credit. `tasks.recordSession` looks up an existing completed recap by the active-record ID, then validates the owned active record and task, contribution, next step and URL. It inserts the session, updates the task, optionally inserts an artifact and deletes the active record in one Convex mutation transaction. The caller cannot supply the owner, task, title, lane or start time at recap.

## Planned schema additions

- Milestones with explicit task membership and archive semantics.
- Separate completed-step history or multi-step sequencing beyond the current optional step. Historical sessions preserve completed smaller-step snapshots.
- Source/reference fields for ideas and flexible skill tags.
- Artifact asset IDs when image/video upload ships.
- Effective-date preferences and immutable weekly target snapshots.

These fields are not claimed as implemented by the current schema.

## Query and growth policy

`tasks.listPage` uses Convex cursor pagination over the `by_owner` index, ordered newest first. The Work screen subscribes to an initial 12 records and explicitly loads 12 more while a cursor remains. `journey.listPage` uses `sessions.by_owner_endedAt` to show 12 recent owned recaps at a time. `proof.listPage` pages owned artifacts through `artifacts.by_owner` and reads only matching-owner source sessions. These queries omit the internal owner identifier. Journey derives lane counts only from currently loaded records and labels that limit in the UI. Future all-time and weekly summaries need a separate bounded design; do not treat a page as a complete history.

## Journey history — Phase 2E

`journey.listPage` requires a trusted identity, indexes into only that owner's saved `sessions`, orders by `endedAt` descending, paginates and projects the fields needed for Journey. Cancelled focus records are removed by `tasks.cancelSession` before a recap exists, so they cannot appear in history. The query reads snapshots of the completed focus title and lane, so later task edits do not rewrite the contribution story. Tests cover signed-out rejection, two-account isolation, cancelled focus exclusion and pagination. No table or dependency was added.

## Proof gallery — Phase 4B bounded slice

`tasks.recordSession` already validates an optional HTTP(S) evidence URL and inserts a Draft `artifacts` document with the same owner and new session ID. `proof.listPage` derives the owner from trusted auth, pages artifacts by `by_owner`, fetches each linked session, and includes its story only when its owner also matches. If a malformed artifact points to another owner's session, the source is null rather than leaked. The query returns no owner or recap idempotency key. The UI reads these private drafts and opens their links; status editing, publishing URLs and candidate controls are not connected yet. No schema or dependency changed.

## Settings motive — Phase 2F

`settings.getProfile` derives the trusted owner and returns only that owner's motive or null for a new account. `settings.saveMotive` trims and validates 1–1000 characters, then creates the owner's profile or patches only its motive in one mutation. The indexed lookup and insert share a transaction; the index itself is not a uniqueness constraint. `timezone` and `weeklyTarget` are optional in the schema so a newly created profile does not silently acquire invented week rules. Existing profile values survive a motive edit. The shared sidebar subscribes to `getProfile` only after Convex authentication. No local/browser data is read or imported.

## Time, deletion and migration

Store timestamps in UTC milliseconds. Derive Monday-start weeks using each user's saved timezone. Snapshot weekly targets so later edits do not rewrite streak history. The local baseline shows week counts only; it does not award historical streaks.

Prefer archive states for projects and ideas with history. Do not delete a parent while leaving dangling child references. Add authenticated account export/deletion explicitly before public release.

Local demo IDs are strings, not Convex IDs. The user chose to begin fresh in Convex and preserve the old browser copy. No automatic migration is planned. If an import is requested later, it must create owner-scoped records, map old IDs to new Convex IDs, rewrite references and deduplicate batches; raw browser snapshots must not be sent directly to database inserts.

Schema changes should start additive and optional, backfill existing documents, then tighten validation. Test against a development deployment before production.

Reference: [Convex schemas](https://docs.convex.dev/database/schemas).

## Authentication storage — Phase 2B

The packaged `betterAuth` Convex component owns auth user/account/session/verification tables in its component namespace. These are separate from the app's `profiles` and `sessions` tables: an auth session tracks login, while an app session tracks focused work. Password hashing and auth persistence are delegated to Better Auth. We do not manually add credential columns to our schema. Email verification/recovery flows are not enabled yet.

## Task operations — Phase 2C

- `listPage`: requires identity, filters by the indexed owner, paginates, and withholds `owner` from the UI response.
- `create`: derives owner, checks an optional project's ownership, validates effort/energy/text, and creates status `Ready`.
- `update`: loads the exact task, applies the same missing/foreign-record response through `assertOwner`, validates editable planning fields, and patches only those fields.

Task status, next step, dependencies and relational IDs cannot be overwritten through the edit form. Those lifecycle changes belong to later focused mutations. `convex-test` verifies list/edit isolation, pagination and foreign-project rejection against the real schema and function modules.

## Full-task session contract — Phase 2D backend slice

`activeSessions` has an owner index; start checks for an existing owner record in the same mutation that inserts a new one. The active document ID becomes the historical session's idempotency key. `sessions.startedAt` is optional in the schema so older development records remain valid; new recaps write it. Tests cover same-task start retry, a different-task conflict, cancellation without credit, missing/foreign IDs, invalid recap preserving the active record, replayed recap returning one session/artifact, dependency eligibility, Done and Blocked transitions.

The smaller-step extension adds optional `tasks.smallerStep`, `smallerDone` and `smallerMinutes`. All three must be present together; editing with all three omitted clears the step. Starting with `smaller: true` requires a defined step and snapshots focus title, done condition, minutes, task title and lane in `activeSessions`. Recap writes the focus snapshot into history. A finished smaller step leaves the parent `In progress`; the server clears the task's current smaller step only when it still matches the snapshot, so an edit made during focus is not lost. Optional schema fields keep older development documents valid. `/work` can create/edit the step, and `/today` now calls the session functions.

`tasks.todayOverview` validates temporary capacity/energy values, queries owned Ready and In progress tasks through `by_owner_status`, reads the six latest owned sessions through `by_owner_endedAt`, and looks up the single owned active session. It checks prerequisite ownership/completion before returning at most three recommendations. It never returns the owner identifier. The query is currently unbounded in its eligible-task read; revisit candidate-pool pagination as accounts grow. Existing browser-local records are neither read by Today nor imported automatically.

## Ideas and deliberate activation — Phase 3B bounded slice

`ideas.listPage` subscribes to one owner's ideas through `by_owner` with cursor pagination, returning only the fields the UI needs. `create` validates a trimmed title, lane and notes length; `updateNotes` checks exact record ownership. `activate` checks the owned idea, then creates a Ready task with `ideaId` and patches the idea with `taskId` in one mutation. A retry returns the already linked owned task rather than creating another. The task lane comes from the idea; title, effort, energy and done condition come from the activation form and are validated on the server. Capturing an idea alone does not affect Today. The old browser idea remains untouched under the user's fresh-cloud-start choice.

## Lifecycle and archive — review fixes, 2 October 2026

The schema change is additive, so existing documents stay valid and no migration was needed. The development push accepted it against existing data.

- **Tasks** gain the status literal `Archived`, plus an optional `archivedFrom`, which holds one of the four working statuses.
- **Ideas** gain an optional `archivedAt` timestamp.

| Mutation | Allowed from | Result |
|---|---|---|
| `tasks.unblock(taskId, nextStep)` | Blocked | Ready, with the new next step. The blocker stays in the session history that recorded it |
| `tasks.reopen(taskId, nextStep)` | Done | In progress, with the new next step |
| `tasks.archive(taskId)` | Any status; repeating it is harmless | Archived, with `archivedFrom` set. Refused while that task's session is active |
| `tasks.restore(taskId)` | Archived; repeating it is harmless | `archivedFrom` (or Ready), and `archivedFrom` removed |
| `ideas.archive` / `ideas.restore` | Any idea | Sets or removes `archivedAt`. Notes and the linked task are untouched; activation refuses an archived idea |

How the views and rules read this data:

- **Views.** `tasks.listPage(view)` reads Active through `by_owner` with a status filter (Ready or In progress), and the other views through `by_owner_status`. `ideas.listPage(view)` filters on whether `archivedAt` is missing; Convex filter equality accepts `undefined` for a missing field.
- **Sessions.** `startSession` and `recordSession` accept only Ready or In-progress tasks. An archived prerequisite still blocks its dependents, because a prerequisite must be Done.
- **Motive.** An empty motive now clears an existing profile's motive. A new account that saves nothing gets no profile.

Tests cover each transition, views, ownership rejection, idempotency, active-session protection, and exclusion from Today.
