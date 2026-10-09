# Convex learning foundation

The schema and functions run on your Convex development deployment (run `npm run backend` after pulling changes so it has the latest). Better Auth email/password is configured on `/account`, and anonymous workspace requests are rejected. All six workspace routes are cloud-backed. See `documents/AUTH_SETUP.md` for the account flow, `documents/DATABASE.md` for tables and rules, and `documents/PLAN.md` for phase status.

Function modules:
- `tasks.ts`: Work views, task create/edit/lifecycle, prerequisites, pinning, the Today overview, and full-task/smaller-step start/cancel/recap.
- `projects.ts`: projects, ordered milestones, project detail, task-form options, and case-study data.
- `ideas.ts`: notebook and archived views, structured brainstorm, activation (with a project or smaller step), moving back, archive/restore.
- `proof.ts`: Proof views, details, Draft/Ready/Published, candidates, evidence for past sessions, screenshot upload and removal.
- `journey.ts`: recap history with evidence, lifetime counts and firsts.
- `rhythm.ts`: timezone and weekly target, planned pauses, reflections, and the rhythm overview.
- `settings.ts`: motive and lane preference.
- `data.ts`: export, restore into an empty workspace, batched deletion.
- `auth.ts`, `auth.config.ts`, `http.ts`, `convex.config.ts`: Better Auth through its Convex component.

Pure rules (tested without a database):
- `lib/recommend.ts`: ranking, reasons, the pinned-task note.
- `lib/rhythm.ts`, `lib/time.ts`: commitments, streaks, and timezone week/day maths (used in the browser).
- `lib/taskRules.ts`, `lib/projects.ts`, `lib/validate.ts`: shared validation, task links, milestone refresh.
- `lib/caseStudy.ts`: the Markdown case-study draft.
- `lib/ownership.ts`: trusted identity and ownership checks.

Generated files:
- `schema.ts`: document validators and indexes.
- `_generated/`: CLI-managed API and server helpers. Every module imports `query`/`mutation` from `./_generated/server`.

Rules of the house:
- Never expose anonymous queries, and never pass owner IDs from the browser.
- Check the owner of every document an ID points to.
- Keep schema changes additive so existing data stays valid.
- `npx convex codegen` refreshes generated types without changing the deployment; `npm run backend` syncs to development.
- The old browser-local copy is preserved only in that browser profile; its code was removed on 2 October.
