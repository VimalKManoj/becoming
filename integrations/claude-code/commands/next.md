---
description: Pick the Becoming task for this session (or the one you name), start it and load its context
argument-hint: "[task id or part of its title]"
allowed-tools: mcp__becoming__list_tasks, mcp__becoming__whats_next, mcp__becoming__get_task, mcp__becoming__start_task, mcp__becoming-prod__list_tasks, mcp__becoming-prod__whats_next, mcp__becoming-prod__get_task, mcp__becoming-prod__start_task
disable-model-invocation: true
---

Pick the Becoming task to work on in this session, start it, and load what it needs.

Use the Becoming MCP server named in this session's context by the Becoming hook. If none is named, use the server called `becoming`.

The task I asked for: $ARGUMENTS

1. If I named a task above, call `get_task` with it. If I didn't, call `list_tasks` and `whats_next`, show me the best two or three in one line each (title, project, why), and ask which one. Wait for my answer.
2. Call `start_task` for that task, unless it's already In progress. Its result says "applied" or "waiting for approval"; tell me which in a few words.
3. Call `get_task` (again if it changed) and read its done-when, next step, notes, phase, history, and the docs it's built from. When a doc links to a file in this repo, read the file if it helps.
4. Tell me, in four short lines: the task, what done looks like, where to pick up, and your plan. Then start the work.

Remember the task's id for this session: `/becoming:done` and `/becoming:log` use it.
