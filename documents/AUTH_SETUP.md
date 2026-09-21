# Phase 2B — development email/password authentication

This checkpoint adds real sign-up, sign-in, sign-out and an authenticated identity query at `/account`. It does not connect the task screens to Convex. Those screens still use browser-local storage shared by accounts using that browser profile; signing out does not erase it.

## Request flow and files

1. `src/components/account-screen.tsx` sends form values through `src/lib/auth-client.ts`. Native form validation handles basic input; Better Auth also validates on the server. Passwords are never placed in our local workspace store.
2. `src/app/api/auth/[...all]/route.ts` forwards auth requests through `src/lib/auth-server.ts` to Convex's HTTP site. The same-origin route allows the browser to use session cookies.
3. `convex/http.ts` registers Better Auth routes. `convex/auth.ts` configures email/password authentication using the component's database adapter.
4. `convex/convex.config.ts` installs the component. It owns its own user, account, session and verification tables, separate from our task schema. We do not add passwords to profiles or install an ORM.
5. `src/components/auth-provider.tsx` connects the session to Convex's authenticated React client. It currently wraps only `/account`; local workspace routes do not need auth yet.
6. `auth.getCurrentUser` checks the Better Auth session and returns null when it is missing/revoked; for a valid session it checks the trusted identity through `requireOwner` and returns only name/email. The UI says “Convex identity confirmed” only after this query succeeds.

## Development setup

Run `npm install` and `npm run backend` to link your own development deployment. Keep `.env.local` ignored. It needs `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` from the CLI. The `.cloud` URL serves queries; the `.site` URL serves HTTP auth routes. The example also records `NEXT_PUBLIC_SITE_URL=http://localhost:3001`; current client code uses its same origin automatically.

In the Convex development environment set:

- `SITE_URL`: `http://localhost:3001`.
- `BETTER_AUTH_SECRET`: a cryptographically random secret of at least 32 bytes. Store it only in Convex environment configuration. Preserve it across ordinary restarts.

Then run `npm run backend` to sync functions and generate component types, and `npm run dev` to start Next.js. Open `http://localhost:3001/account`. Use localhost consistently; a different host/port requires corresponding origin configuration. No production deployment is configured by this checkpoint.

## Current limits

- Email ownership is not verified. Password reset/recovery delivery is not implemented. This is a development checkpoint, not production-ready authentication.
- Passwords require 12–128 characters on the server. Sign-in failures use a generic message. Better Auth owns credential hashing and session handling.
- There is no automatic task import, account-scoped local storage, cloud task UI, account deletion UI, or friend invitation flow.
- Public production release requires verified-email registration, recovery delivery and screens, and the planned multi-account authorization checks. Choose the email delivery service together before adding it.

## Manual learning check

1. Create a development account with a unique password. Confirm the backend identity message.
2. Reload: the session and identity should remain.
3. Sign out, reload, and try an incorrect password; the page should recover with a readable error.
4. Sign in again. In browser Network tools, distinguish `/api/auth/...` HTTP requests from Convex's reactive connection. Do not share request cookies or tokens.
5. Return to Today. Explain why those tasks are still browser-local despite a working account.

Reference: [Convex + Better Auth Next.js guide](https://labs.convex.dev/better-auth/framework-guides/next) and [email/password guide](https://better-auth.com/docs/authentication/email-password), checked 17 September 2026.

## Compatibility checkpoint

The verified pair is Better Auth 1.6.22 and Convex component 0.12.5, with Vitest 4.1.11. There is one user-approved `@ts-expect-error` on the provider prop for upstream issue #420; see STACK_DECISIONS.md before updating these packages. Do not downgrade to an affected package merely to remove this type error.

Browser checks created three labelled `Auth checkpoint test` accounts under reserved `example.test` addresses in the development component during debugging. They are test fixtures, not the owner's account; no emails were sent. Passwords were randomly generated in memory, not saved in Git or documentation. The successful final check signed out its account.
