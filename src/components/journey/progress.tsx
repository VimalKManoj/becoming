"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { addDays, dayKey, weekKey, zonedStartOfDay } from "../../../convex/lib/time";
import { BloomBones, Bone, Skeleton, WeekBones } from "@/components/skeleton";
import { MindBloom } from "@/components/visuals";
import { WeekDots, type WeekSummary } from "@/components/ritual/week";
import { formatDay, plural } from "@/lib/format";
import type { Rhythm } from "@/lib/use-rhythm";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";

// Journey's Progress tab (the owner's Ritual design): a year of contributions, this
// month's Mind Bloom, the week, and the latest work. Every number is from records, and work
// counts wherever it happened: a task finished or started (in the app, by an assistant, or
// backfilled from a plan) or a focus session. Focus is one kind of work, never the gate.

type Lane = "Projects" | "Showcases" | "Writing";
type Bloom = FunctionReturnType<typeof api.journey.bloom>;
/** A month you can look back from. `sessions` is that month's own count, or null when it isn't fully loaded. */
type MonthOption = { key: string; since: number; until?: number; short: string; long: string; sessions: number | null };

const lanes: Lane[] = ["Projects", "Showcases", "Writing"];
export const laneHex: Record<Lane, string> = { Projects: "#FF8A3D", Showcases: "#86E3C3", Writing: "#C9B8F0" };
export const dotStyle = (lane: Lane) => ({ "--dot": laneHex[lane] }) as CSSProperties;
const weekdayPlural = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const graphWeeks = 53;
const monthsBack = 6;

// en-GB's short month would write "Sept", so short names are the long one cut to three letters.
const monthName = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const shortDate = (key: string) => {
  const date = new Date(`${key}T12:00:00Z`);
  return `${date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }).slice(0, 3)} ${date.getUTCDate()} ${monthName(key.slice(0, 7)).slice(0, 3)}`;
};
function shiftMonth(key: string, by: number) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + by, 1)).toISOString().slice(0, 7);
}

export function ProgressTab({ rhythm, week }: { rhythm: Rhythm; week: WeekSummary }) {
  return <div role="tabpanel" id="journey-panel-progress" aria-labelledby="journey-tab-progress">
    <Contributions rhythm={rhythm} />
    <div className="j-row">
      <div className="j-main-col">
        <BloomCard rhythm={rhythm} />
        <TidyCard />
      </div>
      <div className="j-side">
        <ReviewLink week={week} />
        <WeekCard rhythm={rhythm} week={week} />
        <RecentWork />
      </div>
    </div>
  </div>;
}

// ---------- Contributions: the last twelve months ----------

function Contributions({ rhythm }: { rhythm: Rhythm }) {
  const yearAgo = addDays(rhythm.currentWeek, -7 * (graphWeeks - 1));
  const activity = useQuery(api.journey.activity, { since: zonedStartOfDay(yearAgo, rhythm.timezone) });
  if (activity === undefined) return <Skeleton label="Loading your contributions…" className="j-graph">
    <div className="skel-full" aria-hidden="true"><Bone w={130} h={15} /><Bone w={230} h={11} i={1} /></div>
    <Bone h={124} shape="block" i={2} className="j-graph-bones" />
  </Skeleton>;

  // Each day's work: a finish weighs 2, a start or a session 1. A day made only of backfilled
  // work (recorded later, like an imported plan) shows lighter.
  const perDay = new Map<string, { weight: number; finished: number; live: boolean }>();
  for (const item of activity) {
    const day = dayKey(item.at, rhythm.timezone);
    const was = perDay.get(day) ?? { weight: 0, finished: 0, live: false };
    perDay.set(day, { weight: was.weight + item.weight, finished: was.finished + (item.weight === 2 ? 1 : 0), live: was.live || !item.backfilled });
  }
  const paused = new Set(rhythm.weeks.filter(item => item.status === "paused").map(item => item.week));
  // The graph starts at the week of your first activity, not a year of empty days; with only a
  // few weeks so far the squares are bigger, shrinking to the usual size as the year fills in.
  const earliest = activity.length ? Math.min(...activity.map(item => item.at)) : null;
  const firstWeek = earliest === null ? rhythm.currentWeek : weekKey(earliest, rhythm.timezone);
  const first = firstWeek > yearAgo ? firstWeek : yearAgo;
  const weeksShown = Math.round((Date.parse(`${rhythm.currentWeek}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / (7 * 86_400_000)) + 1;
  const cell = weeksShown <= 8 ? 30 : weeksShown <= 16 ? 24 : weeksShown <= 30 ? 18 : 14;
  const columns = Array.from({ length: weeksShown }, (_, index) => {
    const monday = addDays(first, index * 7);
    const month = monday.slice(0, 7);
    const label = index === 0 || addDays(monday, -7).slice(0, 7) !== month ? monthName(month).slice(0, 3) : "";
    const cells = Array.from({ length: 7 }, (_, day) => {
      const date = addDays(monday, day);
      const work = perDay.get(date);
      const count = work?.weight ?? 0;
      const future = date > rhythm.today;
      const rest = paused.has(monday) && !count;
      const what = work ? [work.finished ? `${plural(work.finished, "task")} finished` : "", work.weight - 2 * work.finished ? `${work.weight - 2 * work.finished} more` : ""].filter(Boolean).join(", ") : "";
      const text = future ? "later" : count ? `${what}${work && !work.live ? " (backfilled)" : ""}` : rest ? "planned pause" : date === rhythm.today ? "today, nothing yet" : "rest";
      const level = future ? "future" : rest ? "paused" : `l${Math.min(count, 3)}`;
      return { date, day, count, finished: work?.finished ?? 0, text: `${shortDate(date)} · ${text}`, className: `j-cell ${level}${work && !work.live ? " back" : ""}${date === rhythm.today ? " today" : ""}` };
    });
    return { monday, label, cells };
  });
  const all = columns.flatMap(column => column.cells);
  const total = all.reduce((sum, cell) => sum + cell.count, 0);
  const finishedTotal = all.reduce((sum, cell) => sum + cell.finished, 0);
  const active = all.filter(cell => cell.count > 0).length;
  const perWeekday = [0, 1, 2, 3, 4, 5, 6].map(day => all.filter(cell => cell.day === day).reduce((sum, cell) => sum + cell.count, 0));
  const best = perWeekday.indexOf(Math.max(...perWeekday));
  const streak = `${rhythm.streak.current}${rhythm.streakIsLowerBound ? "+" : ""}`;

  return <section className="j-graph" aria-labelledby="graph-title">
    <div className="j-graph-head">
      <div><h2 id="graph-title" className="j-h16">Contributions</h2><p className="r-small" style={{ marginTop: 3 }}>Everything you moved forward{earliest === null ? "" : ` since ${formatDay(earliest)}`}: tasks finished and started, and sessions</p></div>
      <div className="r-row" style={{ gap: 8 }}>
        {rhythm.configured
          ? <span className="j-pill ember"><span className="j-pulse" aria-hidden="true" /><span className="j-pill-n">{streak}</span><span className="j-pill-l">week streak</span></span>
          : <Link className="j-pill link" href="/journey?view=review"><span className="j-pill-l">No weekly target yet · set one</span></Link>}
        <span className="j-pill" title={`Longest streak in the last ${plural(rhythm.weeks.length, "week")}`}><span className="j-pill-n">{Math.max(rhythm.streak.longest, rhythm.streak.current)}</span><span className="j-pill-l">longest</span></span>
        <span className="j-pill"><span className="j-pill-n">{finishedTotal}</span><span className="j-pill-l">finished</span></span>
      </div>
    </div>
    <div className="j-graph-body" style={{ "--cell": `${cell}px` } as CSSProperties}>
      <div className="j-days" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span></div>
      {/* Newest week first in the markup; row-reverse puts it on the right, so a narrow screen starts at today. */}
      <div className="j-cols" style={weeksShown < 40 ? { justifyContent: "flex-end" } : undefined} role="group" aria-label={`Work per day for the last 12 months, in ${rhythm.timezone}`}>
        {[...columns].reverse().map((column, back) => <div key={column.monday} className="j-col" style={{ animationDelay: `${(weeksShown - 1 - back) * 14}ms` }}>
          <div className="j-month" aria-hidden="true"><span>{column.label}</span></div>
          {column.cells.map(cell => <span key={cell.date} className={cell.className} role="img" aria-label={cell.text} title={cell.text} />)}
        </div>)}
      </div>
    </div>
    <div className="j-graph-foot">
      <span className="r-small">{total
        ? `${plural(active, "active day")} · most often on ${weekdayPlural[best]}. Rest days stay blank, never red.`
        : "Your graph fills in as you finish and start tasks. Nothing before today is invented."}</span>
      <div className="j-legend" aria-hidden="true">
        <span style={{ marginRight: 4 }}>Less</span>
        {[0, 1, 2, 3].map(level => <span key={level} className={`j-swatch l${level}`} />)}
        <span style={{ margin: "0 10px 0 4px" }}>More</span>
        <span className="j-swatch paused" /><span style={{ marginLeft: 4 }}>Pause</span>
        <span className="j-swatch l2 back" style={{ marginLeft: 10 }} /><span style={{ marginLeft: 4 }}>Backfilled</span>
      </div>
      <p className="sr-only">Key: darker squares mean more work that day; a finished task counts twice. Paler squares are work recorded later from a plan. Striped squares are a planned pause. Each square is labelled with its date and what happened.</p>
    </div>
  </section>;
}

// ---------- Mind Bloom, this month or an earlier one ----------

/** This month and up to five before it, never earlier than the month of your first activity. */
function monthOptions(rhythm: Rhythm, firstAt: number | undefined): MonthOption[] {
  const current = rhythm.today.slice(0, 7);
  const from = rhythm.moments[0]?.at ?? firstAt;
  const earliest = from === undefined ? current : dayKey(from, rhythm.timezone).slice(0, 7);
  // Rhythm loads about six months of sessions. A month's own count is shown only when
  // the whole month falls inside the loaded weeks, so it is never an undercount.
  const loadedFrom = rhythm.weeks[rhythm.weeks.length - 1]?.week ?? rhythm.currentWeek;
  const perMonth = new Map<string, number>();
  for (const moment of rhythm.moments) {
    const month = dayKey(moment.at, rhythm.timezone).slice(0, 7);
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
  }
  const options: MonthOption[] = [];
  for (let back = 0; back < monthsBack; back++) {
    const key = shiftMonth(current, -back);
    if (back > 0 && key < earliest) break;
    const name = monthName(key);
    options.push({ key, since: zonedStartOfDay(`${key}-01`, rhythm.timezone), until: back > 0 ? zonedStartOfDay(`${shiftMonth(key, 1)}-01`, rhythm.timezone) : undefined, short: name.slice(0, 3), long: `${name} ${key.slice(0, 4)}`, sessions: `${key}-01` >= loadedFrom ? perMonth.get(key) ?? 0 : null });
  }
  return options;
}

function BloomCard({ rhythm }: { rhythm: Rhythm }) {
  const summary = useQuery(api.journey.summary);
  const [chosen, setChosen] = useState<string | null>(null);
  const months = monthOptions(rhythm, summary?.firsts.find(first => first.kind === "finished" || first.kind === "session")?.at);
  const month = months.find(option => option.key === chosen) ?? months[0];
  const live = useQuery(api.journey.bloom, { since: month.since, ...(month.until ? { until: month.until } : {}) });
  // Convex answers undefined while a new month loads. Keeping the last bloom on screen
  // stops the card collapsing on every switch.
  const [shown, setShown] = useState<{ key: string; bloom: Bloom } | null>(null);
  if (live !== undefined && (shown?.bloom !== live || shown.key !== month.key)) setShown({ key: month.key, bloom: live });
  const bloom = shown?.bloom;
  const shownMonth = months.find(option => option.key === shown?.key) ?? month;
  const current = shownMonth.key === months[0].key;
  const name = shownMonth.long.split(" ")[0];
  const range = current ? "this month" : `in ${name}`;
  const untaggedSessions = bloom ? bloom.sessions - bloom.tagged : 0;
  const nothing = bloom ? bloom.sessions === 0 && bloom.finishedInWindow === 0 : false;

  return <section className="j-bloom" aria-labelledby="bloom-title" aria-busy={live === undefined}>
    <h2 id="bloom-title" className="j-h16">Mind Bloom</h2>
    <p className="r-small" style={{ marginTop: 3 }}>Skills from finished work and sessions · {current ? name : shownMonth.long}</p>
    <div className={`j-bloom-figure${live === undefined && bloom ? " updating" : ""}`}>
      {bloom === undefined ? <Skeleton label="Growing your bloom…"><BloomBones size={300} /></Skeleton>
        // Keyed by the month, so the petals bloom in again when you change month.
        : <MindBloom key={shown?.key} petals={bloom.petals} size={380}
          label={bloom.petals.some(petal => petal.sessions) ? `Mind Bloom ${range}: ${bloom.petals.filter(petal => petal.sessions).map(petal => `${petal.name}, ${petal.sessions}`).join("; ")}` : `Mind Bloom ${range}: no skills yet`} />}
    </div>
    <p className="j-bloom-note">A petal grows with each finished task (its skills, or its milestone’s or phase’s) and each session that practised the skill.</p>
    {bloom && (nothing || bloom.untagged > 0 || untaggedSessions > 0) && <p className="j-bloom-note" style={{ marginTop: 4 }}>{nothing
      ? current ? "Nothing finished this month yet. It fills in as you finish work." : `Nothing finished ${range}.`
      : [bloom.untagged ? `${plural(bloom.untagged, "finished task")} ${range} count for no skill yet.` : "", untaggedSessions ? `${plural(untaggedSessions, "session")} without a skill.` : ""].filter(Boolean).join(" ")}</p>}
    {months.length > 1 && <div className="j-months" role="group" aria-label="Look back at an earlier month">
      {[...months].reverse().map(option => <button key={option.key} type="button" className="r-chip round h34" aria-pressed={option.key === month.key} onClick={() => setChosen(option.key)}
        aria-label={`${option.long}${option.sessions === null ? "" : `, ${plural(option.sessions, "session")}`}`}>
        {option.short}{option.sessions !== null && <span className="j-month-n" aria-hidden="true">{option.sessions}</span>}
      </button>)}
    </div>}
  </section>;
}

// ---------- The week ----------

function ReviewLink({ week }: { week: WeekSummary }) {
  const planned = week.isSunday ? week.nextPlan : week.plan ?? week.nextPlan;
  return <Link href="/journey?view=review" className="j-review-link">
    <span>
      <span className="j-review-title">Review &amp; plan the week</span>
      <span className="j-review-sub">{planned ? `Planned · ${plural(planned.taskIds.length, "step")} lined up. Adjust it any time.` : "Look back, line up a few steps, set one intention."}</span>
    </span>
    <span className="j-review-arrow" aria-hidden="true">→</span>
  </Link>;
}

function WeekCard({ rhythm, week }: { rhythm: Rhythm; week: WeekSummary }) {
  const thisWeek = rhythm.moments.filter(moment => dayKey(moment.at, rhythm.timezone) >= rhythm.currentWeek);
  const counts = lanes.map(lane => ({ lane, count: thisWeek.filter(moment => moment.lane === lane).length }));
  const days = plural(week.count, "day");
  const summary = week.paused ? `${days} · planned pause` : week.target ? `${week.count}/${week.target} days · ${week.streak}w streak` : `${days} · no target yet`;
  return <section className="j-card" aria-labelledby="week-title">
    <div className="j-week-head"><h2 id="week-title" className="j-h15">This week</h2><span className="j-week-n">{summary}</span></div>
    <WeekDots days={week.days} size={36} labels />
    <p className="j-week-line">{week.line}</p>
    <div className="r-divider" />
    <h3 className="j-sub">Lane balance</h3>
    <div className="j-lanes" aria-hidden="true">{counts.map(({ lane, count }) => <span key={lane} className={count ? "" : "none"} style={{ ...dotStyle(lane), flex: `${count || 0.0001} 1 18px` }} />)}</div>
    <ul className="j-lane-key" aria-label="Work this week by lane">{counts.map(({ lane, count }) => <li key={lane}><span className="r-dot" style={{ ...dotStyle(lane), width: 7, height: 7 }} aria-hidden="true" />{lane} {count}</li>)}</ul>
  </section>;
}

// ---------- Recent work ----------

function RecentWork() {
  const feed = useQuery(api.journey.feed, { limit: 5 });
  return <section className="j-card" aria-labelledby="recent-title">
    <div className="r-row r-between" style={{ gap: 10, marginBottom: 10 }}>
      <h2 id="recent-title" className="j-h15">Recent work</h2>
      {feed && feed.items.length > 0 && <Link className="r-link" href="/journey?view=history">Everything →</Link>}
    </div>
    {feed === undefined ? <Skeleton label="Loading recent work…"><div className="skel-stack tight" aria-hidden="true">{[0, 1, 2].map(n => <Bone key={n} w={`${80 - n * 12}%`} h={12} i={n} />)}</div></Skeleton>
      : feed.items.length === 0 ? <p className="j-empty">Nothing yet. Finish or start a task in <Link href="/work">Work</Link>, from anywhere, and it appears here.</p>
        : <ol className="j-recent">{feed.items.map(item => <li key={item.key}>
          <span className="r-dot" style={dotStyle(item.lane)} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="j-recent-title">{item.title}</div>
            <div className="j-recent-meta">{workWord(item)} · {formatDay(item.at)}{item.project ? ` · ${item.project}` : ""}{item.source !== "app" ? ` · via ${item.source}` : ""}</div>
          </div>
        </li>)}</ol>}
  </section>;
}

/** "Finished", "Started", "Focused 45 min"…, for one entry of the work feed. */
export function workWord(item: { kind: string; minutes: number | null; backfilled: boolean }) {
  const words: Record<string, string> = { done: "Finished", started: "Started", blocked: "Blocked", unblocked: "Unblocked", reopened: "Reopened", focused: "Focused", logged: "Logged" };
  const word = words[item.kind] ?? item.kind;
  const minutes = (item.kind === "focused" || item.kind === "logged") && item.minutes !== null && item.minutes > 0 && item.minutes <= 720 ? ` ${item.minutes} min` : "";
  return `${word}${minutes}${item.backfilled ? " (backfilled)" : ""}`;
}

// ---------- Tidy up: finished work that counts for no skill yet ----------

const skillNames = ["Frontend", "Interaction", "Motion", "Visual", "Writing", "Research", "Systems", "Shipping"];

/** While finished tasks count for no skill, tag their phase or milestone once and they all bloom. */
function TidyCard() {
  const untagged = useQuery(api.journey.untagged);
  if (!untagged || untagged.total === 0) return null;
  return <section className="j-card j-tidy" aria-labelledby="tidy-title">
    <h2 id="tidy-title" className="j-h15">Give your finished work its skills</h2>
    <p className="r-small" style={{ marginTop: 4 }}>{plural(untagged.total, "finished task")} count for no skill yet. Tag a phase or milestone once and every finished task in it blooms.{untagged.outside ? ` ${untagged.outside} outside any milestone are tagged one by one in their sheet.` : ""}</p>
    <ul className="j-tidy-list">{untagged.groups.map(group => <TidyRow key={`${group.kind}:${group.id}`} group={group} />)}</ul>
  </section>;
}

function TidyRow({ group }: { group: { kind: "phase" | "milestone"; id: string; name: string; project: string; count: number } }) {
  const setPhase = useMutation(api.constellation.setPhaseSkills);
  const setMilestone = useMutation(api.constellation.setMilestoneSkills);
  const { showToast } = useRitual();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (group.kind === "phase") await setPhase({ phaseId: group.id as Id<"phases">, skills: picked });
      else await setMilestone({ milestoneId: group.id as Id<"milestones">, skills: picked });
      showToast(`${group.name}: ${picked.join(", ")}. ${plural(group.count, "finished task")} now bloom.`);
    } catch (caught) { showToast(readableError(caught, "Could not save the skills."), "alert"); }
    finally { setBusy(false); }
  }
  return <li className="j-tidy-row">
    <div className="j-tidy-head"><span className="j-tidy-name">{group.name}</span><span className="r-small">{group.kind === "phase" ? "Phase" : "Milestone"} · {group.project} · {plural(group.count, "task")}</span></div>
    <div className="r-row" style={{ gap: 6 }} role="group" aria-label={`Skills for ${group.name}`}>
      {skillNames.map(skill => <button key={skill} type="button" className="r-chip round h34" aria-pressed={picked.includes(skill)}
        onClick={() => setPicked(picked.includes(skill) ? picked.filter(s => s !== skill) : [...picked, skill])}>{skill}</button>)}
      <button type="button" className="r-btn sm" disabled={busy || picked.length === 0} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
    </div>
  </li>;
}

/** The Progress tab's shape while the week loads. */
export function ProgressSkeleton() {
  return <Skeleton label="Loading your journey…">
    <div className="j-graph" aria-hidden="true"><div className="skel-full"><Bone w={130} h={15} /><Bone w={230} h={11} i={1} /></div><Bone h={124} shape="block" i={2} className="j-graph-bones" /></div>
    <div className="j-row" aria-hidden="true">
      <div className="j-bloom skel-card skel-center"><span className="skel-full"><Bone w={100} h={15} /><Bone w={220} h={11} i={1} /></span><BloomBones size={300} /></div>
      <div className="j-side">
        <div className="j-card skel-card"><Bone w="60%" h={15} /><Bone w="80%" h={11} i={1} /></div>
        <div className="j-card skel-card"><Bone w={90} h={15} /><WeekBones /><Bone w="70%" i={3} /></div>
      </div>
    </div>
  </Skeleton>;
}
