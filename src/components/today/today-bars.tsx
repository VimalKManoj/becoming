"use client";

import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { StatusControl } from "@/components/tasks/status-control";

// Today's two slim bars, just above the week (PLAN-one-tap-and-daily-loop, Phase 3, as the
// owner placed them on 15 October): "On it now", the tasks In progress, each with its status
// circle, opening its sheet, and ▶ Focus; and "Last time", what moved on your last active
// day (or today so far), by you and by assistants, with where you left off. Data: today.home.

type Home = FunctionReturnType<typeof api.today.home>;
type LastTime = NonNullable<Home["lastTime"]>;
type Group = LastTime["groups"][number];

const short = (title: string, max = 38) => `“${title.length > max ? `${title.slice(0, max - 1)}…` : title}”`;

export function OnItNow({ home, onOpenTask }: { home: Home; onOpenTask: (id: Id<"tasks">) => void }) {
  if (!home.onItNow.length) return null;
  return <section className="t-bar t-onit" aria-labelledby="onit-title">
    <h2 id="onit-title" className="t-bar-k">On it now</h2>
    <ul className="t-onit-list">
      {home.onItNow.map(task => <li key={task.taskId} className="t-onit-row">
        <StatusControl task={{ _id: task.taskId, title: task.title, status: task.status }} />
        <button type="button" className="t-onit-title" onClick={() => onOpenTask(task.taskId)}>{task.title}</button>
        {(task.project || task.code) && <span className="t-onit-meta">{[task.project?.title, task.code].filter(Boolean).join(" · ")}</span>}
        <Link className="t-onit-focus" href={`/today?task=${task.taskId}`} aria-label={`Focus on ${task.title}`}>▶ Focus</Link>
      </li>)}
    </ul>
    {home.moreInProgress > 0 && <Link className="t-bar-more" href="/work">+ {home.moreInProgress} more in Work →</Link>}
  </section>;
}

/** "Today so far", "Yesterday", a weekday within the week, else "12 Oct". */
export function dayLabel(day: string, today: string) {
  const ms = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  const days = Math.round((ms(today) - ms(day)) / 86_400_000);
  if (days <= 0) return "Today so far";
  if (days === 1) return "Yesterday";
  const date = new Date(ms(day));
  if (days < 7) return date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} · ${days} days ago`;
}

/** One person's moves as a phrase: "You finished “R1” and started “R2”", "Claude Code finished 3". */
export function groupLine(group: Group) {
  const who = group.by === "you" ? "You" : group.by;
  const verbs: [string, { title: string }[]][] = [["finished", group.finished], ["started", group.started], ["blocked", group.blocked], ["worked on", group.logged]];
  const parts = verbs.filter(([, items]) => items.length).map(([verb, items]) =>
    items.length <= 2 ? `${verb} ${items.map(item => short(item.title)).join(" and ")}` : `${verb} ${short(items[0].title)} and ${items.length - 1} more`);
  if (!parts.length) return "";
  return `${who} ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`;
}

export function LastTimeBar({ lastTime, today, onOpenTask }: { lastTime: LastTime; today: string; onOpenTask: (id: Id<"tasks">) => void }) {
  const lines = lastTime.groups.map(groupLine).filter(Boolean);
  if (!lines.length && !lastTime.pickUp) return null;
  return <section className="t-bar t-last" aria-labelledby="last-title">
    <div className="t-last-row">
      <h2 id="last-title" className="t-bar-k">Last time · {dayLabel(lastTime.day, today)}</h2>
      <p className="t-last-text">{lines.join(" ")}</p>
    </div>
    {lastTime.pickUp && <div className="t-last-row t-last-pick">
      <span className="t-last-left">You left off: <em>{lastTime.pickUp.nextStep}</em></span>
      <button type="button" className="t-bar-more" onClick={() => onOpenTask(lastTime.pickUp!.taskId)} aria-label={`Pick up ${lastTime.pickUp.title}`}>Pick up →</button>
    </div>}
  </section>;
}
