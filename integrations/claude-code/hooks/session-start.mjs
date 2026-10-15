// Becoming's SessionStart hook (PLAN-one-tap-and-daily-loop, Phase 2). When a Claude Code
// session starts, it adds the tasks In progress in Becoming to the session's context, so
// Claude knows what's active and can match the work to one of them.
//
// It finds the Becoming MCP server like this, first match wins:
//   1. BECOMING_MCP_URL and BECOMING_MCP_TOKEN, if both are set;
//   2. the server named BECOMING_SERVER (default "becoming") in Claude Code's config: this
//      project's .mcp.json, then this project's local servers and your user servers in
//      ~/.claude.json.
// It never blocks a session. When Becoming can't be reached it says so in one line, and when
// no server is set up it stays quiet. Only reads: it calls list_tasks, nothing else.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const serverName = process.env.BECOMING_SERVER || "becoming";

/** The hook's input from Claude Code (cwd, source…), or {} when there's none. */
async function hookInput() {
  if (process.stdin.isTTY) return {};
  let text = "";
  process.stdin.setEncoding("utf8");
  const read = new Promise(done => { process.stdin.on("data", chunk => { text += chunk; }); process.stdin.on("end", done); });
  await Promise.race([read, new Promise(done => setTimeout(done, 1000))]);
  try { return JSON.parse(text || "{}"); } catch { return {}; }
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

/** ${VAR} and ${VAR:-default} in a config value, as Claude Code expands them. */
const expand = value => String(value ?? "").replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_, name, fallback) => process.env[name] ?? fallback ?? "");
const samePath = (a, b) => resolve(a).replace(/\\/g, "/").toLowerCase() === resolve(b).replace(/\\/g, "/").toLowerCase();

async function findServer(cwd) {
  if (process.env.BECOMING_MCP_URL && process.env.BECOMING_MCP_TOKEN) {
    return { url: process.env.BECOMING_MCP_URL, authorization: `Bearer ${process.env.BECOMING_MCP_TOKEN}` };
  }
  const project = await readJson(join(cwd, ".mcp.json"));
  const config = await readJson(join(homedir(), ".claude.json"));
  const local = config?.projects && Object.entries(config.projects).find(([path]) => samePath(path, cwd))?.[1];
  const entry = project?.mcpServers?.[serverName] ?? local?.mcpServers?.[serverName] ?? config?.mcpServers?.[serverName];
  if (!entry?.url) return null;
  const headers = Object.fromEntries(Object.entries(entry.headers ?? {}).map(([key, value]) => [key.toLowerCase(), expand(value)]));
  return { url: expand(entry.url), authorization: headers.authorization ?? "" };
}

async function inProgress(server) {
  const response = await fetch(server.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(server.authorization ? { Authorization: server.authorization } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tasks", arguments: { status: "open" } } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "the token was refused (revoked or mistyped?)" : `it answered ${response.status}`);
  const body = await response.json();
  const content = body?.result?.content?.[0]?.text;
  if (body?.error || body?.result?.isError || typeof content !== "string") throw new Error(body?.error?.message ?? content ?? "it sent an answer I couldn't read");
  return JSON.parse(content).filter(task => task.status === "In progress");
}

function describe(tasks) {
  const tools = `the "${serverName}" MCP server's tools`;
  if (tasks.length === 0) {
    return `Becoming (the user's work tracker, through ${tools}): nothing is in progress. If this session works on a Becoming task, /becoming:next picks and starts one.`;
  }
  const lines = tasks.slice(0, 5).map(task => {
    const parts = [`"${task.title}" (id ${task.id})`];
    if (task.project) parts.push(task.project);
    if (task.nextStep) parts.push(`next: ${task.nextStep}`);
    if (task.doneWhen) parts.push(`done when: ${task.doneWhen}`);
    return `- ${parts.join(" · ")}`;
  });
  return [
    `Becoming (the user's work tracker, through ${tools}) has ${tasks.length === 1 ? "this task" : "these tasks"} in progress:`,
    ...lines,
    ...(tasks.length > 5 ? [`- and ${tasks.length - 5} more (list_tasks shows them).`] : []),
    "If this session's work belongs to one of them, keep its id. When its done-when is met, the user can run /becoming:done (or you call complete_task with a summary, the skills and the PR or commit link). Don't move tasks without the user asking.",
  ].join("\n");
}

function say(context) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
}

try {
  const input = await hookInput();
  const server = await findServer(input.cwd || process.cwd());
  if (server) {
    try { say(describe(await inProgress(server))); }
    catch (error) { say(`Becoming's tasks couldn't be loaded at the start of this session: ${error?.name === "TimeoutError" ? "it didn't answer in time" : error?.message ?? error}.`); }
  }
} catch {
  // Never block a session.
}
process.exit(0);
