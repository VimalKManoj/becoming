# Form documents

| Document | What you learn |
|---|---|
| [PRD](PRD.md) | What problem we solve and how the complete product behaves |
| [Experience map](EXPERIENCE_MAP.md) | Screen features, user journeys, states and design priorities, with implementation status |
| [Prototype](prototype.html) | Original clickable interface; open in a browser |
| [Prototype source](prototype.fragment.html) | Original editable fragment, retained for reference |
| [System design](SYSTEM_DESIGN.md) | Which layer owns each responsibility |
| [Database](DATABASE.md) | Tables, indexes, ownership, and transactions |
| [Approach](APPROACH.md) | Why we chose this structure and how to change it |
| [Plan](PLAN.md) | Phases, practical exercises, acceptance gates, and status |
| [Convex setup](CONVEX_SETUP.md) | How to connect the next backend slice yourself |
| [Authentication setup](AUTH_SETUP.md) | Trace and test the development email/password flow |
| [Learning log](LEARNING_LOG.md) | What was implemented and how to trace it |

The PRD and prototype describe the intended product. PLAN and LEARNING_LOG describe the actual implementation. A planned feature in the PRD is not a claim that it is built.

The standalone prototype includes its original preview styling and embedded scripts. Some optional icons rely on external assets from its original renderer. It is not served as part of the Next.js app and has no connection to its storage.

## Personal phase learning guides

Detailed private learning guides are maintained locally under `documents/phase-learning/`, with an index, one chapter per phase/subphase, a full file guide, verified change history, annotated code and a future-phase template. This folder is intentionally gitignored and will be absent from ordinary clones. Shared setup instructions and the canonical plan remain in this directory.
