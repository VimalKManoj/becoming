"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { addDays } from "../../../convex/lib/time";
import { Bone, CardBones, Skeleton } from "@/components/skeleton";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { formatDay, formatWeek, minutesBetween, plural } from "@/lib/format";
import type { Rhythm } from "@/lib/use-rhythm";
import { dotStyle } from "@/components/journey/progress";

// Journey's "All sessions" view (?view=history): every saved recap, newest first, with the
// body of work, your weeks and reflections, and what the shown sessions say about estimates
// and suggestions. Reached from Recent sessions on the Progress tab.

type Lane = "Projects" | "Showcases" | "Writing";
export type Session = FunctionReturnType<typeof api.journey.listPage>["page"][number];
type PageStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
type WeekStatus = "met" | "missed" | "paused" | "in-progress" | "not-set";

const lanes: Lane[] = ["Projects", "Showcases", "Writing"];
const focusOnMount = (node: HTMLElement | null) => node?.focus();
const focusById = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

// Sessions recapped many hours after they started (say, the next morning) say nothing
// useful about the estimate, so they are left out of timing comparisons.
const maxTimedMinutes = 12 * 60;
function actualMinutes(session: Session) {
  if (session.startedAt === undefined) return undefined;
  const minutes = minutesBetween(session.startedAt, session.endedAt);
  return minutes <= maxTimedMinutes ? minutes : undefined;
}

export function JourneyHistory({ rhythm }: { rhythm: Rhythm }) {
  const { results, status, loadMore } = usePaginatedQuery(api.journey.listPage, {}, { initialNumItems: 12 });
  return <>
    <div className="j-head">
      <div>
        <Link className="r-back" href="/journey" style={{ marginBottom: 16 }}>‹ Journey</Link>
        <div className="r-eyebrow">Journey · all sessions</div>
        <h1 className="r-title">Every step, <em>kept.</em></h1>
      </div>
    </div>
    <div className="j-history">
      <div className="j-history-col">
        <BodyOfWork />
        <Weeks rhythm={rhythm} />
      </div>
      <div className="j-history-col">
        {status === "LoadingFirstPage" ? <Skeleton label="Loading your sessions…" className="skel-stack">{[0, 1, 2].map(n => <CardBones key={n} lines={3} chips={2} i={n * 2} />)}</Skeleton> : <>
          {results.length > 0 && <div className="j-insights">
            <LaneBalance sessions={results} more={status !== "Exhausted"} />
            <EstimatePanel sessions={results} />
            <ChoicePanel sessions={results} />
          </div>}
          <History sessions={results} status={status} onMore={() => loadMore(12)} />
        </>}
      </div>
    </div>
  </>;
}

// ---------- History ----------

/** Sessions grouped by the month they were saved in, newest first, as the browser shows dates. */
function byMonth(sessions: Session[]) {
  const groups: { key: string; label: string; sessions: Session[] }[] = [];
  for (const session of sessions) {
    const date = new Date(session.endedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const group = groups.find(item => item.key === key);
    if (group) group.sessions.push(session);
    else groups.push({ key, label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }), sessions: [session] });
  }
  return groups;
}

function History({ sessions, status, onMore }: { sessions: Session[]; status: PageStatus; onMore: () => void }) {
  const groups = byMonth(sessions);
  const more = status !== "Exhausted";
  return <section className="r-stack" style={{ gap: 14 }} aria-labelledby="history-heading">
    <div className="r-row r-between" style={{ gap: 10, alignItems: "baseline" }}>
      <h2 id="history-heading" className="j-h16">Your recent steps</h2>
      {sessions.length > 0 && <span className="r-small"><span className="r-mono">{sessions.length}{more ? "+" : ""}</span> saved recaps</span>}
    </div>
    {!sessions.length && <p className="j-empty-box">Finish your first session in <Link href="/today">Today</Link> to start your history. Cancelled sessions do not count.</p>}
    {groups.map((group, index) => <section key={group.key} className="r-stack" style={{ gap: 10 }} aria-labelledby={`history-${group.key}`}>
      {/* The oldest month may continue on the next page, so its count says "shown". */}
      <h3 id={`history-${group.key}`} className="r-eyebrow" style={{ margin: "6px 4px 0" }}>{group.label} · {plural(group.sessions.length, "session")}{more && index === groups.length - 1 ? " shown" : ""}</h3>
      <ol className="j-plain r-stack" style={{ gap: 10 }}>{group.sessions.map(session => <li key={session._id}><SessionCard session={session} /></li>)}</ol>
    </section>)}
    {status === "CanLoadMore" && <button type="button" className="r-ghost sm" style={{ alignSelf: "flex-start" }} onClick={onMore}>Show older sessions</button>}
    {status === "LoadingMore" && <Skeleton label="Loading older sessions…" className="skel-stack"><CardBones lines={2} chips={2} /></Skeleton>}
  </section>;
}

const outcomeStatus: Record<Session["outcome"], [string, string]> = {
  "Finished": ["s-done", "✓ Finished"], "Made progress": ["s-progress", "◐ Made progress"], "Blocked": ["s-blocked", "■ Blocked"],
};
const artifactStatus: Record<Session["artifacts"][number]["status"], [string, string]> = {
  "Draft": ["s-draft", "Draft"], "Ready to share": ["s-share", "Ready to share"], "Published": ["s-published", "Published ↗"],
};

function timingText(session: Session) {
  const actual = actualMinutes(session);
  if (actual === undefined) return session.startedAt !== undefined ? "Recapped later, so not timed" : "";
  return session.plannedMinutes ? `took ${actual} min · planned ${session.plannedMinutes} min` : `took ${actual} min`;
}

function SessionCard({ session }: { session: Session }) {
  const addEvidence = useMutation(api.proof.addToSession);
  const { showToast } = useRitual();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timing = timingText(session);
  const [outcomeClass, outcomeLabel] = outcomeStatus[session.outcome];
  // Older recaps may hold a link without a Proof item; show it so nothing is hidden.
  const legacyLink = session.evidence && !session.artifacts.some(artifact => artifact.url === session.evidence) ? session.evidence : "";
  // Skills from the recap and from its evidence, each shown once.
  const skills = [...new Map([...session.skills, ...session.artifacts.flatMap(artifact => artifact.skills)].map(skill => [skill.toLowerCase(), skill])).values()];
  const id = `session-${session._id}`;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await addEvidence({ sessionId: session._id, url: String(data.get("url") || ""), title: String(data.get("title") || "") });
      setAdding(false);
      showToast("Added to Proof as a private draft.");
      focusById(id);
    } catch (caught) { setError(readableError(caught, "Could not add the evidence. Please try again.")); }
    finally { setBusy(false); }
  }

  return <article className="j-card j-session" id={id} tabIndex={-1} aria-labelledby={`${id}-title`}>
    <div className="r-row" style={{ gap: "8px 10px" }}>
      <span className="r-tag" style={dotStyle(session.lane)}><span className="r-dot" style={{ width: 7, height: 7 }} aria-hidden="true" />{session.lane}</span>
      <span className="j-mono-12">{formatDay(session.endedAt)}</span>
      {session.source && <span className="r-small" style={{ fontSize: 12 }}>via {session.source}</span>}
      <span className={`r-status ${outcomeClass}`} style={{ marginLeft: "auto" }}>{outcomeLabel}</span>
    </div>
    <h4 id={`${id}-title`} className="j-session-title">{session.title}{session.smaller && <span className="r-small"> · smaller step</span>}</h4>
    <p className="r-body j-preserve">{session.contribution}</p>
    {session.nextStep && <div className={session.outcome === "Blocked" ? "r-inset j-blocked" : "r-inset"}>
      <div className="r-eyebrow-sm">{session.outcome === "Blocked" ? "Blocked by" : "Next"}</div><p className="r-body j-preserve" style={{ marginTop: 4 }}>{session.nextStep}</p>
    </div>}
    {(timing || skills.length > 0) && <div className="r-row" style={{ gap: "8px 18px" }}>
      {timing && <span className="r-small"><span className="r-eyebrow-sm" style={{ marginRight: 6 }}>Time</span><span className="r-mono" style={{ color: "var(--r-text)" }}>{timing}</span></span>}
      {skills.length > 0 && <ul className="j-plain r-row" style={{ gap: 6 }} aria-label="Skills practised">{skills.map(skill => <li key={skill} className="r-fact">{skill}</li>)}</ul>}
    </div>}
    {(session.artifacts.length > 0 || legacyLink) && <ul className="j-plain j-evidence" aria-label="Evidence">
      {session.artifacts.map(artifact => <li key={artifact._id}><a href={artifact.url} target="_blank" rel="noreferrer">{artifact.title} ↗</a><span className={`r-status ${artifactStatus[artifact.status][0]}`}>{artifactStatus[artifact.status][1]}</span></li>)}
      {legacyLink && <li><a href={legacyLink} target="_blank" rel="noreferrer">Evidence ↗</a></li>}
    </ul>}
    {adding ? <form className="r-stack" style={{ gap: 12 }} onSubmit={event => void add(event)} aria-label={`Add evidence to ${session.title}`}>
      {error && <p role="alert" className="j-alert">{error}</p>}
      <fieldset className="j-fieldset" disabled={busy}><legend className="sr-only">New evidence</legend>
        <label className="r-field">Evidence link<input ref={focusOnMount} name="url" type="url" required maxLength={2000} placeholder="https://…" className="r-input mono" style={{ height: 46 }} /></label>
        <label className="r-field">Title · optional<input name="title" maxLength={1000} placeholder={session.title} className="r-input" style={{ height: 46, fontSize: 14 }} /></label>
        <p className="r-small">It arrives in Proof as a private draft.</p>
        <div className="r-row" style={{ gap: 8 }}><button type="submit" className="r-btn sm">{busy ? "Adding…" : "Add to Proof"}</button><button type="button" className="r-ghost sm" onClick={() => { setAdding(false); setError(""); focusById(id); }}>Cancel</button></div>
      </fieldset>
    </form> : <div><button type="button" className="r-ghost xs" onClick={() => setAdding(true)}>+ Add evidence</button></div>}
  </article>;
}

// ---------- Insights over the sessions shown ----------

/** How the shown sessions spread across the three lanes. Each lane says its count in words. */
function LaneBalance({ sessions, more }: { sessions: Session[]; more: boolean }) {
  const counts = lanes.map(lane => ({ lane, count: sessions.filter(session => session.lane === lane).length }));
  return <section className="j-card j-insight" aria-labelledby="balance-heading">
    <h2 id="balance-heading" className="r-eyebrow">Lane balance · shown</h2>
    <p className="j-big">{sessions.length}{more ? "+" : ""}</p>
    <p className="r-small">saved {sessions.length === 1 ? "recap" : "recaps"} shown{more ? ", with older ones still to load" : ""}</p>
    <div className="j-lanes" aria-hidden="true">{counts.map(({ lane, count }) => <span key={lane} className={count ? "" : "none"} style={{ ...dotStyle(lane), flex: `${count || 0.0001} 1 18px` }} />)}</div>
    <ul className="j-lane-key">{counts.map(({ lane, count }) => <li key={lane}><span className="r-dot" style={{ ...dotStyle(lane), width: 7, height: 7 }} aria-hidden="true" />{lane} {count}</li>)}</ul>
  </section>;
}

// Planned versus actual time for the sessions currently shown. It describes, it doesn't
// judge: estimates are a skill that improves with feedback.
function EstimatePanel({ sessions }: { sessions: Session[] }) {
  const timed = sessions.flatMap(session => {
    const actual = actualMinutes(session);
    return actual !== undefined && session.plannedMinutes ? [{ planned: session.plannedMinutes, actual }] : [];
  });
  if (!timed.length) return null;
  const planned = timed.reduce((sum, item) => sum + item.planned, 0);
  const actual = timed.reduce((sum, item) => sum + item.actual, 0);
  const ratio = actual / planned;
  const summary = ratio >= 1.15 ? `about ${ratio.toFixed(1)}× your plan` : ratio <= 0.85 ? `about ${Math.round(ratio * 100)}% of your plan` : "close to your plan";
  const widest = Math.max(planned, actual);
  return <section className="j-card j-insight" aria-labelledby="estimates-heading">
    <h2 id="estimates-heading" className="r-eyebrow">Estimates</h2>
    <div className="j-estimate" aria-hidden="true"><span className="planned" style={{ width: `${(planned / widest) * 100}%` }} /><span className="actual" style={{ width: `${(actual / widest) * 100}%` }} /></div>
    <dl className="j-estimate-n">
      <div><dt className="r-small">min planned</dt><dd>{planned}</dd></div>
      <div><dt className="r-small">min actual</dt><dd>{actual}</dd></div>
    </dl>
    <p className="j-13">Across {plural(timed.length, "timed session")} shown, you spent {summary}.</p>
    <p className="r-small">Sessions recapped many hours after starting are left out.</p>
  </section>;
}

// How often the shown sessions followed Today's top suggestion, and the reasons given
// when they didn't. Sessions from before this was recorded are left out.
function ChoicePanel({ sessions }: { sessions: Session[] }) {
  const recorded = sessions.filter(session => session.recommended !== undefined);
  if (!recorded.length) return null;
  const followed = recorded.filter(session => session.recommended).length;
  const reasons = new Map<string, number>();
  for (const session of recorded) if (session.swapReason) reasons.set(session.swapReason, (reasons.get(session.swapReason) ?? 0) + 1);
  const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
  return <section className="j-card j-insight" aria-labelledby="choices-heading">
    <h2 id="choices-heading" className="r-eyebrow">Suggestions</h2>
    <p className="j-big">{followed}<span className="j-of"> / {recorded.length}</span></p>
    <p className="r-small">followed Today’s top suggestion</p>
    <p className="j-13">Of {plural(recorded.length, "session")} shown with a recorded choice, {followed} followed the suggestion and {recorded.length - followed} chose another task{top ? `, most often because: ${top[0].toLowerCase()} (${top[1]})` : ""}.</p>
    <p className="r-small">This helps you judge whether the suggestions fit your evenings. It never changes your history.</p>
  </section>;
}

// ---------- Body of work and firsts ----------

// Lifetime counts and firsts. Each first comes from the record that earned it, so it
// appears once and disappears only if that record does.
function BodyOfWork() {
  const summary = useQuery(api.journey.summary);
  if (summary === undefined) return <Skeleton label="Loading your body of work…"><CardBones lines={3} /></Skeleton>;
  const { lifetime, firsts } = summary;
  const counts: [number, string][] = [
    [lifetime.sessions, lifetime.sessions === 1 ? "saved session" : "saved sessions"],
    [lifetime.evidence, lifetime.evidence === 1 ? "piece of evidence" : "pieces of evidence"],
    [lifetime.published, "published"],
    [lifetime.milestones, lifetime.milestones === 1 ? "milestone completed" : "milestones completed"],
  ];
  return <section className="j-card r-stack" style={{ gap: 14 }} aria-labelledby="lifetime-heading">
    <h2 id="lifetime-heading" className="j-h15">Your body of work so far</h2>
    <dl className="j-counts">{counts.map(([count, label]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <p className="r-small">A missed week never takes saved sessions away.</p>
    {firsts.length > 0 ? <div className="r-stack" style={{ gap: 10 }}>
      <h3 className="r-eyebrow">Firsts</h3>
      <ol className="j-firsts">{firsts.map(first => <li key={first.kind}>
        <span className="j-mono-12">{formatDay(first.at)}</span>
        <span className="j-13"><strong style={{ fontWeight: 500, color: "var(--r-ink)" }}>{first.label}</strong>{first.detail ? ` · ${first.detail}` : ""}</span>
      </li>)}</ol>
    </div> : <p className="r-small">Your firsts (first session, first showcase, first published piece) appear here as they happen.</p>}
  </section>;
}

// ---------- Weeks and reflections ----------

const weekStatus: Record<WeekStatus, [string, string]> = {
  "met": ["s-done", "✓ Met target"], "missed": ["s-archived", "Target missed"], "paused": ["s-brainstorming", "Planned pause"],
  "in-progress": ["s-progress", "In progress"], "not-set": ["s-archived", "Before your rhythm"],
};

function Weeks({ rhythm }: { rhythm: Rhythm }) {
  const recent = rhythm.weeks.slice(0, 8);
  return <section className="j-card r-stack" style={{ gap: 12 }} aria-labelledby="weeks-heading">
    <div className="r-row r-between" style={{ gap: 10, alignItems: "baseline" }}>
      <h2 id="weeks-heading" className="j-h15">Your weeks</h2>
      {rhythm.configured && <span className="j-mono-12">{rhythm.streak.current}{rhythm.streakIsLowerBound ? "+" : ""}w streak · longest {rhythm.streak.longest}</span>}
    </div>
    {!rhythm.configured && <p className="j-13">Choose a weekly target in the <Link href="/journey?view=review">weekly review</Link> or <Link href="/settings">Settings</Link> to see each week’s result and your streaks.</p>}
    <p className="r-small">Paused weeks and the week in progress neither add to nor break a streak. Finished weeks keep the target they had.</p>
    <ol className="j-plain j-weeks">{recent.map(item => {
      const reflection = rhythm.reflections.find(note => note.week === item.week);
      const plan = rhythm.plans.find(note => note.week === item.week);
      const [cls, label] = weekStatus[item.status];
      return <li key={item.week}>
        <div className="r-row r-between" style={{ gap: "6px 12px" }}>
          <span className="j-13"><span className="sr-only">Week of </span><span className="r-mono">{formatWeek(item.week)}</span> <span className="r-small">· {item.target ? `${item.count} of ${plural(item.target, "session")}` : plural(item.count, "session")}</span></span>
          <span className={`r-status ${cls}`}>{label}</span>
        </div>
        {(reflection?.learning || reflection?.intention || plan?.intention) && <dl className="j-reflection">
          {reflection?.learning && <div><dt className="r-eyebrow-sm">Learned</dt><dd className="j-preserve">{reflection.learning}</dd></div>}
          {reflection?.intention && <div><dt className="r-eyebrow-sm">Intended</dt><dd className="j-preserve">{reflection.intention}</dd></div>}
          {plan?.intention && <div><dt className="r-eyebrow-sm">Intention</dt><dd className="j-preserve">{plan.intention}</dd></div>}
        </dl>}
      </li>;
    })}</ol>
    <ReflectionForm rhythm={rhythm} />
  </section>;
}

function ReflectionForm({ rhythm }: { rhythm: Rhythm }) {
  const saveReflection = useMutation(api.rhythm.saveReflection);
  const { showToast } = useRitual();
  const [week, setWeek] = useState(rhythm.currentWeek);
  const [busy, setBusy] = useState(false);
  const lastWeek = addDays(rhythm.currentWeek, -7);
  const existing = rhythm.reflections.find(item => item.week === week);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await saveReflection({ week, learning: String(data.get("learning") || ""), intention: String(data.get("intention") || "") });
      showToast("Reflection saved.");
    } catch (caught) { showToast(readableError(caught, "Could not save your reflection. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  return <form className="j-reflect" onSubmit={event => void save(event)} aria-labelledby="reflect-heading">
    <h3 id="reflect-heading" className="j-reflect-title">Reflect on a <em>week</em></h3>
    <fieldset className="j-fieldset" disabled={busy}><legend className="sr-only">Weekly reflection</legend>
      <div className="r-row" style={{ gap: 6 }} role="radiogroup" aria-label="Week" onKeyDown={radioKeys}>
        {[[rhythm.currentWeek, "This week"], [lastWeek, "Last week"]].map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={week === key} className="r-chip round h34" onClick={() => setWeek(key)}>{label} · {formatWeek(key)}</button>)}
      </div>
      {/* Keyed by week, so switching weeks loads that week's saved text. */}
      <div key={week} className="r-stack" style={{ gap: 12 }}>
        <label className="r-field">One thing you learned<textarea name="learning" className="r-textarea" rows={2} maxLength={2000} defaultValue={existing?.learning ?? ""} /></label>
        <label className="r-field">Your intention for the next week<textarea name="intention" className="r-textarea" rows={2} maxLength={2000} defaultValue={existing?.intention ?? ""} /></label>
      </div>
      <p className="r-small">Reflections are private notes. Leave both empty to remove one.</p>
      <div><button type="submit" className="r-btn sm">{busy ? "Saving…" : "Save reflection"}</button></div>
    </fieldset>
  </form>;
}

export function HistorySkeleton() {
  return <Skeleton label="Loading all sessions…">
    <div className="j-head" aria-hidden="true"><span className="skel-full" style={{ maxWidth: 420 }}><Bone w={90} h={36} shape="pill" /><Bone w={160} h={11} i={1} /><Bone w="80%" h={46} i={2} className="bone-title" /></span></div>
    <div className="j-history" aria-hidden="true"><div className="j-history-col"><CardBones lines={3} /></div><div className="j-history-col">{[0, 1].map(n => <CardBones key={n} lines={3} chips={2} i={n * 2} />)}</div></div>
  </Skeleton>;
}
