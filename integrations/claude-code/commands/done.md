---
description: Mark this session's Becoming task done, with a summary, its skills and the PR or commit link
argument-hint: "[anything to add, or the real minutes, like 45m]"
allowed-tools: mcp__becoming__get_task, mcp__becoming__list_tasks, mcp__becoming__complete_task, mcp__becoming-prod__get_task, mcp__becoming-prod__list_tasks, mcp__becoming-prod__complete_task, Bash(git log:*), Bash(git status:*), Bash(git remote get-url:*), Bash(git rev-parse:*), Bash(gh pr view:*)
disable-model-invocation: true
---

Record the finished work in Becoming.

Use the Becoming MCP server named in this session's context by the Becoming hook. If none is named, use the server called `becoming`.

What I added: $ARGUMENTS

1. The task is the one this session started with `/becoming:next`. If there isn't one, call `list_tasks` and ask me which task In progress this was.
2. Call `get_task` and check its done-when against what this session did. If it isn't met yet, say what's left and ask me whether to finish it anyway or use `/becoming:log` instead. Wait for my answer.
3. Write the summary: two or three plain sentences on what changed in this session. Work in what I added above.
4. Pick the skills the work really used, one to three of: Frontend, Interaction, Motion, Visual, Writing, Research, Systems, Shipping.
5. Find the evidence: this branch's pull request (`gh pr view --json url`), or else the latest commit's page on the remote (from `git remote get-url origin` and `git rev-parse HEAD`). If there's neither, leave it out.
6. Call `complete_task` with the task, the summary, the skills and `evidence_url`. Send `minutes` only if I gave real minutes above (like 45m). Never guess minutes.
7. Tell me what was recorded, whether it "applied" or is "waiting for approval", and that Undo is on the task's history in Becoming.
