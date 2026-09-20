# Development connection checkpoint — completed

The existing **becoming** project is now linked to this app. The CLI generated `.env.local` and `convex/_generated`, and synced the starter schema/functions to the cloud development deployment. Do not create a second project or repeat first-time setup.

The old `AUTH_ISSUER_DOMAIN` placeholder blocked the first sync and was removed. `auth.config.ts` now has an empty provider list. Server functions still require identity; a live anonymous task query was rejected. Better Auth will supply the provider in the next auth step. No signed-in flow or cloud task UI is implemented yet.

The sections below retain the earlier learning guide. The initial connection step is complete; the historical Clerk example is not the selected approach.

# Current decision — Better Auth selected

On 16 September 2026 the user selected Better Auth with Convex. Follow [STACK_DECISIONS.md](STACK_DECISIONS.md) and the official Better Auth Next.js guide for the next setup phase. The Clerk walkthrough below is historical alternative guidance, not the selected implementation. The old AUTH_ISSUER_DOMAIN configuration will be replaced as part of 2B; do not configure Clerk for this project.

# Learn and connect Convex — phase 2

The codebase is prepared for Convex, but this scaffold has not created a deployment, logged into an account, or connected the UI. Setting a URL alone does not enable cloud mode.

## 1. Understand the three function types

- Query: reads data and can reactively update a subscribed client.
- Mutation: validates and changes database state in a transaction.
- Action: performs external or non-transactional work; add only when needed.

Start with `convex/schema.ts` and `convex/tasks.ts`. Predict what each validation rejects before running it.

## 2. Create a development project

From the Form folder:

```sh
npm run backend
```

Follow the Convex CLI login/project prompts. Keep the resulting deployment variables in `.env.local`. The CLI manages generated types in `convex/_generated`. Do not paste secrets into source, screenshots or documents. Do not copy the portfolio's environment file.

The bootstrap `convex/model.ts` uses Convex public generic builders and inferred schema types. After code generation, migrate its imports to the official `_generated/server` helpers as a learning exercise, then use `_generated/api` in the React integration.

## 3. Decide authentication before wiring private data

The schema already supports one owner per record. Choose Clerk, Convex Auth or Better Auth deliberately. Clerk is one documented path:

1. Create a Clerk development application and enable its Convex integration.
2. Add Clerk's Next.js SDK and its required app provider/proxy setup for your installed Next.js version.
3. Put Clerk frontend/server keys in the local environment as directed by its setup guide.
4. Set `AUTH_ISSUER_DOMAIN` in the Convex deployment environment to the trusted issuer domain. `auth.config.ts` expects application ID `convex`.
5. Wrap cloud UI with `ConvexProviderWithClerk` and Clerk's `useAuth`.
6. Gate queries with Convex's authenticated state, not merely a frontend sign-in flag.

Clerk is an option, not an installed dependency or selected final provider. If you select another provider, adapt auth configuration and the client provider together. With no issuer configured, the current backend trusts no provider and every task function requires an authenticated identity.

## 4. Complete the first cloud flow

- Add an owner-scoped profile bootstrap mutation.
- Add session start/cancel and smaller-step state to the server schema and functions.
- In a small feature provider, subscribe with `useQuery(api.tasks.list)`.
- Replace create/save interactions with `useMutation` calls.
- Display loading, authentication and mutation errors explicitly.
- Keep the local demo visibly separate until there is an explicit migration.

Do not use hard-coded user IDs or public unauthenticated queries to make setup appear successful.

## 5. Verify the backend, not just the UI

Create two development users, A and B. A creates a task. B must not list it, attach it to a session, or reference A's project. A can record a valid recap. Replaying its key returns the same session without another artifact. A blocked task and a task with missing prerequisites must be rejected. Test unauthenticated calls directly as well.

Observe a task mutation in two tabs signed into A. Then reload and confirm cloud data survives. None of these live checks have been performed by the scaffold.

Official references: [Next.js quickstart](https://docs.convex.dev/quickstart/nextjs), [Schemas](https://docs.convex.dev/database/schemas), [Clerk integration](https://docs.convex.dev/auth/clerk), [Convex authentication](https://docs.convex.dev/auth).

## Current auth setup (17 September 2026)

The development connection and Better Auth email/password checkpoint are now implemented. Follow [AUTH_SETUP.md](AUTH_SETUP.md) for current instructions; historical Clerk/issuer instructions above do not apply. Workspace tasks still use browser-local storage.
