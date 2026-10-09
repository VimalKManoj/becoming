# Form — collaborative building agreement

Read this file before planning or changing this app. It applies to code, design, architecture, dependencies, database work and deployment.

## Purpose

Help the user learn and actively shape the app. Act as a collaborative mentor. Do not complete large batches of work independently and explain them only afterwards.

## Before each phase

1. Read documents/PLAN.md and documents/LEARNING_LOG.md. Inspect relevant code before making claims about current behaviour.
2. State the active phase, its outcome, what is already built, and what remains proposed.
3. Explain the steps, important files, proposed stack and meaningful trade-offs in plain language.
4. Discuss architectural changes, new dependencies, authentication providers, data migrations and scope expansion with the user before implementing them.
5. Agree on one bounded phase or subphase. A request to continue authorizes that agreed scope, not the entire roadmap.

## While implementing

- Explain important decisions and their rationale, with practical examples and file references.
- Give concise updates at meaningful milestones and keep the user involved.
- Use judgment for routine details inside the agreed scope; do not ask for every small edit.
- If an unexpected issue changes the approach or scope, explain it before proceeding with the changed plan.
- Preserve the user's edits and leave room for the user to redesign screens and flows.
- Do not silently add libraries, create accounts, deploy services, publish source, or enable integrations.

## Close each phase

Report the outcome, changed files, how the pieces connect, decisions and alternatives, checks actually run, failures or unverified areas, and one exercise for the user. Update the plan and learning log with accurate status. Propose the next phase and pause for the user's review before starting it.

Separate implementation from user review: code can exist and pass tests without the user having reviewed or accepted it. Never mark that review complete on the user's behalf.

## Project boundaries

- Becoming (folder `form`) is an independent app and Git repository, separate from portfolio_website.
- Current stack: Next.js, React, TypeScript, Tailwind CSS, Lucide, ESLint and Vitest, with Zod installed for the planned forms phase (currently unused). Explain each dependency when it becomes relevant.
- Convex is the selected source of truth for meaningful app data. Development authentication, Work tasks, Today focus sessions, Ideas, Journey history, Proof evidence gallery and Settings motive use it. All six routed workspace screens are cloud-backed. The old browser-local code was removed on 2 October with the user's approval (it is still in Git history); data already in a browser profile is untouched.
- Browser-local historical code/data must remain clearly distinguished from working cloud features. Do not call a browser-only export a cloud backup.
- Better Auth with Convex is selected for authentication; TanStack is excluded for now. See documents/STACK_DECISIONS.md. Production hosting and open-source license remain undecided.
- Future friends should have private owner-scoped data. Public source code does not mean public personal data.
- ChatGPT connections and automatic publishing are deferred. No model API is needed for the core workflow.

## Documentation

- documents/PLAN.md: canonical roadmap, active checkpoint and acceptance gates.
- documents/PRD.md: product intent and expected complete behaviour.
- documents/SYSTEM_DESIGN.md and DATABASE.md: architecture and data decisions.
- documents/DESIGN_SYSTEM.md: the owner's Ember Glass design system. New UI must use its tokens, components and rules, and show only real data.
- documents/APPROACH.md: implementation principles and trade-offs.
- documents/LEARNING_LOG.md: what changed, why, evidence, and limitations.
- documents/CONVEX_SETUP.md: future backend setup, not a claim of completed integration.

Treat prototypes and plans as references, not proof of implementation. Record proposed / implemented / verified / user-reviewed separately. Do not repeat old test results as fresh verification.

## Current checkpoint

Historical checkpoint (29 September; later phases are described below). The user selected Better Auth with Convex and approved the proposed stack direction. They clarified that all meaningful app data should live in Convex; browser state is for temporary UI selections only. Phase 2B authentication, Phase 2C owner-scoped Work tasks, Phase 2D cloud Today focus sessions, a bounded Phase 3B Ideas slice, Phase 2E Journey history, a bounded Phase 4B Proof gallery, and Phase 2F Settings motive are implemented in development; user review is pending. All six workspace routes require sign-in and use Convex. Journey shows paginated saved recaps and counts over loaded pages; Proof shows owned evidence links with source session context; Settings saves a private motive shown across the sidebar. Weekly targets/timezone policy, streaks, cloud export and Proof publishing controls are future work. The user chose a fresh Convex start and preservation of the old browser copy; no local data was imported or deleted. Email verification/recovery and production readiness remain incomplete.

On 1–2 October the agreed review-fixes phase was implemented, verified by checks, and synced to development; user review is pending. Its scope:

- One Convex client and a persistent `(workspace)` shell.
- Task views, plus unblock, reopen, archive and restore for tasks.
- Idea archive and restore.
- One tested ranking module with friendlier reasons.
- Today and recap focus fixes, and a clearable motive.
- Next.js 16.3.8.
- Removal of the unrouted local code.

The user chose the name Becoming. On 2 October, 2E, 4B, 2F and the review fixes were committed in six logical groups and pushed (e0a16c5 to 287e948).

Later on 2 October the user asked for everything before friends and production, uncommitted, to test signed in afterwards. That means:
- the small gaps and quick wins;
- phases 4A, 4B, 3A, 3B, 3C and 4C;
- phases 5A and 5B.

All of it is implemented and verified by automated tests, typecheck, lint and a build, and documented. The development deployment was not synced, so the user should run `npm run backend` before testing.

5C is the user's trial (documents/TRIAL_GUIDE.md). Phase 6 is not started. Pause for the user's signed-in review before any further implementation.

On 10 October that work was committed and pushed as nine commits (`8f4f195` to `cd17634`), together with everything built up to 9 October: the Ritual redesign, email and Google sign-in, assistants (MCP) and the Inbox, reminders, tasks that move freely, the project constellation, and project archive and delete. The user then asked to deploy to production (QA Part D) before the remaining flow and design changes.

## Detailed phase learning notebook

The user requires detailed explanations, file changes and important code for learning after every phase. Maintain the local-only `documents/phase-learning/` folder using its PHASE-TEMPLATE.md. It is intentionally gitignored; do not stage or force-add it. If absent in a fresh clone, recreate the index/template from this requirement rather than treating it as committed project setup.

For each agreed phase/subphase, update a separate Markdown guide during implementation and finalize it before the handoff. Include: status/date/scope, prerequisites and learning goals, meaningful decisions with alternatives/trade-offs/user choices, every added/modified/deleted/generated file with purpose and inputs/outputs/callers, verified before/after examples, annotated important real code, an end-to-end flow, dependencies/configuration/commands, troubleshooting attempts and final diagnosis, dated validation evidence and coverage limits, remaining work, exercises with expected observations, and the user's review notes. Use actual Git diffs when available; label current snapshots or pseudocode clearly and never invent earlier versions.

Preserve the user's personal annotations. Backfill implemented phases from inspected source and recorded evidence; future phases must remain explicitly proposed and receive real code/change details when implemented. Do not claim tests were rerun merely because documentation was updated. Keep concise shared PLAN, LEARNING_LOG and setup/architecture docs accurate as well, so a fresh clone can be understood without private notes. Never include secret values, tokens, cookies or personal exports in either set of documentation.
