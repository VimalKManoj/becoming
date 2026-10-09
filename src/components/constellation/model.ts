import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

// The project constellation's data model and geometry, as pure functions of the
// `constellation.get` result (convex/constellation.ts) and a replay moment. The numbers
// and shapes are the owner's design (documents/design/project-constellation.dc.html),
// generalised from its example counts (3 genesis threads, 6 docs, 8 phases) to real ones.

export type Constellation = NonNullable<FunctionReturnType<typeof api.constellation.get>>;
type RawPhase = Constellation["phases"][number];
export type CMilestone = RawPhase["milestones"][number];
export type CTask = CMilestone["tasks"][number];
export type CDoc = Constellation["docs"][number];
export type TaskState = CTask["state"];
export type PhaseState = "done" | "active" | "ahead";

export const DAY = 86_400_000;
/** The scrubber moves in tenths of a day, as in the design (240 steps for 24 days). */
export const STEPS_PER_DAY = 10;
export const INNER_W = 940;
const BASE_H = 544;

// ---------- formatting (saved timestamps only; never the clock) ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "15 Sep". */
export const dayMonth = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
/** "21:40". */
export const hhmm = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** "15 Sep, 21:40". */
export const dayTime = (t: number) => `${dayMonth(t)}, ${hhmm(t)}`;
export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
/** Whole calendar days from a to b. */
export function calendarDays(a: number, b: number) {
  const x = new Date(a), y = new Date(b);
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / DAY);
}
/** "17–19 Sep", "28 Sep – 2 Oct" or "17 Sep". */
export function dayRange(a: number, b: number) {
  if (sameDay(a, b)) return dayMonth(a);
  const x = new Date(a), y = new Date(b);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${x.getDate()}–${y.getDate()} ${MONTHS[x.getMonth()]}`;
  return `${dayMonth(a)} – ${dayMonth(b)}`;
}
/** "3h ago", "yesterday", "16 Sep", relative to the query's own `now`. */
export function ago(t: number, now: number) {
  const minutes = Math.max(0, Math.round((now - t) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60 && sameDay(t, now)) return `${Math.round(minutes / 60)}h ago`;
  if (calendarDays(t, now) === 1) return "yesterday";
  return dayMonth(t);
}
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const numberWord = (n: number) => WORDS[n] ?? String(n);
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Focused time: "45m", "12h". */
export const hours = (minutes: number) => minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
/** The design's title split: the last word carries the emphasis. */
export function splitTitle(text: string) {
  const t = text.trim(), at = t.lastIndexOf(" ");
  return at < 0 ? { a: t, em: "" } : { a: t.slice(0, at), em: t.slice(at + 1) };
}
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const partOfDay = (t: number) => { const h = new Date(t).getHours(); return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night"; };

// ---------- state at a replay moment ----------

export type GTask = CTask & { cur: TaskState };
export type GMilestone = { key: string; code: string; title: string; doneWhen: string; tasks: GTask[]; done: number; doing: number; state: PhaseState };
export type Group = {
  key: string; i: number; phaseId: string | null; num: string; name: string; goal: string; nextStep: string; doneWhen: string;
  startedAt: number | null; endedAt: number | null; sessions: number; focusedMinutes: number;
  milestones: GMilestone[]; all: GTask[]; n: number; pd: number; pp: number; state: PhaseState; pct: number;
};

/** A task's state at `at` (null = now), from its own dates: done once completed, blocked once blocked, doing once started. */
export function stateAt(t: CTask, at: number | null): TaskState {
  if (at === null) return t.state;
  if (t.completedAt !== null && t.completedAt <= at) return "done";
  if (t.state === "blocked" && t.blockedAt !== null && t.blockedAt <= at) return "blocked";
  if (t.state !== "ready" && t.startedAt !== null && t.startedAt <= at) return "doing";
  return "ready";
}

const summarise = (tasks: GTask[]) => {
  const n = tasks.length, pd = tasks.filter(t => t.cur === "done").length, pp = tasks.filter(t => t.cur === "doing").length, pb = tasks.filter(t => t.cur === "blocked").length;
  const state: PhaseState = n && pd === n ? "done" : pd + pp + pb > 0 ? "active" : "ahead";
  return { n, pd, pp, state, pct: n ? Math.round((pd / n) * 100) : 0 };
};

function milestoneAt(key: string, code: string, title: string, doneWhen: string, tasks: CTask[], at: number | null): GMilestone {
  const own = tasks.map(t => ({ ...t, cur: stateAt(t, at) }));
  const s = summarise(own);
  return { key, code, title, doneWhen, tasks: own, done: s.pd, doing: s.pp, state: s.state };
}

/** Phases (and, as one more group, whatever sits outside any phase) at a replay moment. */
export function groupsAt(data: Constellation, at: number | null): Group[] {
  const groups: Group[] = data.phases.map((p, i) => {
    const milestones = p.milestones.map(m => milestoneAt(String(m.id), m.code, m.title, m.doneWhen, m.tasks, at));
    const all = milestones.flatMap(m => m.tasks);
    return {
      key: `p:${i}`, i, phaseId: String(p.id), num: p.num, name: p.name, goal: p.goal, nextStep: p.nextStep, doneWhen: p.doneWhen,
      startedAt: p.startedAt, endedAt: p.endedAt, sessions: p.sessions, focusedMinutes: p.focusedMinutes, milestones, all, ...summarise(all),
    };
  });
  const { milestones: looseMs, tasks: looseTasks } = data.loose;
  if (looseMs.length || looseTasks.length) {
    const milestones = looseMs.map(m => milestoneAt(String(m.id), m.code, m.title, m.doneWhen, m.tasks, at));
    if (looseTasks.length) milestones.push(milestoneAt("none", "·", "No milestone", "", looseTasks, at));
    const all = milestones.flatMap(m => m.tasks);
    const dates = all.flatMap(t => [t.startedAt, t.completedAt]).filter((x): x is number => x !== null);
    const i = groups.length;
    groups.push({
      key: `p:${i}`, i, phaseId: null, num: "", name: "Not in a phase", goal: "", nextStep: "", doneWhen: "",
      startedAt: dates.length ? Math.min(...dates) : null, endedAt: null,
      sessions: all.reduce((n, t) => n + t.sessions, 0), focusedMinutes: all.reduce((n, t) => n + t.focusedMinutes, 0),
      milestones, all, ...summarise(all),
    });
  }
  return groups;
}

export const groupLabel = (g: Pick<Group, "num" | "name">) => (g.num ? `Phase ${g.num} · ${g.name}` : g.name);
export const groupShort = (g: Pick<Group, "num">) => g.num || "—";

// ---------- overview geometry ----------

const CELLS_PER_LINE = 21;

export type OverviewRow = { top: number; height: number; cells: { x: number; y: number }[] };
export type OverviewLayout = { H: number; CY: number; docY: (j: number) => number; rows: OverviewRow[] };

/**
 * The design's overview, 940×544 for 6 docs and 8 phases: docs 66px apart around the core's
 * line (CY 292), phase rows 60px apart from the top. More docs or phases grow the canvas
 * (it scrolls); fewer centre on the core's line. A phase with more than 21 tasks wraps its
 * cells into a honeycomb of further lines, and its row grows to hold them.
 */
export function overviewLayout(groups: Group[], docCount: number): OverviewLayout {
  const lines = groups.map(g => Math.max(1, Math.ceil(g.n / CELLS_PER_LINE)));
  const heights = lines.map(l => 52 + (l - 1) * 9);
  const span = heights.reduce((a, h) => a + h, 0) + Math.max(0, groups.length - 1) * 8;
  const halfDocs = docCount ? ((docCount - 1) / 2) * 66 + 27 : 0;
  const H = Math.ceil(Math.max(BASE_H, 56 + span + 16, 2 * (halfDocs + 80)));
  const CY = Math.round(H / 2 + 20);
  let y = Math.max(56, Math.round(CY - span / 2));
  const rows = groups.map((g, i) => {
    const row = {
      top: y, height: heights[i],
      cells: g.all.map((_, j) => { const line = Math.floor(j / CELLS_PER_LINE); return { x: (j % CELLS_PER_LINE) * 11 + (line % 2 ? 5.5 : 0), y: line * 9 }; }),
    };
    y += heights[i] + 8;
    return row;
  });
  return { H, CY, docY: (j: number) => CY + (j - (docCount - 1) / 2) * 66, rows };
}

/** Source dots inside the overview's research glyph (100×112): one line per thread. */
export function researchDots(threads: { sources: { by: string }[] }[]) {
  const shown = threads.slice(0, 8);
  const n = shown.length;
  const gap = n > 1 ? Math.min(40, 80 / (n - 1)) : 0;
  return shown.flatMap((thread, r) => {
    const y = Math.round(56 + (r - (n - 1) / 2) * gap);
    const sources = thread.sources.slice(0, 10);
    const k = sources.length, step = k > 1 ? Math.min(36, 70 / (k - 1)) : 0;
    return sources.map((s, i) => ({ x: Math.round(52 - (step * (k - 1)) / 2 + i * step), y, ai: s.by !== "app" }));
  });
}
/** The thread lines' y offsets around the core line (−40, 0, +40 for three threads). */
export function threadOffsets(count: number) {
  const n = Math.min(count, 8);
  const gap = n > 1 ? Math.min(40, 80 / (n - 1)) : 0;
  return Array.from({ length: n }, (_, r) => Math.round((r - (n - 1) / 2) * gap));
}

// ---------- phase level geometry ----------

export type Cluster = { m: GMilestone; x: number; y: number; tasks: { t: GTask; x: number; y: number; k: number }[] };
export type PhaseLayout = { H: number; hexCY: number; hx: number; clusters: Cluster[]; edges: { d: string; lit: boolean }[] };

/** The design's phase level: the big hexagon left, milestone clusters (≤3 per band) right, two honeycomb columns per cluster. */
export function phaseLayout(g: Group): PhaseLayout {
  const MS = g.milestones;
  const per = MS.length <= 3 ? Math.max(1, MS.length) : MS.length <= 6 ? Math.ceil(MS.length / 2) : 3;
  const bands: GMilestone[][] = [];
  for (let i = 0; i < MS.length; i += per) bands.push(MS.slice(i, i + per));
  const clusterH = (m: GMilestone) => 26 + (Math.max(1, Math.ceil(m.tasks.length / 2)) - 1) * 80 + 101;
  const bandH = bands.map(b => Math.max(...b.map(clusterH)));
  let H: number, tops: number[];
  if (bands.length <= 1) {
    const h = bandH[0] ?? 207;
    H = Math.max(BASE_H, h + 24 + 53);
    tops = [Math.max(24, Math.floor(H / 2 - h / 2))];
  } else {
    tops = [];
    let y = 24;
    for (const h of bandH) { tops.push(y); y += h + 53; }
    H = Math.max(BASE_H, y);
  }
  const hexCY = Math.round(H / 2);
  const rowW = (c: number) => c * 230 + (c - 1) * 10;
  const maxW = bands.length ? Math.max(...bands.map(b => rowW(b.length))) : 0;
  const hx = Math.round((INNER_W - (150 + 56 + maxW)) / 2), area = hx + 206;
  const clusters: Cluster[] = [], edges: { d: string; lit: boolean }[] = [];
  bands.forEach((band, r) => {
    const x0 = area + (maxW - rowW(band.length)) / 2, top = tops[r];
    band.forEach((m, idx) => {
      const cx = Math.round(x0 + idx * 240);
      edges.push({ d: `M${hx + 150},${hexCY} C${hx + 184},${hexCY} ${cx - 44},${top + 8} ${cx - 6},${top + 8} `, lit: m.state !== "ahead" });
      clusters.push({
        m, x: cx, y: top,
        tasks: m.tasks.map((t, k) => { const xr = Math.floor(k / 2); return { t, k: k + idx, x: cx + (k % 2) * 92 + (xr % 2 ? 46 : 0), y: top + 26 + xr * 80 }; }),
      });
    });
  });
  return { H, hexCY, hx, clusters, edges };
}

// ---------- genesis ----------

export type Genesis = Constellation["genesis"];
export type BrainstormEntry = { k: string; v: string };

export function brainstormEntries(b: NonNullable<Genesis["idea"]>["brainstorm"]): BrainstormEntry[] {
  if (!b) return [];
  const rows: [string, string | undefined][] = [
    ["Problem", b.problem], ["For", b.audience], ["The hook", b.hook], ["Smallest build", b.smallestBuild],
    ["Skills", b.skills?.join(", ")], ["References", b.references?.join(", ")], ["Open questions", b.openQuestions], ["Decisions", b.decisions],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]?.trim()).map(([k, v]) => ({ k, v }));
}

export type GenStep = "idea" | "brain" | "research" | "report" | "decision" | "project";
export type GenesisLayout = {
  steps: GenStep[];
  rows: { y: number; title: string; count: number; mcp: boolean; dots: { x: number; ai: boolean; delay: number }[] }[];
  gen: string; mint: string; times: { x: number; label: string }[];
  researchFrom: number | null; researchTo: number | null; sources: number; briefs: number; briefNames: string[];
};

const X: Record<Exclude<GenStep, "research">, number> = { idea: 60, brain: 180, report: 580, decision: 690, project: 810 };
const GY = 262;

/** The genesis timeline: Idea 60 → Brainstorm 180 → research threads 260–500 → Report 580 → Decision 690 → Project 810; absent steps are skipped. */
export function genesisLayout(data: Constellation): GenesisLayout | null {
  const g = data.genesis;
  if (!g.idea) return null;
  const threads = g.research.slice(0, 8);
  const n = threads.length, gap = n > 1 ? Math.min(90, 230 / (n - 1)) : 0;
  const rows = threads.map((r, k) => {
    const y = Math.round(GY + (k - (n - 1) / 2) * gap);
    const sources = r.sources.slice(0, 16), c = sources.length, step = c > 1 ? Math.min(100, 180 / (c - 1)) : 0;
    return {
      y, title: r.title, count: r.sources.length, mcp: r.sources.some(s => s.by !== "app"),
      dots: sources.map((s, i) => ({ x: Math.round(380 - (step * (c - 1)) / 2 + i * step), ai: s.by !== "app", delay: +(((i * 0.5) + k * 0.3) % 6).toFixed(1) })),
    };
  });
  const steps: GenStep[] = ["idea"];
  if (brainstormEntries(g.idea.brainstorm).length) steps.push("brain");
  if (rows.length) steps.push("research");
  if (g.report) steps.push("report");
  if (g.decision) steps.push("decision");
  steps.push("project");

  let gen = "", mint = "";
  for (let s = 1; s < steps.length; s++) {
    const from = steps[s - 1], to = steps[s];
    if (to === "research") {
      const xa = X[from as Exclude<GenStep, "research">];
      for (const r of rows) gen += r.y === GY ? `M${xa},${GY} L260,${GY} ` : `M${xa},${GY} C${xa + 40},${GY} 230,${r.y} 260,${r.y} `;
      for (const r of rows) gen += `M260,${r.y} L500,${r.y} `;
    } else if (from === "research") {
      const xb = X[to];
      for (const r of rows) gen += r.y === GY ? `M500,${GY} L${xb},${GY} ` : `M500,${r.y} C545,${r.y} 540,${GY} ${xb},${GY} `;
    } else {
      const seg = `M${X[from]},${GY} L${X[to]},${GY} `;
      if (from === "decision" && to === "project") mint += seg; else gen += seg;
    }
  }

  const all = g.research.flatMap(r => r.sources);
  const at = all.map(s => s.at);
  const researchFrom = at.length ? Math.min(...at) : g.research.length ? Math.min(...g.research.map(r => r.createdAt)) : null;
  const researchTo = at.length ? Math.max(...at) : g.research.length ? Math.max(...g.research.map(r => r.createdAt)) : null;

  // Times above each step: the day when it changes, then only the hour.
  const times: { x: number; label: string }[] = [];
  let prev: number | null = null;
  const stamp = (x: number, t: number) => { times.push({ x, label: (prev !== null && sameDay(prev, t) ? hhmm(t) : `${dayMonth(t)} · ${hhmm(t)}`).toUpperCase() }); prev = t; };
  stamp(X.idea, g.idea.createdAt);
  if (researchFrom !== null && researchTo !== null && steps.includes("research")) {
    const label = sameDay(researchFrom, researchTo) ? dayMonth(researchFrom)
      : new Date(researchFrom).getMonth() === new Date(researchTo).getMonth() ? `${new Date(researchFrom).getDate()} → ${dayMonth(researchTo)}` : `${dayMonth(researchFrom)} → ${dayMonth(researchTo)}`;
    times.push({ x: 380, label: label.toUpperCase() });
    // A range names no single day, so the next step restates its own.
    prev = null;
  }
  if (g.report) stamp(X.report, g.report.writtenAt);
  if (g.decision) stamp(X.decision, g.decision.at);
  stamp(X.project, data.project.createdAt);

  const briefNames = [...new Set(all.filter(s => s.by !== "app").map(s => s.by))];
  return { steps, rows, gen: gen || "M0,0", mint: mint || "M0,0", times, researchFrom, researchTo, sources: all.length, briefs: all.filter(s => s.by !== "app").length, briefNames };
}
export const genX = X;
export const GENESIS_Y = GY;

/** The genesis note: "26 HOURS" and "From a thought typed at 21:40 to a project with a purpose, the next night." */
export function genesisNote(ideaAt: number, projectAt: number) {
  const ms = Math.max(0, projectAt - ideaAt);
  const minutes = Math.round(ms / 60_000), hrs = Math.round(ms / 3_600_000), days = calendarDays(ideaAt, projectAt);
  const span = minutes < 60 ? plural(minutes, "minute") : hrs < 48 ? plural(hrs, "hour") : plural(Math.round(ms / DAY), "day");
  const when = days <= 0 ? "the same day" : days === 1 ? `the next ${partOfDay(projectAt)}` : `${days} days later, on ${dayMonth(projectAt)}`;
  return { span: span.toUpperCase(), text: `From a thought typed at ${hhmm(ideaAt)} to a project with a purpose, ${when}.` };
}

/** How long something took, in words: "26 hours", "3 days". */
export function duration(from: number, to: number) {
  const ms = Math.max(0, to - from), minutes = Math.round(ms / 60_000), hrs = Math.round(ms / 3_600_000);
  return minutes < 60 ? plural(minutes, "minute") : hrs < 48 ? plural(hrs, "hour") : plural(Math.round(ms / DAY), "day");
}
