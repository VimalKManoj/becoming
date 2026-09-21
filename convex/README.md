# Convex learning foundation

The schema and starter task functions are deployed to the becoming development deployment. Better Auth email/password is configured and verified on `/account`; anonymous task requests are rejected. Workspace task screens still use browser-local storage. See `documents/AUTH_SETUP.md` for the implemented account flow and `documents/PLAN.md` for the proposed cloud task phase.

- `schema.ts`: document validators and indexes.
- `model.ts`: schema-derived public query/mutation builders, before deployment-generated helpers exist.
- `lib/ownership.ts`: trusted identity and ownership checks.
- `tasks.ts`: owner-scoped list, create and atomic full-task recap.
- `auth.config.ts`: Better Auth trusted-provider configuration.

Do not expose anonymous queries or pass owner IDs from the browser to work around missing authentication. Development sign-in is verified; full two-account task isolation and cloud UI/session parity remain Phase 2 work.

After `convex dev` generates `_generated/server`, normal generated imports can replace the bootstrap builders. Keep generated files managed by the CLI.
