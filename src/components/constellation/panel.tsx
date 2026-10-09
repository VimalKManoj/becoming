"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bone } from "@/components/skeleton";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import {
  ago, brainstormEntries, capital, dayMonth, dayRange, dayTime, duration, groupLabel, hours, numberWord, plural, splitTitle,
  type CDoc, type Constellation, type GTask, type GenStep, type GenesisLayout, type Group, type TaskState,
} from "./model";
import type { Go, Level } from "./levels";

// The side panel describes whatever is selected (the design's `d`): the project, a phase,
// a task with its timeline, a doc or a genesis step. Everything in it is a saved record.

type Tone = "ember" | "lilac" | "mint";
export type FeedItem = { who: string; initial: string; ai: boolean; what: string; when: string };
export type PanelModel = {
  key: string; tone: Tone; eyebrow: string; a: string; em: string; status: string; scls: string; meta: string;
  primary?: { label: string; href?: string; onClick?: () => void; unblock?: Id<"tasks"> };
  stats?: { v: string | number; l: string }[];
  list?: { k: string; items: { k: string; v: string; pct?: number; href?: string }[] };
  chips?: { k: string; items: { t: string; tone: Tone; go: () => void }[] };
  next?: { k: string; v: string; doneK?: string; done?: string };
  feed?: { k: string; items: FeedItem[] };
  story?: { taskId: Id<"tasks">; initial: string };
};

const STATUS: Record<TaskState, [string, string]> = { done: ["Done", "s-done"], doing: ["In progress", "s-progress"], ready: ["Ready", "s-ready"], blocked: ["Blocked", "s-blocked"] };
const PHASE_STATUS = { done: ["Done", "s-done"], active: ["In progress", "s-progress"], ahead: ["Ahead", "s-ready"] } as const;
const PROJECT_STATUS: Record<string, string> = { Active: "s-progress", Done: "s-done", Archived: "s-ready" };
const EVENT_NOTE: Record<string, string> = {
  created: "Added to the plan", started: "Work began", ready: "Marked ready", blocked: "Marked blocked", unblocked: "Unblocked", done: "Marked done",
  reopened: "Reopened", archived: "Archived", restored: "Restored", focused: "A focus session", logged: "A session was logged",
};

const who = (source: string, initial: string) => source === "app"
  ? { who: "You", initial: initial || "Y", ai: false }
  : { who: source, initial: source.trim()[0]?.toUpperCase() ?? "A", ai: true };

function activityLine(kind: string, title: string | null, note: string | null) {
  const t = title ? `“${title}”` : "a task";
  switch (kind) {
    case "created": return `added ${t}`;
    case "started": return `started ${t}`;
    case "ready": return `marked ${t} ready`;
    case "blocked": return `blocked ${t}${note ? `: ${note}` : ""}`;
    case "unblocked": return `unblocked ${t}`;
    case "done": return `marked ${t} done`;
    case "reopened": return `reopened ${t}`;
    case "archived": return `archived ${t}`;
    case "restored": return `restored ${t}`;
    case "focused": return `focused on ${t}`;
    case "logged": return `logged a session on ${t}`;
    default: return `${kind} ${t}`;
  }
}

export type PanelContext = {
  data: Constellation; groups: Group[]; level: Level; ph: number; sel: string | null; go: Go;
  pct: number; phDone: number; initial: string; genesis: GenesisLayout | null; written: (d: CDoc) => boolean;
};

export function buildPanel(c: PanelContext): PanelModel {
  const { data, groups, level, sel, go, initial } = c;
  const now = data.timeline.now;
  const feedOf = (events: Constellation["activity"], n: number): FeedItem[] => events.slice(0, n).map(e => ({ ...who(e.source, initial), what: activityLine(e.kind, e.taskTitle, e.note), when: ago(e.at, now) }));
  const docsFeeding = (g: Group) => (g.phaseId ? data.docs.filter(d => d.phaseIds.includes(g.phaseId as string)) : []);
  const docChips = (g: Group) => {
    const docs = docsFeeding(g);
    return docs.length ? { k: "Built from", items: docs.map(d => ({ t: d.title, tone: "lilac" as const, go: () => go("overview", null, `d:${d.id}`) })) } : undefined;
  };

  const phasePanel = (g: Group, fromOverview: boolean): PanelModel => {
    const [status, scls] = PHASE_STATUS[g.state];
    const ids = new Set(g.all.map(t => String(t.id)));
    const feed = feedOf(data.activity.filter(e => ids.has(e.taskId)), 3);
    const t = splitTitle(g.name);
    const delivered = g.state === "done";
    const next = delivered ? g.goal || g.nextStep : g.nextStep || g.goal;
    const done = delivered ? (g.endedAt ? `Closed ${dayMonth(g.endedAt)}.` : g.doneWhen) : g.doneWhen;
    return {
      key: `${level}:${g.key}`, tone: "ember", eyebrow: g.num ? `Phase ${g.num} · ${plural(g.milestones.length, "milestone")}` : "Outside any phase", a: t.a, em: t.em, status, scls,
      meta: `${g.pd} of ${plural(g.n, "task")}`,
      primary: fromOverview ? { label: g.num ? `Open phase ${g.num} ›` : "Open it ›", onClick: () => go("phase", g.i, null) } : undefined,
      stats: [{ v: `${g.pct}%`, l: "Complete" }, { v: g.milestones.length, l: "Milestones" }, { v: g.sessions, l: "Sessions" }, { v: hours(g.focusedMinutes), l: "Focused" }],
      list: g.milestones.length ? { k: "Milestones", items: g.milestones.map(m => ({ k: `${m.code} · ${m.title}`, v: m.tasks.length ? `${m.done} of ${m.tasks.length} done` : "No tasks yet", pct: m.tasks.length ? Math.round((m.done / m.tasks.length) * 100) : 0 })) } : undefined,
      chips: docChips(g),
      next: next || done ? { k: delivered ? "What it delivered" : "Next step", v: next || "No next step written yet.", doneK: delivered ? "Closed" : "Done when", done } : undefined,
      feed: feed.length ? { k: "Activity", items: feed } : undefined,
    };
  };

  // ---- task (phase level) ----
  const group = groups[c.ph];
  if (level === "phase" && group) {
    let task: GTask | null = null, milestone: Group["milestones"][number] | null = null;
    if (sel?.startsWith("t:")) for (const m of group.milestones) for (const t of m.tasks) if (`t:${t.id}` === sel) { task = t; milestone = m; }
    if (task && milestone) {
      const [status, scls] = STATUS[task.cur];
      const items: { k: string; v: string; pct?: number }[] = [{ k: "Milestone", v: `${milestone.code} · ${milestone.title}` }, { k: "Planned", v: plural(task.minutes, "minute") }];
      if (task.plannedSessions) items.push({ k: "Sessions", v: `${task.sessions} of ${task.plannedSessions}`, pct: Math.min(100, Math.round((task.sessions / task.plannedSessions) * 100)) });
      else if (task.sessions) items.push({ k: "Sessions", v: `${plural(task.sessions, "session")} · ${hours(task.focusedMinutes)} focused` });
      if (task.skills.length) items.push({ k: "Skills", v: task.skills.join(", ") });
      // Actions follow the task as it is now, whatever day the replay shows.
      const real = task.state;
      return {
        key: `t:${task.id}`, tone: "ember", eyebrow: `Task ${task.code}${group.num ? ` · Phase ${group.num}` : ""}`, a: task.title, em: "", status, scls,
        meta: task.cur === "done" && task.completedAt ? `Done ${dayMonth(task.completedAt)}` : `${task.minutes} min`,
        primary: real === "done" ? undefined : real === "blocked" ? { label: "Unblock", unblock: task.id } : { label: "Start focus", href: `/today?task=${task.id}` },
        list: { k: "Details", items },
        chips: docChips(group),
        next: { k: task.cur === "blocked" ? "What's blocking it" : "Next step", v: task.cur === "done" ? "Done." : task.nextStep || "No next step written yet.", doneK: "Done when", done: task.doneWhen },
        story: { taskId: task.id, initial },
      };
    }
    return phasePanel(group, false);
  }

  // ---- genesis steps ----
  const g = data.genesis, gl = c.genesis;
  const genPanel = (step: GenStep): PanelModel | null => {
    const base = { primary: undefined as PanelModel["primary"] };
    if (step === "idea" && g.idea) {
      const t = splitTitle(g.idea.title);
      const items = [{ k: "Captured", v: dayTime(g.idea.createdAt) }, { k: "Lane", v: g.idea.lane }, { k: "Became", v: `${data.project.title}, ${duration(g.idea.createdAt, data.project.createdAt)} later` }];
      return { ...base, key: "g:idea", tone: "lilac", eyebrow: `Idea · ${dayTime(g.idea.createdAt)}`, a: t.a, em: t.em, status: "Activated", scls: "s-done", meta: `${g.idea.lane} lane`,
        next: { k: "What happened", v: g.idea.notes.trim() || "It was captured without notes." }, list: { k: "Idea", items } };
    }
    if (step === "brain" && g.idea) {
      const entries = brainstormEntries(g.idea.brainstorm);
      return { ...base, key: "g:brain", tone: "lilac", eyebrow: "Brainstorm", a: `${capital(numberWord(entries.length))} ${entries.length === 1 ? "question" : "questions"},`, em: "answered", status: "Answered", scls: "s-done",
        meta: "Before any research", next: { k: "What happened", v: "The idea’s structured thinking, before any research." }, list: { k: "Brainstorm", items: entries } };
    }
    if (step === "research" && g.research.length) {
      const sources = g.research.reduce((n, r) => n + r.sources.length, 0);
      const names = gl?.briefNames ?? [];
      const briefs = gl?.briefs ?? 0;
      const range = gl?.researchFrom != null && gl.researchTo != null ? ` · ${dayRange(gl.researchFrom, gl.researchTo)}` : "";
      return { ...base, key: "g:research", tone: "lilac", eyebrow: `Research${range}`,
        a: `${capital(numberWord(g.research.length))} ${g.research.length === 1 ? "thread" : "threads"},`, em: `${numberWord(sources)} ${sources === 1 ? "source" : "sources"}`,
        status: g.report ? "Synthesised" : "Gathering", scls: g.report ? "s-done" : "s-lilac", meta: briefs ? `${plural(briefs, "brief")} by ${names.join(", ")}` : plural(sources, "source"),
        next: { k: "What happened", v: `Each dot is a source you read, tried or talked to.${briefs ? ` The bright ones are briefs ${names.join(" and ")} wrote through MCP.` : ""}` },
        list: { k: "Research", items: g.research.map(r => ({ k: `${r.title}${r.sources.some(s => s.by !== "app") ? " · MCP" : ""}`, v: r.summary || plural(r.sources.length, "source") })) } };
    }
    if (step === "report" && g.report) {
      const t = splitTitle(g.report.title);
      const n = g.report.findings.length, traced = n > 0 && g.report.findings.every(f => f.basis);
      return { ...base, key: "g:report", tone: "lilac", eyebrow: `Report · ${dayTime(g.report.writtenAt)}`, a: t.a, em: t.em, status: "Final", scls: "s-done", meta: plural(n, "finding"),
        next: { k: "What happened", v: g.report.summary || `${capital(numberWord(n))} ${n === 1 ? "finding" : "findings"}${traced ? ", each traced back to a source" : ""}.` },
        list: n ? { k: "Report", items: g.report.findings.map((f, i) => ({ k: `Finding ${i + 1}${f.basis ? ` · ${f.basis}` : ""}`, v: f.text })) } : undefined };
    }
    if (step === "decision" && g.decision) {
      const t = splitTitle(g.decision.verdict);
      const items = [...(g.decision.dropped.length ? [{ k: "Dropped", v: g.decision.dropped.join(", ") }] : []), ...(g.decision.kept.length ? [{ k: "Kept", v: g.decision.kept.join(", ") }] : [])];
      return { ...base, key: "g:decision", tone: "mint", eyebrow: `Decision · ${dayTime(g.decision.at)}`, a: t.a, em: t.em, status: "Decided", scls: "s-done", meta: g.report ? "Decided by the report" : "Decided",
        next: { k: "What happened", v: g.decision.rule || g.decision.verdict }, list: items.length ? { k: "Decision", items } : undefined };
    }
    if (step === "project") {
      const items = [{ k: "Purpose", v: data.project.purpose }, ...(data.project.outcome ? [{ k: "Outcome", v: data.project.outcome }] : [])];
      return { ...base, key: "g:project", tone: "ember", eyebrow: `Project · ${dayTime(data.project.createdAt)}`, a: data.project.title, em: "is born", status: data.project.status, scls: PROJECT_STATUS[data.project.status] ?? "s-ready",
        meta: g.idea ? "Grew from an idea" : "Started as a project", next: { k: "What happened", v: "The idea became a project with a purpose and an outcome. Its lineage stays one click away." },
        list: { k: "Project", items } };
    }
    return null;
  };

  if (level === "genesis") {
    const step = (sel ?? "idea") as GenStep;
    const p = genPanel(step) ?? genPanel("idea");
    if (p) return step === "project" ? { ...p, primary: { label: "See the whole constellation ›", onClick: () => go("overview", null, "core") } } : p;
  }

  // ---- overview ----
  if (sel?.startsWith("p:") && groups[Number(sel.slice(2))]) return phasePanel(groups[Number(sel.slice(2))], true);
  const doc = sel?.startsWith("d:") ? data.docs.find(d => `d:${d.id}` === sel) : undefined;
  if (doc) {
    const t = splitTitle(doc.title), written = c.written(doc);
    const feeds = groups.filter(x => x.phaseId && doc.phaseIds.includes(x.phaseId));
    const about = [...(doc.summary ? [{ k: "Summary", v: doc.summary }] : []), ...(doc.link ? [{ k: "Where it lives", v: doc.link, href: /^https?:\/\//i.test(doc.link) ? doc.link : undefined }] : [])];
    return {
      key: `d:${doc.id}`, tone: "lilac", eyebrow: `Document · ${doc.code}${doc.source !== "app" ? ` · synced by ${doc.source}` : ""}`, a: t.a, em: t.em,
      status: written ? "Written" : "Planned", scls: written ? "s-lilac" : "s-ready", meta: doc.writtenAt ? `Written ${dayMonth(doc.writtenAt)}` : "Not written yet",
      stats: [{ v: feeds.reduce((n, x) => n + x.n, 0), l: "Tasks it informs" }, { v: feeds.length, l: "Phases fed" }, { v: doc.sections ?? "—", l: "Sections" }, { v: dayMonth(doc.updatedAt), l: "Last edit" }],
      list: about.length ? { k: "About", items: about } : undefined,
      chips: feeds.length ? { k: "Feeds · open a phase", items: feeds.map(x => ({ t: x.num ? `${x.num} ${x.name}` : x.name, tone: "ember" as const, go: () => go("phase", x.i, null) })) } : undefined,
      next: doc.nextEdit || doc.doneWhen ? { k: "Next edit", v: doc.nextEdit || "No next edit written yet.", doneK: "Done when", done: doc.doneWhen } : undefined,
    };
  }
  if (sel === "idea" || sel === "research" || sel === "report") {
    const p = genPanel(sel);
    if (p) return { ...p, key: `o:${sel}`, primary: { label: "Open genesis ›", onClick: () => go("genesis", null, sel) } };
  }
  if (sel === "start") {
    return {
      key: "o:start", tone: "lilac", eyebrow: `Project · ${dayTime(data.project.createdAt)}`, a: "Started as", em: "a project", status: "No genesis", scls: "s-lilac", meta: "Not grown from an idea",
      next: { k: "What happened", v: "This project was created directly, so there is no idea, research or report behind it." },
      list: { k: "Project", items: [{ k: "Created", v: dayTime(data.project.createdAt) }, { k: "Purpose", v: data.project.purpose }] },
    };
  }

  // ---- project (core) ----
  const phased = groups.filter(x => x.phaseId);
  const current = groups.find(x => x.state === "active") ?? groups.find(x => x.state === "ahead");
  const nextStep = current?.nextStep || current?.all.find(t => t.cur === "doing")?.nextStep || "";
  const origin = g.idea ? [
    { k: "Idea", v: g.idea.title },
    ...(g.research.length ? [{ k: "Research", v: `${plural(g.research.length, "thread")}, ${plural(g.research.reduce((n, r) => n + r.sources.length, 0), "source")}` }] : []),
    ...(g.report ? [{ k: "Report", v: g.report.title }] : []),
  ] : [{ k: "Started", v: `As a project, on ${dayMonth(data.project.createdAt)}` }];
  const feed = feedOf(data.activity, 3);
  return {
    key: "o:core", tone: "ember", eyebrow: `Project · since ${dayMonth(data.project.createdAt)}`, a: `${data.project.title},`, em: "taking form",
    status: data.project.status, scls: PROJECT_STATUS[data.project.status] ?? "s-ready",
    meta: g.idea ? `Grew from an idea on ${dayMonth(g.idea.createdAt)}` : `Started on ${dayMonth(data.project.createdAt)}`,
    primary: g.idea ? { label: "Open genesis ›", onClick: () => go("genesis", null, "idea") } : undefined,
    stats: [{ v: `${c.pct}%`, l: "Formed" }, { v: `${c.phDone}/${phased.length}`, l: "Phases done" }, { v: data.stats.sessions, l: "Sessions" }, { v: hours(data.stats.focusedMinutes), l: "Focused" }],
    list: { k: "Where it came from", items: origin },
    next: nextStep || current?.doneWhen ? { k: current ? `Next step · ${groupLabel(current)}` : "Next step", v: nextStep || "No next step written yet.", doneK: "Done when", done: current?.doneWhen } : undefined,
    feed: feed.length ? { k: "Activity", items: feed } : undefined,
  };
}

// ---------- rendering ----------

export function Panel({ model }: { model: PanelModel }) {
  const story = useQuery(api.constellation.taskStory, model.story ? { taskId: model.story.taskId } : "skip");
  const setStatus = useMutation(api.tasks.setStatus);
  const { showToast } = useRitual();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = model;

  const unblock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const taskId = d.primary?.unblock;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (!taskId || !note) return;
    setBusy(true);
    try {
      await setStatus({ taskId, status: "Ready", note });
      showToast("Unblocked. It’s ready again.");
      setAsking(false);
    } catch (error) {
      showToast(readableError(error), "alert");
    } finally {
      setBusy(false);
    }
  };

  const timeline: FeedItem[] | null = d.story ? (story ?? []).slice(-8).map(e => {
    const w = who(e.source, d.story?.initial ?? "");
    return { who: e.kind.toUpperCase(), initial: w.initial, ai: w.ai, what: e.note || EVENT_NOTE[e.kind] || "", when: `${dayMonth(e.at)}${w.ai ? ` · ${e.source}` : ""}` };
  }) : null;
  const feed = d.story ? { k: "Timeline", items: timeline ?? [] } : d.feed;

  return <aside className="panel" aria-label="Selected part" aria-live="polite">
    <div className="pin">
      <div className={`pc head ${d.tone}`}>
        <div className={`eyebrow ${d.tone}`}><span className={`dot ${d.tone}`} />{d.eyebrow}</div>
        <h2 className="ptitle">{d.a}{d.em && <> <em className={d.tone}>{d.em}</em></>}</h2>
        <div className="prow"><span className={`status ${d.scls}`}>{d.status}</span><span className="small">{d.meta}</span></div>
      </div>

      {d.primary && !asking && <div className="prim">
        {d.primary.href ? <Link className="btn" href={d.primary.href}>{d.primary.label}</Link>
          : d.primary.unblock ? <button type="button" className="btn" onClick={() => setAsking(true)}>{d.primary.label}</button>
            : <button type="button" className="btn" onClick={d.primary.onClick}>{d.primary.label}</button>}
      </div>}
      {asking && <form className="dashed ubform" onSubmit={unblock}>
        <label className="eyebrow ember" htmlFor="cx-unblock-note">What&apos;s the next step?</label>
        <textarea id="cx-unblock-note" className="ubin" name="note" rows={2} required maxLength={2000} ref={el => el?.focus()} placeholder="So you know where to pick up." />
        <div className="ubrow">
          <button type="submit" className="btn" disabled={busy}>{busy ? "Unblocking…" : "Unblock"}</button>
          <button type="button" className="ghost" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
        </div>
      </form>}

      {d.stats && <div className="stats">
        {d.stats.map(s => <div key={s.l} className="stc"><div className="stv">{s.v}</div><div className="stl">{s.l}</div></div>)}
      </div>}

      {d.list && <div className="pc">
        <div className="eyebrow">{d.list.k}</div>
        <div className="list">
          {d.list.items.map((i, n) => <div key={n} className="li">
            <span className="lk">{i.k}</span>
            <span className="lv">{i.href ? <a href={i.href} target="_blank" rel="noreferrer">{i.v}</a> : i.v}</span>
            {i.pct !== undefined && <span className="lbar"><span style={{ width: `${i.pct}%` }} /></span>}
          </div>)}
        </div>
      </div>}

      {d.chips && <div className="pc">
        <div className="eyebrow">{d.chips.k}</div>
        <div className="chips">
          {d.chips.items.map((c, n) => <button key={n} type="button" className="chip" onClick={c.go}><span className={`dot ${c.tone}`} />{c.t}<span className="go" aria-hidden="true">›</span></button>)}
        </div>
      </div>}

      {d.next && <div className="dashed">
        <div><div className="eyebrow ember">{d.next.k}</div><div className="body14">{d.next.v}</div></div>
        {d.next.done && <div><div className="eyebrow">{d.next.doneK}</div><div className="body14">{d.next.done}</div></div>}
      </div>}

      {feed && <div className="pc">
        <div className="eyebrow">{feed.k}</div>
        <div className="feed">
          {d.story && story === undefined && <><Bone h={12} /><Bone w="70%" h={12} i={1} /></>}
          {d.story && story !== undefined && !feed.items.length && <div className="small">No recorded moves yet.</div>}
          {feed.items.map((f, n) => <div key={n} className="fi">
            <span className={`fav${f.ai ? " ai" : ""}`} aria-hidden="true">{f.initial}</span>
            <div className="ftxt"><span className="fwho">{f.who}</span>{f.ai && <span className="mcp">MCP</span>} {f.what}<span className="fwhen">{f.when}</span></div>
          </div>)}
        </div>
      </div>}
    </div>
  </aside>;
}
