# Convex learning foundation

The schema and functions are deployed to the becoming development deployment. Better Auth email/password is configured and verified on `/account`; anonymous workspace requests are rejected. Signed-in `/work` uses Convex tasks, `/today` uses Convex recommendations and focus sessions, and `/ideas` uses Convex notebook entries with deliberate activation. Proof, Journey and Settings remain browser-local prototypes. See `documents/AUTH_SETUP.md` for the account flow and `documents/PLAN.md` for phase boundaries.

- `schema.ts`: document validators and indexes.
- `model.ts`: schema-derived public query/mutation builders, before deployment-generated helpers exist.
- `lib/ownership.ts`: trusted identity and ownership checks.
- `tasks.ts`: owner-scoped paginated Work list/create/edit, Today overview recommendations and full-task/smaller-step start/cancel/recap.
- `ideas.ts`: owner-scoped paginated notebook list, capture, brainstorm update and retry-safe linked task activation.
- `auth.config.ts`: Better Auth trusted-provider configuration.

Do not expose anonymous queries or pass owner IDs from the browser. Development sign-in and two-account task isolation are verified. The user chose a fresh cloud start; the previous browser-local copy remains untouched.

After `convex dev` generates `_generated/server`, normal generated imports can replace the bootstrap builders. Keep generated files managed by the CLI.
