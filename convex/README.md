# Convex learning foundation

The schema and functions are deployed to the becoming development deployment. Better Auth email/password is configured and verified on `/account`; anonymous workspace requests are rejected. Signed-in `/work` uses Convex tasks (Active/Blocked/Done/Archived views and lifecycle changes), `/today` uses Convex recommendations and focus sessions, `/ideas` uses Convex notebook entries with deliberate activation and archive, `/journey` reads paginated saved recaps, `/proof` reads evidence links with owned source-session context, and `/settings` saves the owner-scoped motive. All six workspace routes are cloud-backed; full weekly/publishing/data-control features remain planned. See `documents/AUTH_SETUP.md` for the account flow and `documents/PLAN.md` for phase boundaries.

- `schema.ts`: document validators and indexes.
- `_generated/`: CLI-managed API and server helpers. Every function module imports `query`/`mutation` from `./_generated/server`.
- `lib/ownership.ts`: trusted identity and ownership checks.
- `lib/recommend.ts`: pure Today ranking and plain-language reasons, tested without a database.
- `lib/time.ts`: Monday-start week keys in a person's timezone, kept for the weekly-commitment phase (not called yet).
- `tasks.ts`: owner-scoped Work views, create/edit, unblock/reopen/archive/restore, the Today overview and full-task/smaller-step start/cancel/recap.
- `ideas.ts`: owner-scoped notebook and archived views, capture, brainstorm update, archive/restore and retry-safe linked task activation.
- `journey.ts`, `proof.ts`, `settings.ts`: recap history, evidence gallery and the motive.
- `auth.config.ts`: Better Auth trusted-provider configuration.

Do not expose anonymous queries or pass owner IDs from the browser. Development sign-in and two-account task isolation are verified. The user chose a fresh cloud start; data in the old browser-local copy remains in its browser profile, and its code was removed on 2 October.

Keep generated files managed by the CLI. `npx convex codegen` refreshes them without changing the deployment; `npm run backend` syncs to development.
