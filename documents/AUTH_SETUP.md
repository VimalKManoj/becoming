# Authentication — email/password, email verification, password reset and Google

> **Current state (9 October 2026):** new accounts confirm their email before they can sign in, "Forgot password?" sends a reset link, and "Continue with Google" appears once a Google OAuth client is set. Emails go through **Resend** (`convex/lib/email.ts`). Without a Resend key on a local deployment, the links are written to the Convex logs instead (the terminal running `npm run backend`), so development works with no email account. See "Email and Google setup" below.


> **Current state (2 October 2026):** every workspace screen now uses Convex and requires sign-in. Settings can delete the account: it confirms the password by signing in again, deletes all workspace data, then calls Better Auth's `deleteUser` (`user.deleteUser.enabled` in `convex/auth.ts`). Recovery email is still not configured. The provider wraps the whole app from `src/app/layout.tsx`, with one shared client. The sentences below about browser-local task screens describe the original 17 September checkpoint.

This checkpoint adds real sign-up, sign-in, sign-out and an authenticated identity query at `/account`. It does not connect the task screens to Convex. Those screens still use browser-local storage shared by accounts using that browser profile; signing out does not erase it.

## Request flow and files

1. `src/components/account-screen.tsx` sends form values through `src/lib/auth-client.ts`. Native form validation handles basic input; Better Auth also validates on the server. Passwords are never placed in our local workspace store.
2. `src/app/api/auth/[...all]/route.ts` forwards auth requests through `src/lib/auth-server.ts` to Convex's HTTP site. The same-origin route allows the browser to use session cookies.
3. `convex/http.ts` registers Better Auth routes. `convex/auth.ts` configures email/password authentication using the component's database adapter.
4. `convex/convex.config.ts` installs the component. It owns its own user, account, session and verification tables, separate from our task schema. We do not add passwords to profiles or install an ORM.
5. `src/components/auth-provider.tsx` connects the session to Convex's authenticated React client. Since 2 October it holds one module-level client and wraps the root layout, so `/account` and all workspace routes share one connection. At the original checkpoint it wrapped only `/account`.
6. `auth.getCurrentUser` checks the Better Auth session and returns null when it is missing/revoked; for a valid session it checks the trusted identity through `requireOwner` and returns only name/email. The UI says “Convex identity confirmed” only after this query succeeds.

## Development setup

Run `npm install` and `npm run backend` to link your own development deployment. Keep `.env.local` ignored. It needs `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` from the CLI. The `.cloud` URL serves queries; the `.site` URL serves HTTP auth routes. The example also records `NEXT_PUBLIC_SITE_URL=http://localhost:3001`; current client code uses its same origin automatically.

In the Convex development environment set:

- `SITE_URL`: `http://localhost:3001`.
- `BETTER_AUTH_SECRET`: a cryptographically random secret of at least 32 bytes. Store it only in Convex environment configuration. Preserve it across ordinary restarts.

Then run `npm run backend` to sync functions and generate component types, and `npm run dev` to start Next.js. Open `http://localhost:3001/account`. Use localhost consistently; a different host/port requires corresponding origin configuration. No production deployment is configured by this checkpoint.

## Email and Google setup (9 October 2026)

**How it works.** `convex/auth.ts` sets `requireEmailVerification: true`, sends a verification link on sign-up and again when an unconfirmed account tries to sign in, signs you in after you click it (`autoSignInAfterVerification`), and sends reset links (`sendResetPassword`, which also signs out your other sessions). Links point at the app (`SITE_URL/api/auth/...`), which forwards them to Convex, and they return to `/account`: `?verified=1` after confirming, `?token=…` to choose a new password, `?error=…` when a link has expired. Links work for one hour.

**Locally, with no email service.** Leave `RESEND_API_KEY` unset. Sign up, then copy the link from the `npm run backend` terminal ("[email not sent: RESEND_API_KEY isn't set] …"). This only happens when `SITE_URL` is `http://localhost` or `http://127.0.0.1`; any other deployment refuses to sign up without a key rather than silently dropping the email.

**Throwaway test accounts, locally.** To skip confirmation entirely, run `npx convex env set SKIP_EMAIL_VERIFICATION true` (dev deployment). New accounts are then signed in straight after sign-up, and unconfirmed ones can sign in. It only works while `SITE_URL` is a localhost address, so it can't switch confirmation off in production even if copied there. Turn it back on with `npx convex env remove SKIP_EMAIL_VERIFICATION` before testing the real email flow (QA B1a).

**Resend (free: 3,000 emails a month, 100 a day, one domain).**
1. Create an account at resend.com and an API key (sending access only).
2. In the Convex dashboard for the deployment (dev or production), set `RESEND_API_KEY`.
3. Without your own domain, Resend sends only to the address of your Resend account, from `onboarding@resend.dev`. That's enough for your own account. To email anyone else, verify a domain in Resend (a few DNS records), then set `EMAIL_FROM`, for example `Becoming <hello@yourdomain.com>`.

**Google sign-in (free).**
1. Google Cloud Console → a new project → **APIs & Services → OAuth consent screen**: External, app name Becoming, your email as support contact. Scopes: the default email and profile only.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `http://localhost:3001` (and later your Vercel address).
   - Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google` (and later `https://<your-vercel-address>/api/auth/callback/google`). The callback goes to the app's own address, which forwards it to Convex.
3. In the Convex dashboard set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (use separate clients, or at least separate redirect URIs, for dev and production). The button appears on the sign-in screen as soon as both are set (`auth.signInOptions`).
4. While the consent screen is in **Testing**, only the test users you list can sign in (up to 100). Publish it when others should be able to.

Google confirms the address, so a Google sign-in with the same email joins the existing account (`accountLinking` with Google as a trusted provider). A Google-only account has no password: deleting it in Settings needs a sign-in from the last day instead.

## Current limits

- An account that existed before 9 October has an unconfirmed email. Its next sign-in sends a confirmation link (in the logs locally).
- Passwords require 12–128 characters on the server. Sign-in failures use a generic message. Better Auth owns credential hashing and session handling.
- There is no automatic import of old browser-local data and no friend invitation flow. Account deletion exists in Settings (it confirms the password first).
- Inviting friends needs a verified sending domain in Resend (until then, email only reaches your own Resend address).

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

## Evening reminders: email and notifications (9 October 2026)

**What happens.** `convex/crons.ts` runs `reminders.sendDue` every 15 minutes. A person gets a reminder when all of these are true:
- reminders are on, and a timezone is set;
- their chosen time (7:30, 8:30 or 9:30 pm) has just arrived in their timezone, on a chosen day (weekdays or every day);
- they haven't saved a session today, and this week isn't a planned pause.

Each person gets at most one a day (`profiles.lastReminderDay`). It goes:
- **By email** to the account's address, if it's confirmed and "By email" is on. The email names tonight's suggested step, using the same recommender as Today at 45 minutes and steady energy.
- **As a notification** on every device that turned "On this device" on.

**Notifications (Web Push).**
- The browser subscribes through `public/sw.js` with the deployment's public key, and the subscription is stored in `pushSubscriptions`.
- Becoming sends an *empty* push signed with VAPID (`convex/lib/webpush.ts`), so no message encryption or package is needed. The service worker shows a fixed message and opens Today.
- Devices the push service reports as gone are forgotten.
- On iPhone, notifications only work after **Add to Home Screen**. The app is installable through `src/app/manifest.ts`, with icons from `/pwa-icon`.

**Keys (per deployment).**
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK` were generated and set on the **dev** deployment on 9 October.
- For **production**, generate a new pair and set both on production Convex. Optionally set `VAPID_SUBJECT` (`mailto:…` or your https address).
- To generate a pair: `node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});console.log(JSON.stringify(k));console.log(Buffer.concat([Buffer.from([4]),Buffer.from(k.x,'base64url'),Buffer.from(k.y,'base64url')]).toString('base64url'))"`. The first line is the private JWK; the second is the public key. Don't paste either into chat.

**Email** uses the same `RESEND_API_KEY` as account emails. Without it, nothing is sent, and Settings says so.

**Testing locally.**
1. In Chrome on `localhost`, turn on Settings → Evening reminder → On this device.
2. Press **Send a test notification**.
3. Phones need the deployed https address.
