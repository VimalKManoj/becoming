# Form — collaborative building agreement

Read this file before planning or changing this app. It applies to code, design, architecture, dependencies, database work and deployment.

## Purpose

Help the user learn and actively shape the app. Act as a collaborative mentor. Do not complete large batches of work independently and explain them only afterwards.

## Before each phase

1. Read documents/PLAN.md and documents/LEARNING_LOG.md. Inspect relevant code before making claims about current behaviour.
2. State the active phase, its outcome, what is already built, and what remains proposed.
3. Explain the steps, important files, proposed stack and meaningful trade-offs in plain language.
4. Discuss architectural changes, new dependencies, authentication providers, data migrations and scope expansion with the user before implementing them.
5. Agree on one bounded phase or subphase. A request to continue authorizes that agreed scope, not the entire roadmap.

## While implementing

- Explain important decisions and their rationale, with practical examples and file references.
- Give concise updates at meaningful milestones and keep the user involved.
- Use judgment for routine details inside the agreed scope; do not ask for every small edit.
- If an unexpected issue changes the approach or scope, explain it before proceeding with the changed plan.
- Preserve the user's edits and leave room for the user to redesign screens and flows.
- Do not silently add libraries, create accounts, deploy services, publish source, or enable integrations.

## Close each phase

Report the outcome, changed files, how the pieces connect, decisions and alternatives, checks actually run, failures or unverified areas, and one exercise for the user. Update the plan and learning log with accurate status. Propose the next phase and pause for the user's review before starting it.

Separate implementation from user review: code can exist and pass tests without the user having reviewed or accepted it. Never mark that review complete on the user's behalf.

## Project boundaries

- Form is an independent app and Git repository, separate from portfolio_website.
- Current stack: Next.js, React, TypeScript, Tailwind CSS, Zod, Lucide, ESLint and Vitest. Explain each dependency when it becomes relevant.
- Convex is the selected backend. Its schema/functions and development authentication exist; cloud workspace UI integration is not complete.
- Browser-local learning mode must remain clearly labelled until cloud integration is verified. Do not call it cloud persistence.
- Better Auth with Convex is selected for authentication; TanStack is excluded for now. See documents/STACK_DECISIONS.md. Production hosting and open-source license remain undecided.
- Future friends should have private owner-scoped data. Public source code does not mean public personal data.
- ChatGPT connections and automatic publishing are deferred. No model API is needed for the core workflow.

## Documentation

- documents/PLAN.md: canonical roadmap, active checkpoint and acceptance gates.
- documents/PRD.md: product intent and expected complete behaviour.
- documents/SYSTEM_DESIGN.md and DATABASE.md: architecture and data decisions.
- documents/APPROACH.md: implementation principles and trade-offs.
- documents/LEARNING_LOG.md: what changed, why, evidence, and limitations.
- documents/CONVEX_SETUP.md: future backend setup, not a claim of completed integration.

Treat prototypes and plans as references, not proof of implementation. Record proposed / implemented / verified / user-reviewed separately. Do not repeat old test results as fresh verification.

## Current checkpoint

The user selected Better Auth with Convex and approved the proposed stack direction. Phase 2B development email/password sign-up, sign-in/out and Convex identity verification are implemented and tested. Review /account and documents/AUTH_SETUP.md before starting 2C. Email verification/recovery are incomplete; workspace data remains local. Prior foundation walkthrough checkpoints remain pending, not retroactively completed. Follow documents/PLAN.md and STACK_DECISIONS.md; do not implement later phases automatically.

## Detailed phase learning notebook

The user requires detailed explanations, file changes and important code for learning after every phase. Maintain the local-only `documents/phase-learning/` folder using its PHASE-TEMPLATE.md. It is intentionally gitignored; do not stage or force-add it. If absent in a fresh clone, recreate the index/template from this requirement rather than treating it as committed project setup.

For each agreed phase/subphase, update a separate Markdown guide during implementation and finalize it before the handoff. Include: status/date/scope, prerequisites and learning goals, meaningful decisions with alternatives/trade-offs/user choices, every added/modified/deleted/generated file with purpose and inputs/outputs/callers, verified before/after examples, annotated important real code, an end-to-end flow, dependencies/configuration/commands, troubleshooting attempts and final diagnosis, dated validation evidence and coverage limits, remaining work, exercises with expected observations, and the user's review notes. Use actual Git diffs when available; label current snapshots or pseudocode clearly and never invent earlier versions.

Preserve the user's personal annotations. Backfill implemented phases from inspected source and recorded evidence; future phases must remain explicitly proposed and receive real code/change details when implemented. Do not claim tests were rerun merely because documentation was updated. Keep concise shared PLAN, LEARNING_LOG and setup/architecture docs accurate as well, so a fresh clone can be understood without private notes. Never include secret values, tokens, cookies or personal exports in either set of documentation.
