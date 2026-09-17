# Convex learning foundation

The schema and starter task functions are deployed to the becoming development deployment but are not connected to the browser UI yet. Better Auth is not configured; anonymous task requests are rejected. The UI explicitly uses local learning mode. See `documents/CONVEX_SETUP.md` for the next phase.

- `schema.ts`: document validators and indexes.
- `model.ts`: schema-derived public query/mutation builders, before deployment-generated helpers exist.
- `lib/ownership.ts`: trusted identity and ownership checks.
- `tasks.ts`: owner-scoped list, create and atomic full-task recap.
- `auth.config.ts`: trusted issuer configuration, defaulting to no trusted providers.

Do not expose anonymous queries or pass owner IDs from the browser to work around missing authentication. Complete the sign-in and ownership tests in phase 2.

After `convex dev` generates `_generated/server`, normal generated imports can replace the bootstrap builders. Keep generated files managed by the CLI.
