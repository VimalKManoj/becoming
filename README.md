# Becoming

A practice worth building. An independent Next.js app for turning ideas and focused sessions into a design-engineering portfolio.

## Start here

Requires Node.js 22.14+, npm and your own Convex development deployment.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and fill it in. [Authentication setup](documents/AUTH_SETUP.md) explains each value and the two Convex dashboard variables. Never commit `.env.local`.
3. Run `npm run backend` once to link and sync your Convex development deployment, then `npm run dev`.

Open http://localhost:3001 and create a development account at `/account`. Every workspace screen requires a signed-in account, and records are private to that account.

```sh
npm run check
npm run build
```

`check` runs TypeScript, ESLint and the Vitest suite (including `convex-test` authorization tests).

## What exists today

- Next.js 16 App Router, React 19, TypeScript, Tailwind 4 and editable CSS tokens.
- Better Auth email/password sign-in for development, stored by its Convex component. Email verification and recovery are not set up yet.
- One shared Convex client and a persistent workspace shell, with six private sections:
  - **Today**:
    - an explained recommendation from your time, energy, prerequisites, recent lane balance, an optional pin and an optional favoured lane;
    - honest empty states and the last saved contribution;
    - focused sessions with elapsed time, and a recap with optional evidence;
    - a weekly rhythm strip.
  - **Work**:
    - Active, Blocked, Done and Archived task views, with unblock, reopen, archive, restore and prerequisites;
    - Projects with ordered milestones, derived progress and a Markdown case-study draft.
  - **Ideas**: capture, structured brainstorming, stages, activation (optionally into a project, with a smaller step), moving back, and archive.
  - **Proof**: Draft → Ready to share → Published (with a link and date), portfolio candidates, notes, skills, screenshots, and evidence added to past sessions.
  - **Journey**:
    - saved history with evidence and planned versus actual time;
    - weekly results, streaks and reflections;
    - lifetime counts, firsts, a 12-week activity calendar and suggestion insights.
  - **Settings**: motive, timezone and weekly target, planned pauses, lane preference, JSON export, restore into an empty workspace, and deletion of data or the whole account.
- **Design:** the owner's *Becoming Ritual* design (dark, Instrument Serif, Geist and Geist Mono). Today asks "What's on your mind tonight?", takes a ten-second check-in and offers one focus; after the session the Mind Bloom grows. Proof lives under Journey, next to a 12-month contributions graph and a three-step weekly review. See [documents/DESIGN_SYSTEM.md](documents/DESIGN_SYSTEM.md).
- Every query and mutation derives the owner from the signed-in identity; the browser never supplies it.

## Learn in order

1. [Document index](documents/README.md)
2. [Product requirements](documents/PRD.md)
3. [System design](documents/SYSTEM_DESIGN.md)
4. [Database design](documents/DATABASE.md)
5. [Implementation approach](documents/APPROACH.md)
6. [Phase-by-phase plan](documents/PLAN.md)
7. [Convex setup and exercises](documents/CONVEX_SETUP.md)
8. [Learning log](documents/LEARNING_LOG.md)

Open `documents/prototype.html` in your browser for the original clickable design reference. It has sample data and resets on reload; it is separate from the running app.

## Independence and future sharing

This folder has its own dependencies, lockfile, configuration and source. It has no runtime imports from the portfolio website and can be moved or cloned on its own. Port 3001 avoids a typical local portfolio server on 3000.

Open-source release is planned, not published. `private: true` prevents accidental npm publication; it does not prevent a public source repository. Choose a license before inviting reuse.

## Known scope boundaries

Email verification and password recovery, production deployment, open-source release preparation, a friend pilot and optional ChatGPT/GitHub connections are planned in `documents/PLAN.md`. The two-week personal trial is described in `documents/TRIAL_GUIDE.md`. Do not treat this as a production multi-user release.
