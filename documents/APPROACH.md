# Implementation approach

## Build one complete path at a time

Each phase should leave the app usable. First learn the UI-to-domain-to-storage path locally; then replace persistence with real Convex queries and mutations. Keep visual exploration cheap while the workflow is still changing.

The local mode is an intentional learning baseline, not the final backend choice. Convex remains the intended backend. Avoid maintaining two permanent implementations: after cloud parity and an explicit migration, keep local mode only as an isolated demo if it remains useful.

## Decisions made

| Decision | Reason | Revisit when |
|---|---|---|
| Separate Next.js application | Independent deployment, ownership and open-source history | Already required |
| App Router and TypeScript | Route boundaries and typed feature code | No planned change |
| Tailwind plus CSS tokens | User can change UI quickly without changing domain logic | Component system stabilises |
| Pure recommendation function | Rules stay explainable and easy to test | Real usage shows a better policy |
| Convex for backend and database | Learn queries, mutations, indexes and reactive data in one project | Usage exposes a concrete limitation |
| Server-derived ownership | Friends can have private workspaces later | Shared teams are actually requested |
| Auth provider deferred | Avoid silently committing to another service | Phase 2 setup |
| Source release deferred | Keep licensing and public sharing deliberate | Release phase |

## A repeatable learning session

1. Read the relevant phase's outcome and acceptance gate.
2. Trace one existing operation from screen to domain function to storage.
3. State the new behaviour in plain language.
4. Implement the smallest meaningful slice.
5. Test the rule or boundary that can actually fail.
6. Use the flow in the browser and capture a screenshot or note.
7. Update the learning log with what changed, why, evidence and remaining limits.

## Recommendations

Candidates must be ready/in-progress, have satisfied prerequisites, and fit the chosen capacity or a defined smaller step. Rank using the last six sessions, avoiding a third same-lane suggestion where feasible. Then favour a neglected lane, resumable work and older tasks. A user's choice remains final.

Do not use random priority, a model API, or opaque scores in the first version. Week streak logic is a separate concern from recommendation ranking.

## Test strategy

Pure unit tests: effort fit, blocked/dependent work, lane rotation, partial-step completion, duplicate recap, required resumption notes and timezone week boundaries. Auth helper tests verify missing/foreign records fail consistently.

Next phase: Convex function tests covering unauthenticated reads, cross-user IDs, foreign parent references, replayed mutations and transaction outcomes. Then use two real accounts to validate isolation and reactive updates in a development deployment.

Browser checks cover route navigation, local reload persistence, ideas-to-task flow, recap validation, evidence links and narrow layouts. Typecheck/lint/build must pass before the phase is marked complete. Tests for cloud behaviour are not replaced by tests of the local adapter.

## Open-source preparation

Keep sample data fictional, keep secrets out of Git, document setup and known limits, and choose a license before publication. MIT is a possible permissive option; the initial scaffold does not make that licensing decision for you. Add contribution and security-reporting guidance now; configure a public contact when a repository exists.
