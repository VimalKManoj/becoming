# Learning log

## 15 September 2026 — foundation and local core loop

### What changed

Created Form as an independent Next.js app with six routes, a token-based visual foundation, local validated storage and pure recommendation/session logic. Preserved the PRD and original prototype. Added a Convex schema and authenticated starter task functions, without creating a cloud deployment.

### Why this sequence

You can redesign and use the flow immediately, then learn exactly what moves from browser storage to server-authoritative Convex functions. The local learning mode is clearly labelled so it is not mistaken for cloud persistence.

### Trace a feature

1. Open Today and change capacity.
2. `recommend()` filters effort, energy, prerequisites and states, then balances recent lanes.
3. Start writes an active session through `updateWorkspace()`.
4. The store validates and persists before notifying React subscribers.
5. Recap calls `finishSession()`, which updates the task and adds session evidence exactly once.
6. Journey derives counts from real session records rather than mutable counters.

### Convex concepts already visible

Tables and indexes live in schema code. Functions derive owner from trusted identity. `tasks.recordSession` groups its writes in one mutation. Full cloud session parity, auth integration and live backend verification remain phase 2 work.

### Validation

The handoff reports the checks actually run. The automated suite covers capacity, dependencies, lane variety, smaller-step completion, idempotency, resumption notes, timezone boundaries and ownership helpers. These tests do not verify a deployed Convex backend.

### Deliberate limitations

The first screen component is a functional baseline, to be split while you refine the design. Browser writes are last-writer-wins across tabs. No cloud migration, historical streaks, full milestones, auth or automated ChatGPT connection is implemented. Source has not been published or licensed for public reuse yet.

## Template for the next entry

- Outcome and phase:
- Files worth reading:
- New concept learned:
- Decision and trade-off:
- What was tested, with evidence:
- What remains incomplete:
- Artifact to capture for your portfolio:

## Foundation verification — 15 September 2026

- TypeScript: passed.
- ESLint: passed with no lint warnings after configuration cleanup.
- Vitest 5.0.1: 8 tests passed across recommendation, session, timezone and ownership-helper behaviour.
- Dependency audit after patching the test runner: 0 reported vulnerabilities.
- Next.js production build: passed; all six workspace routes generated.
- Browser checks: active-session reload, saved recap persistence, parent remaining open after a smaller step, idea activation, required blocker/next-step validation, evidence visibility, and all six routes at 360px passed with no page errors.
- Desktop and mobile screenshots were visually reviewed. Local screenshots live in ignored test-results/.
- No Convex deployment or real-account isolation test was performed. Phase 2 remains open.

The test runner reports a non-blocking future Vite config-loader compatibility notice for vitest.config.ts. It does not affect the passing tests; rename that config to .mts when adopting native configuration loading.


## 16 September 2026 — collaborative workflow and full roadmap

Added agent.md with the user-required phase-by-phase mentoring agreement and linked it from AGENTS.md, preserving the generated Next.js guidance. Expanded PLAN.md into review checkpoints and small learning subphases covering the full app. Archived the prior plan. Existing implementation, historical verification and pending user review are now distinguished.

This was documentation-only. No dependencies, app behaviour, accounts or deployments changed. No application tests were rerun. Next is the R1 guided foundation walkthrough, not automatic Convex integration.


## 16 September 2026 — Phase 2A stack decision

User selected the recommended stack and Better Auth with Convex, with no TanStack now. Read current official integration guidance and recorded packages, request flow, configuration boundaries and the next small scope in STACK_DECISIONS.md. Installed Convex meets the documented minimum; runtime compatibility is not yet tested. No dependency, runtime code, deployment or credential changed. No tests rerun for this documentation-only checkpoint. Development-project status and live sign-in remain pending.


## 16 September 2026 — Becoming development connection

**Scope:** link the user's existing becoming project, generate types, sync the starter backend, and verify the connection. This does not include Better Auth installation or cloud UI migration.

**What changed:** Convex CLI stored its login outside the repository, created the git-ignored .env.local connection file, and generated convex/_generated API/server/database type helpers. The starter schema, indexes and functions were synced to the development deployment.

**Issue and decision:** the previous auth placeholder referenced AUTH_ISSUER_DOMAIN and prevented deployment. Removed that obsolete environment dependency and used an empty provider list until Better Auth is installed. The owner checks remain in place; this does not grant anonymous access.

**Verification:** Convex dev --once completed successfully; a live read-only tasks:list call without authentication returned the intended sign-in-required error. Git ignores .env.local. TypeScript checking completed after code generation. No production deployment, authenticated-user test or UI data migration was performed.

**Learn:** a deployment URL tells a client where the backend lives; generated types tell code how to call its functions. Neither automatically connects the existing React screens. The UI still uses browser-local storage.

**Exercise:** open the becoming development dashboard and inspect the tasks table indexes and tasks:list function. The tables may contain no records because local browser tasks were not uploaded.

**Next checkpoint:** review this connection, then implement Better Auth configuration and a small sign-in flow. The local folder/app branding still uses form pending a separate rename.

## 17 September 2026 — Phase 2B development email/password authentication

**Outcome:** user continued after manually committing groups 1–3. Added a real `/account` checkpoint for sign-up, sign-in/out and Convex identity confirmation. The six task/workspace screens remain explicitly browser-local. No commits were created or staged by the assistant.

**Files to read:** `convex/convex.config.ts`, `convex/auth.config.ts`, `convex/auth.ts`, `convex/http.ts`, `src/lib/auth-client.ts`, `src/lib/auth-server.ts`, `src/app/api/auth/[...all]/route.ts`, `src/components/auth-provider.tsx`, `src/components/account-screen.tsx`, and `documents/AUTH_SETUP.md`. Generated component types were refreshed by Convex. Added an Account navigation link and environment template; configured only the development secret and localhost origin.

**Decisions:** email/password chosen by user. Packaged auth component avoids maintaining a separate generated auth schema. Installed Better Auth 1.6.22 plus Convex adapter 0.12.5; user approved Vitest 4.1.11 for peer compatibility and one documented provider type exception for upstream #420. Native form handling remains sufficient at this scale. Full compatibility investigation and trade-offs are in STACK_DECISIONS.md.

**Bug learned from:** a reactive user lookup can run as its session is revoked during sign-out. Throwing in that expected transition caused an error state. Return null for a missing/revoked auth session; retain strict denial for protected task operations. The first newline-sensitive edit did not apply; inspected the actual file, corrected the edit, resynced, and reran the browser checks successfully.

**Verification performed:**

- TypeScript and ESLint passed; nine Vitest tests passed, including trusted-identity ownership behavior.
- Next.js production build passed (this is a build, not a production deployment).
- Convex development sync succeeded with the packaged auth component.
- Browser registration, identity query, reload, sign-out with null session, signed-out reload, invalid-password error and subsequent valid sign-in all passed.
- An authenticated tasks:list read succeeded; an anonymous task query was rejected; an anonymous identity query returned no user.
- Mobile 360px layout had no horizontal overflow; desktop/mobile screenshots reviewed in ignored test-results/. No browser page errors on the final run.
- Final package installation audit reported zero vulnerabilities. `.env.local` remains ignored; secrets were never committed or printed.

**Limits:** verification/recovery email delivery, production configuration, multi-account task isolation, account deletion and local-data migration are not complete. Three labelled development test accounts remain from browser checks; no emails were sent. Vitest still emits the existing non-blocking future native-config-loader notice. The upstream provider type exception must be reviewed when upgrading dependencies.

**Exercise:** open `/account`, create your own development account, reload, sign out and try a wrong password. Explain why “Convex identity confirmed” proves more than a visible signed-in label, and why Today still uses browser storage. Trace the complete request in AUTH_SETUP.md.

**Next proposed phase:** 2C — owner-scoped task create/list/edit with real reactive persistence and pagination. Wait for the user's review before implementing it. Session migration remains 2D; earlier walkthroughs are not retroactively marked accepted.

## 18 September 2026 — detailed private phase notebook

User requested much deeper phase-by-phase learning documentation, including all files/decisions, file changes and important code, in a separate ignored folder. Added documents/phase-learning/ with completed-phase walkthroughs, explicit future-phase specifications, a full source-file guide, verified Git change history, annotated real code, exercises and a handoff template. Recorded all coverage as historical; no application tests were rerun for this documentation-only task.

Added /documents/phase-learning/ to .gitignore and expanded agent.md so every future handoff maintains these guides while preserving personal annotations. Existing concise shared docs remain available for future contributors. Corrected stale backend README/working-agreement descriptions of authentication. No runtime code, dependency, account or deployment changed; Phase 2C remains pending review. Documentation validation checks file links, catalogue coverage, fenced code blocks and ignore/tracking behavior.

Documentation checks on 18 September passed: 26 Markdown files, 209 local links resolved, all 61 current source/config/shared-document files covered, balanced fenced blocks, every learning file ignored and zero learning files tracked. Git diff whitespace check passed. Application tests were not rerun because runtime code did not change.
