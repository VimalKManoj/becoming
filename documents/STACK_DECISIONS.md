# Accepted stack and authentication direction

Decision date: 16 September 2026. User accepted the proposed stack, excluded TanStack for now, and chose to try Better Auth with Convex.

## Selected versus installed

| Tool | Purpose | Status |
|---|---|---|
| Next.js / React / TypeScript | Application and typed interface | Installed |
| Tailwind and design tokens | Customisable styling | Installed |
| Zod | Runtime validation and forms | Installed |
| Lucide | Icons | Installed |
| Convex | Backend, database and reactive queries | Linked to becoming development deployment; `/work` task slice is live |
| Better Auth + Convex component | Authentication | Installed; development email/password verified; production verification/recovery deferred |
| React Hook Form + Zod resolver | Form state and field errors | Approved direction; add in the form phase |
| Selected shadcn/ui components | Editable interaction primitives | Approved direction; add component by component |
| Motion for React | Richer interaction transitions | Approved direction; defer until polish |
| Vitest / ESLint | Behaviour tests and lint | Installed |
| convex-test | In-memory Convex function and authorization tests | Installed in Phase 2C |
| Playwright + axe | Browser and accessibility automation | Not installed as project dependencies; browser checks currently use external tooling |
| TanStack tools / ORM | No current requirement | Do not add now |

## Why Better Auth with Convex

The user wants to learn authentication integration and prepare a potentially open-source app. Better Auth is the selected approach. Its Convex component supplies the database integration. We do not add a separate ORM or SQL database for this integration.

We own setup, account flows and their verification. Email verification, password recovery and sign-in methods are decisions to explain before a release; choosing a library does not implement them.

## Phase 2A findings

The official Next.js integration currently requires Convex 1.25.0 or later; Form has 1.45.0. Its guide currently recommends Better Auth ~1.6.15 together with @convex-dev/better-auth. Confirm package compatibility and peer requirements again at installation; the minimum version check is not a live compatibility test.

No .env.local or convex/_generated directory was found during this read-only inspection. This does not establish whether the user has a remote project already.

## Proposed request flow

Browser auth form → Next.js /api/auth endpoint → Convex HTTP auth routes → Better Auth session → Convex authenticated provider → owner-checked queries/mutations.

Authentication establishes who the user is. Authorization checks whether they may access a specific task or project. Our server-derived owner checks remain necessary.

## Phase 2B scope, for the next checkpoint

1. Confirm the user's Convex account and Form development project.
2. Install compatible Better Auth and integration packages, explaining both.
3. Configure the component and generate official Convex types through the development CLI.
4. Replace the generic issuer placeholder with Better Auth's provider configuration.
5. Add the auth instance, Convex HTTP routes, Next.js auth handler and client provider.
6. Add the agreed sign-in method and explicit loading, signed-out, signed-in and error states.
7. Verify sign-in, sign-out, authenticated identity, unauthenticated rejection and reload behaviour.
8. Review together. Leave task data migration and cloud task UI wiring for 2C/2D.

Expected files: convex/convex.config.ts, convex/auth.config.ts, convex/auth.ts, convex/http.ts, generated Convex helpers, src/lib/auth-client.ts, src/lib/auth-server.ts, an auth route handler, a React provider and sign-in UI. These files are proposed, not implemented by this decision note.

## Configuration boundaries

The frontend needs its Convex query URL and HTTP site URL. The auth deployment needs its secret and the allowed site origin. Form currently uses http://localhost:3001, so examples using port 3000 must be adapted. Secrets belong in environment configuration, never in documentation, Git or chat.

Do not fabricate generated component references or working sign-in before the deployment exists. Do not silently import browser-local tasks into an account. Existing local storage remains local until explicitly migrated.

## Learning checkpoint

Explain the difference between signing in and checking task ownership. Then inspect the request flow above. Phase 2A's provider choice is accepted; live setup and user review of the flow remain pending.

Sources checked 16 September 2026: https://labs.convex.dev/better-auth/framework-guides/next and https://labs.convex.dev/better-auth .

## 17 September — Phase 2B implementation decisions

- User selected email/password, with email verification and recovery deferred until a separately agreed delivery setup.
- Installed `@convex-dev/better-auth` 0.12.5 and pinned `better-auth` 1.6.22. The component provides auth persistence without a separate ORM. The packaged component is sufficient for this scope; the local-component approach in the user's [Better Auth integration guide](https://better-auth.com/docs/integrations/convex) adds schema maintenance for future custom auth fields/plugins.
- User approved Vitest 4.1.11 because Better Auth declares Vitest 2–4 optional peer compatibility. npm 10 crashed resolving the downgrade; a temporary npm 11 runner completed it without modifying global npm. Subsequent auth installs worked with existing npm. No force/legacy-peer-deps override was used.
- The guide's baseline 1.6.15 passed types but audit reported GHSA-qq9h-g4jm-xgf3. Version 1.6.22 includes the fix and audits clean. Both 1.6.22 and the initially resolved 1.6.33 trigger the upstream provider type bug [#420](https://github.com/get-convex/better-auth/issues/420).
- User explicitly approved one `@ts-expect-error` at the provider's `authClient` prop. Runtime browser checks verify the integration. This suppresses checking at that one prop; it is a known maintenance limitation, not an upstream fix. Re-evaluate on dependency updates; TypeScript will report an unused directive once the mismatch disappears.
- Keep the provider on `/account` for this phase. Native forms and Better Auth server validation suffice for three fields; no React Hook Form, TanStack, email service, or UI library was added.
- Identity lookup returns null for missing/revoked sessions so sign-out can complete while a reactive query is still subscribed. Task queries still reject unauthenticated access. Profile responses expose only name/email.

Final verification: nine tests, lint, typecheck, production build, deployed auth flow, and zero reported npm audit vulnerabilities. No production deployment or two-account task isolation test is claimed.

## 24 September — Phase 2C implementation decisions

- Require sign-in for `/work`; do not show a second local task board there.
- Use Convex's existing React hooks rather than adding TanStack Query. Convex already owns subscriptions, request state and generated API types.
- Add `convex-test` 0.0.56 as a development dependency. It runs functions against the real schema/modules with synthetic trusted identities, which makes authorization and pagination tests meaningful without writing to the remote deployment.
- Keep native React forms for this small task contract. React Hook Form/Zod resolver remain deferred until form complexity creates a concrete need.
- New cloud tasks always start `Ready`. Editing is limited to title, lane, minutes, energy and done condition. Status transitions, next-step updates and focused session records remain Phase 2D.
- Start with an empty cloud workspace and do not auto-upload local seed/user data. The local and Convex ID models need an explicit migration design.
- Paginate with `paginationOptsValidator` and `usePaginatedQuery`, initially 12 records and 12 per explicit load. Map the server result to omit the owner token.

Verification on 24 September: TypeScript, ESLint and 11 Vitest tests passed; the production build and Convex development sync succeeded; signed-out gating, Account A create/edit/reload, Account B isolation, two-tab reactive updates and cross-tab sign-out passed in the live browser. User review remains open.
