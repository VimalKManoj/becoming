"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { addDays, dayKey, zonedStartOfDay } from "../../../convex/lib/time";
import { BloomBones, Bone, Skeleton, WeekBones } from "@/components/skeleton";
import { MindBloom } from "@/components/visuals";
import { WeekDots, type WeekSummary } from "@/components/ritual/week";
import { formatDay, minutesBetween, plural } from "@/lib/format";
import type { Rhythm } from "@/lib/use-rhythm";

// Journey's Progress tab (the owner's Ritual design): a year of contributions, this
// month's Mind Bloom, the week, and the latest sessions. Every number is from records.

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
      <BloomCard rhythm={rhythm} />
      <div className="j-side">
        <ReviewLink week={week} />
        <WeekCard rhythm={rhythm} week={week} />
        <RecentSessions />
      </div>
    </div>
  </div>;
}

// ---------- Contributions: the last twelve months ----------

function Contributions({ rhythm }: { rhythm: Rhythm }) {
  const first = addDays(rhythm.currentWeek, -7 * (graphWeeks - 1));
  const activity = useQuery(api.journey.activity, { since: zonedStartOfDay(first, rhythm.timezone) });
  if (activity === undefined) return <Skeleton label="Loading your contributions…" className="j-graph">
    <div className="skel-full" aria-hidden="true"><Bone w={130} h={15} /><Bone w={230} h={11} i={1} /></div>
    <Bone h={124} shape="block" i={2} className="j-graph-bones" />
  </Skeleton>;

  const perDay = new Map<string, number>();
  for (const endedAt of activity) {
    const day = dayKey(endedAt, rhythm.timezone);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const paused = new Set(rhythm.weeks.filter(item => item.status === "paused").map(item => item.week));
  const columns = Array.from({ length: graphWeeks }, (_, index) => {
    const monday = addDays(first, index * 7);
    const month = monday.slice(0, 7);
    const label = index === 0 || addDays(monday, -7).slice(0, 7) !== month ? monthName(month).slice(0, 3) : "";
    const cells = Array.from({ length: 7 }, (_, day) => {
      const date = addDays(monday, day);
      const count = perDay.get(date) ?? 0;
      const future = date > rhythm.today;
      const rest = paused.has(monday) && !count;
      const text = future ? "later" : count ? plural(count, "session") : rest ? "planned pause" : date === rhythm.today ? "today, nothing saved yet" : "rest";
      const level = future ? "future" : rest ? "paused" : `l${Math.min(count, 3)}`;
      return { date, day, count, text: `${shortDate(date)} · ${text}`, className: `j-cell ${level}${date === rhythm.today ? " today" : ""}` };
    });
    return { monday, label, cells };
  });
  const all = columns.flatMap(column => column.cells);
  const total = all.reduce((sum, cell) => sum + cell.count, 0);
  const active = all.filter(cell => cell.count > 0).length;
  const perWeekday = [0, 1, 2, 3, 4, 5, 6].map(day => all.filter(cell => cell.day === day).reduce((sum, cell) => sum + cell.count, 0));
  const best = perWeekday.indexOf(Math.max(...perWeekday));
  const streak = `${rhythm.streak.current}${rhythm.streakIsLowerBound ? "+" : ""}`;

  return <section className="j-graph" aria-labelledby="graph-title">
    <div className="j-graph-head">
      <div><h2 id="graph-title" className="j-h16">Contributions</h2><p className="r-small" style={{ marginTop: 3 }}>Every saved session over the last 12 months</p></div>
      <div className="r-row" style={{ gap: 8 }}>
        {rhythm.configured
          ? <span className="j-pill ember"><span className="j-pulse" aria-hidden="true" /><span className="j-pill-n">{streak}</span><span className="j-pill-l">week streak</span></span>
          : <Link className="j-pill link" href="/journey?view=review"><span className="j-pill-l">No weekly target yet · set one</span></Link>}
        <span className="j-pill" title={`Longest streak in the last ${plural(rhythm.weeks.length, "week")}`}><span className="j-pill-n">{Math.max(rhythm.streak.longest, rhythm.streak.current)}</span><span className="j-pill-l">longest</span></span>
        <span className="j-pill"><span className="j-pill-n">{total}</span><span className="j-pill-l">{total === 1 ? "session" : "sessions"}</span></span>
      </div>
    </div>
    <div className="j-graph-body">
      <div className="j-days" aria-hidden="true"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span></div>
      {/* Newest week first in the markup; row-reverse puts it on the right, so a narrow screen starts at today. */}
      <div className="j-cols" role="group" aria-label={`Saved sessions per day for the last 12 months, in ${rhythm.timezone}`}>
        {[...columns].reverse().map((column, back) => <div key={column.monday} className="j-col" style={{ animationDelay: `${(graphWeeks - 1 - back) * 14}ms` }}>
          <div className="j-month" aria-hidden="true"><span>{column.label}</span></div>
          {column.cells.map(cell => <span key={cell.date} className={cell.className} role="img" aria-label={cell.text} title={cell.text} />)}
        </div>)}
      </div>
    </div>
    <div className="j-graph-foot">
      <span className="r-small">{total
        ? `${plural(active, "active day")} · most often on ${weekdayPlural[best]}. Rest days stay blank, never red.`
        : "Your graph fills in as you save sessions. Nothing before today is invented."}</span>
      <div className="j-legend" aria-hidden="true">
        <span style={{ marginRight: 4 }}>Less</span>
        {[0, 1, 2, 3].map(level => <span key={level} className={`j-swatch l${level}`} />)}
        <span style={{ margin: "0 10px 0 4px" }}>More</span>
        <span className="j-swatch paused" /><span style={{ marginLeft: 4 }}>Pause</span>
      </div>
      <p className="sr-only">Key: darker squares mean more sessions that day, from none to three or more. Striped squares are a planned pause. Each square is labelled with its date and count.</p>
    </div>
  </section>;
}

// ---------- Mind Bloom, this month or an earlier one ----------

/** This month and up to five before it, never earlier than the month of your first saved session. */
function monthOptions(rhythm: Rhythm, firstSessionAt: number | undefined): MonthOption[] {
  const current = rhythm.today.slice(0, 7);
  const earliest = firstSessionAt === undefined ? current : dayKey(firstSessionAt, rhythm.timezone).slice(0, 7);
  // Rhythm loads about six months of sessions. A month's own count is shown only when
  // the whole month falls inside the loaded weeks, so it is never an undercount.
  const loadedFrom = rhythm.weeks[rhythm.weeks.length - 1]?.week ?? rhythm.currentWeek;
  const perMonth = new Map<string, number>();
  for (const session of rhythm.sessions) {
    const month = dayKey(session.endedAt, rhythm.timezone).slice(0, 7);
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
  const months = monthOptions(rhythm, summary?.firsts.find(first => first.kind === "session")?.at);
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
  const untagged = bloom ? bloom.sessions - bloom.tagged : 0;

  return <section className="j-bloom" aria-labelledby="bloom-title" aria-busy={live === undefined}>
    <h2 id="bloom-title" className="j-h16">Mind Bloom</h2>
    <p className="r-small" style={{ marginTop: 3 }}>Skills evidenced by sessions · {current ? name : shownMonth.long}</p>
    <div className={`j-bloom-figure${live === undefined && bloom ? " updating" : ""}`}>
      {bloom === undefined ? <Skeleton label="Growing your bloom…"><BloomBones size={300} /></Skeleton>
        // Keyed by the month, so the petals bloom in again when you change month.
        : <MindBloom key={shown?.key} petals={bloom.petals} size={380}
          label={bloom.petals.some(petal => petal.sessions) ? `Mind Bloom ${range}: ${bloom.petals.filter(petal => petal.sessions).map(petal => `${petal.name}, ${plural(petal.sessions, "session")}`).join("; ")}` : `Mind Bloom ${range}: no skills tagged yet`} />}
    </div>
    <p className="j-bloom-note">Each petal grows only when a saved session tags that skill.</p>
    {bloom && (bloom.sessions === 0 || untagged > 0) && <p className="j-bloom-note" style={{ marginTop: 4 }}>{bloom.sessions === 0
      ? current ? "Nothing saved this month yet. It fills in as you finish sessions." : `No sessions saved ${range}.`
      : `${plural(untagged, "session")} ${range} without a skill tagged.`}</p>}
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
  const thisWeek = rhythm.sessions.filter(session => dayKey(session.endedAt, rhythm.timezone) >= rhythm.currentWeek);
  const counts = lanes.map(lane => ({ lane, count: thisWeek.filter(session => session.lane === lane).length }));
  const summary = week.paused ? `${week.count} · planned pause` : week.target ? `${week.count}/${week.target} · ${week.streak}w streak` : `${week.count} · no target yet`;
  return <section className="j-card" aria-labelledby="week-title">
    <div className="j-week-head"><h2 id="week-title" className="j-h15">This week</h2><span className="j-week-n">{summary}</span></div>
    <WeekDots days={week.days} size={36} labels />
    <p className="j-week-line">{week.line}</p>
    <div className="r-divider" />
    <h3 className="j-sub">Lane balance</h3>
    <div className="j-lanes" aria-hidden="true">{counts.map(({ lane, count }) => <span key={lane} className={count ? "" : "none"} style={{ ...dotStyle(lane), flex: `${count || 0.0001} 1 18px` }} />)}</div>
    <ul className="j-lane-key" aria-label="Sessions this week by lane">{counts.map(({ lane, count }) => <li key={lane}><span className="r-dot" style={{ ...dotStyle(lane), width: 7, height: 7 }} aria-hidden="true" />{lane} {count}</li>)}</ul>
  </section>;
}

// ---------- Recent sessions ----------

function RecentSessions() {
  const recent = useQuery(api.journey.listPage, { paginationOpts: { numItems: 3, cursor: null } });
  return <section className="j-card" aria-labelledby="recent-title">
    <div className="r-row r-between" style={{ gap: 10, marginBottom: 10 }}>
      <h2 id="recent-title" className="j-h15">Recent sessions</h2>
      {recent && recent.page.length > 0 && <Link className="r-link" href="/journey?view=history">All sessions →</Link>}
    </div>
    {recent === undefined ? <Skeleton label="Loading recent sessions…"><div className="skel-stack tight" aria-hidden="true">{[0, 1, 2].map(n => <Bone key={n} w={`${80 - n * 12}%`} h={12} i={n} />)}</div></Skeleton>
      : recent.page.length === 0 ? <p className="j-empty">No saved sessions yet. Finish one in <Link href="/today">Today</Link> and it appears here. Cancelled sessions never count.</p>
        : <ol className="j-recent">{recent.page.map(session => {
          const minutes = session.startedAt !== undefined ? minutesBetween(session.startedAt, session.endedAt) : null;
          return <li key={session._id}>
            <span className="r-dot" style={dotStyle(session.lane)} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="j-recent-title">{session.title}</div>
              <div className="j-recent-meta">{session.lane} · {formatDay(session.endedAt)}{minutes !== null && minutes <= 720 ? ` · ${minutes} min` : ""} · {session.outcome}</div>
            </div>
          </li>;
        })}</ol>}
  </section>;
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
