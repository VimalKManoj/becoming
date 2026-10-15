// What connecting an assistant needs, shared by the connect sheet, Today's badge and
// Settings → Assistants: the MCP address, the one command for Claude Code, the plugin's
// install commands, and the trust levels (PLAN-one-tap-and-daily-loop, Phase 2).

export const mcpEndpoint = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/mcp`;

/** Adds Becoming to Claude Code for every project (user scope), not just the folder it's run in. */
export const connectCommand = (token: string) =>
  `claude mcp add --transport http --scope user becoming ${mcpEndpoint} --header "Authorization: Bearer ${token}"`;

/** The Claude Code plugin, from the app's public repo: /becoming:next, /becoming:done, /becoming:log and the session-start summary. */
export const pluginCommands = "claude plugin marketplace add VimalKManoj/becoming\nclaude plugin install becoming@becoming";

export type Trust = "ask" | "work" | "all";
export const trusts: { value: Trust; label: string; hint: string }[] = [
  { value: "ask", label: "Ask first", hint: "Everything it sends waits in your Inbox until you approve it." },
  { value: "work", label: "Record my work", hint: "Starting, finishing, blocking, notes and logged sessions go straight in. New phases, milestones, docs and plans wait in your Inbox." },
  { value: "all", label: "Everything", hint: "Every change goes straight in, plan changes too. You can still undo a task's move from its history." },
];

/** "today", "yesterday" or "3 days ago", for when an assistant was last heard from. */
export function lastHeard(at: number, now = Date.now()) {
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
