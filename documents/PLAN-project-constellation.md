# Plan: the project constellation (Work → Projects → Visual)

Proposed and built 9 October 2026 (C1–C6; C7 in part, see "Status"). Design: the owner's "Project Constellation" canvas, saved as [design/project-constellation.dc.html](design/project-constellation.dc.html). It is built to match exactly, but with real data instead of the canvas's example data.

## What it is

A **Visual** tab beside List in Work → Projects shows one project as a living map, from the first thought to today. It reads left to right:

| Column | Shows | Shapes in the design |
|---|---|---|
| **01 Genesis** | Where it came from: the idea, the research behind it, and the report it produced | A lilac diamond for the idea; a field of source dots for research, where bright dots are briefs Claude wrote through MCP; a document glyph for the report |
| **02 Project** | The project itself | An ember orb in a progress ring, with "N% FORMED" |
| **03 Docs** | The documents the plan stands on: PRD, system design, API & MCP, schema, UI flow, design system | Cards with a code (PRD, SYS…), a name and "Feeds N phases". A doc not yet written is faded. |
| **04 Phases** | The phase-by-phase plan | One row per phase with a hexagon anchor, number, name, % and a bar. Under it, **one hexagon cell per task**: done (filled ember), doing (half-filled, pulsing), ready (outline), blocked (red). |

- **Edges:** curves join Genesis → Project → Docs → the phases each doc feeds. Light flows along the edges that are already "live".
- **Selecting:** selecting a doc or phase lights its connections and dims the rest.

**Drilling in**
- **A phase** opens on a double-click, or with "Open phase NN ›":
  - a large hexagon shows the phase's %, "N OF M TASKS" and its state;
  - milestones are clusters (5A, 5B…), and tasks are honeycomb cells, filled by status;
  - a task cell in progress fills up like liquid, by its progress.
  - Click a cell for its story. Phases are stepped through with ‹ ›.
- **Genesis** opens to a timeline: Idea → Brainstorm → Research threads (with their sources) → Report → **Decision** (mint gate) → Project, with times. A note at the bottom reads "26 HOURS · From a thought … to a project".

**Breadcrumbs:** "Becoming › Phase 05 · Reliability & real use › 5C·1 Log ten real evenings", with Back.

**The side panel** describes whatever is selected:
- **Project:** % formed, phases done, sessions, hours focused; where it came from; next step and done when; activity.
- **Phase:** %, milestones, sessions, hours; milestone bars; "Built from" doc chips; next step and done when; activity.
- **Task:** milestone, planned minutes, sessions (n of planned), skills; built-from docs; next step, or what's blocking it; a **timeline** from `taskEvents`. Its button is Start focus or Unblock.
- **Doc:** tasks it informs, phases fed, sections, last edit; "Feeds · open a phase" chips; next edit; activity.
- **Genesis step:** what happened, plus its details (sources, findings, kept and dropped).

**Activity** shows "You" and "Claude Code **MCP**" entries, from `taskEvents.source` and approvals.

**Replay:** a scrubber under the map has a play button, day ticks per phase and "N% FORMED". It replays how the project grew day by day: docs appear when written, and cells fill when tasks were done.

**Motion:** nodes breathe softly, light flows along the edges, levels enter with a rise, and reduced motion turns it all off.

## Data it needs (all honest, nothing invented)

| Need | Today | Change |
|---|---|---|
| Idea → project link | `projects.ideaId` | Already there |
| Brainstorm | `ideas.brainstorm` | Already there |
| **Research threads and sources** | none | `research`: owner, ideaId, thread title, sources (title, optional url, kind: read / interview / tried / brief, `source` "app" or the assistant), dates |
| **Report and findings** | none | `reports`: owner, ideaId, title, findings (each with the source it traces to), date |
| **Decision** | none | On the report, or its own record: decision, kept, dropped, rule, date |
| **Phases** | none (projects → milestones → tasks) | `phases`: projectId, order, name, goal, next step, done when. Milestones gain an optional `phaseId`, and milestone codes (5A, 5B) come from order. |
| **Docs** | none | `projectDocs`: projectId, code, title, kind, summary, sections, optional link (for example the file in your repo), phases it feeds, next edit, done when, written-at and updated-at |
| Task timeline | `taskEvents` | Already there (Phase 1 of the task plan) |
| Sessions and hours per phase | `sessions.projectId`, task links | Derived |
| Task "n of planned" | none | Optional `plannedSessions` on a task; the count comes from its sessions |
| Replay dates | `startedAt`, `completedAt`, events, doc dates | Derived. History before 9 October is partial and is shown as such. |

**Projects without the new layers still work:**
- milestones with no phase show as one plan, without phase rows;
- a project with no idea or research shows a Genesis of just "Started as a project".

## Claude keeps it current (MCP)

New tools. Each one is a proposal in the Inbox unless decided otherwise:
- **`import_plan`:** sends a whole plan (phases → milestones → tasks, plus the docs and which phases each feeds) as **one** Inbox item. This is how "proposed 9 tasks from PLAN.md" works.
- **Docs:** `add_doc` and `update_doc` (sections, summary, next edit, link).
- **Research:** `add_research` (a thread and its sources, marked "brief" when Claude wrote it), `write_report` (findings) and `record_decision`.
- **Phases:** `add_phase` and `set_phase_next`.
- **Reads:** `get_constellation` (a whole project map) and `get_phase`.

## Build phases

| # | What | Size |
|---|---|---|
| C1 | **Schema and backend:** phases, docs, research, reports, decision; milestone `phaseId`; task `plannedSessions`; one `projects.constellation` query that returns the whole map with derived status, %, sessions, hours, edges and a replay timeline; backups and delete | Large |
| C2 | **The Visual tab: overview.** The List / Visual switch in Work → Projects, the overview map (Genesis, core, docs, phase rows with cells, edges, flow and dimming), the side panel and the keyline legend | Large |
| C3 | **Phase level** (hexagon, clusters, honeycomb, task story with its timeline) and the breadcrumbs, back and ‹ › | Medium–large |
| C4 | **Genesis level** (timeline from idea to project), plus places in the app to add research, a report and a decision (Ideas → brainstorm) | Medium |
| C5 | **Replay scrubber**, from real dates | Medium |
| C6 | **MCP tools** (`import_plan` and the others), and importing Becoming's own plan as the first real constellation | Medium |
| C7 | **Editing from the map:** add a phase, link a doc to phases, assign milestones to phases | Medium |

## Status (9 October 2026)

| # | Status |
|---|---|
| C1 | **Done.** Tables `phases`, `projectDocs`, `research`, `reports`; `milestones.phaseId`; `tasks.plannedSessions`. `constellation.get` (convex/constellation.ts) returns the whole map; genesis lives in convex/genesis.ts. Export, restore and delete cover the new tables. |
| C2 | **Done.** The List / Visual switch (`?visual=1`), overview, edges, flow, dimming, side panel and legend, in `src/components/constellation/` with styles in `src/styles/constellation.css` (scoped under `.cx`). |
| C3 | **Done.** Phase level with hexagon, clusters, honeycomb, task story and timeline, breadcrumbs and ‹ ›. |
| C4 | **Done.** Genesis timeline; Research, Report and Decision sections in Ideas → brainstorm. |
| C5 | **Done.** The replay scrubber, from `startedAt`, `completedAt`, events and doc dates. |
| C6 | **Done.** MCP tools `get_constellation`, `get_phase`, `add_phase`, `add_doc`, `update_doc`, `add_research`, `write_report`, `record_decision` and `import_plan` (see ASSISTANTS.md). `set_phase_next` was folded into the app's phase editing and isn't an MCP tool yet. Becoming's own plan was sent to the Inbox as one `import_plan` item (12 phases, 44 milestones, 74 tasks, 12 docs), waiting for approval. |
| C7 | **In part.** Phases and docs are added, edited, reordered and linked on the project page (Work → Projects → a project: Phases and Docs cards, and a Phase select on each milestone), and planned sessions on the task form. Editing directly on the map is still ahead. |

**Choices made while building:**
- **The liquid fill** of an in-progress cell is its sessions out of `plannedSessions`, or else focused minutes out of the estimate.
- **Narrow screens:** the canvas scales down to 72%, then scrolls sideways, rather than reflowing, so the map keeps the design's shape.
- **Becoming's genesis** is empty until an idea is linked: a plan import can't create research or a report, so they come from Ideas → brainstorm or the genesis tools.

**Verified:** 165 tests, typecheck, lint and build pass. The overview, phase level and genesis rendered against the design's example data at 1440px through a dev-only fixture page, since deleted. A signed-in walkthrough on real data is pending.

## Decisions (answered 9 October)

1. **Documents:** Becoming keeps each doc's details and a link to your repo file, and Claude syncs them through MCP. The writing stays in your repo.
2. **Research, report and decision** can be added in the app (in an idea's brainstorm) and by Claude through MCP.
3. **A whole plan** arrives as one Inbox item, approved once.
4. **After building,** Becoming's own documents and PLAN.md become its first real constellation, sent as proposals to approve.
