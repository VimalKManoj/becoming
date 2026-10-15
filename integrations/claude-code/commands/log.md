---
description: Log this session's work on a Becoming task that isn't finished yet, with the next step
argument-hint: "<minutes, like 45m> [what changed]"
allowed-tools: mcp__becoming__get_task, mcp__becoming__list_tasks, mcp__becoming__log_session, mcp__becoming-prod__get_task, mcp__becoming-prod__list_tasks, mcp__becoming-prod__log_session, Bash(git log:*), Bash(git remote get-url:*), Bash(git rev-parse:*), Bash(gh pr view:*)
disable-model-invocation: true
---

Log the work this session did on a Becoming task, as a session, without finishing the task.

Use the Becoming MCP server named in this session's context by the Becoming hook. If none is named, use the server called `becoming`.

What I gave: $ARGUMENTS

1. The task is the one this session started with `/becoming:next`. If there isn't one, call `list_tasks` and ask me which task this was.
2. Minutes must be real. Take them from what I gave above (like 45m or 1h 20m). If I gave none, ask me how long I worked. Never guess.
3. Write `what_changed`: one or two plain sentences on what moved forward. Work in what I gave above.
4. The outcome is `progress`, unless I said it's finished (then use `/becoming:done`) or blocked (then `blocked`, with what's in the way as the next step).
5. Write `next_step`: the very next thing to do, so the next session can start straight away.
6. Pick the skills the work really used, one to three of: Frontend, Interaction, Motion, Visual, Writing, Research, Systems, Shipping. Add `evidence_url` if there's a pull request or a pushed commit.
7. Call `log_session` with the task, minutes, outcome, what_changed, next_step, skills and evidence. Tell me what was recorded and whether it "applied" or is "waiting for approval".
