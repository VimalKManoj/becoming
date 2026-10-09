"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { addDays, weekRange } from "../../../convex/lib/time";
import { Bone, Skeleton } from "@/components/skeleton";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useRitual } from "@/components/ritual/ritual-context";
import type { WeekSummary } from "@/components/ritual/week";
import { readableError } from "@/lib/errors";
import { isoWeek, minutesBetween, plural } from "@/lib/format";
import type { Rhythm } from "@/lib/use-rhythm";
import { dotStyle } from "@/components/journey/progress";

// The weekly review (the owner's Ritual design): look back on a week, shape the next one
// with a target, a few lined-up steps and one intention, then see it whole and save.
// From Friday it plans next week; earlier in the week it plans this one.

type Lane = "Projects" | "Showcases" | "Writing";
type Task = FunctionReturnType<typeof api.tasks.listPage>["page"][number];
type Group = { key: string; name: string; lane: Lane; tasks: Task[] };

const steps = ["Look back", "Plan ahead", "Your week"];
const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
const targetChoices = [2, 3, 4, 5, 6];
const maxLinedUp = 12;
const maxTimedMinutes = 12 * 60;

const monthShort = (date: Date) => date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }).slice(0, 3).toUpperCase();
/** "WEEK 39 · 21 TO 27 SEP", or "WEEK 40 · 28 SEP TO 4 OCT" across a month. */
function weekLabel(week: string) {
  const start = new Date(`${week}T12:00:00Z`), end = new Date(`${addDays(week, 6)}T12:00:00Z`);
  const from = start.getUTCMonth() === end.getUTCMonth() ? `${start.getUTCDate()}` : `${start.getUTCDate()} ${monthShort(start)}`;
  return `Week ${isoWeek(start)} · ${from} to ${end.getUTCDate()} ${monthShort(end)}`.toUpperCase();
}
const toTop = () => requestAnimationFrame(() => { document.getElementById("main")?.scrollTo({ top: 0 }); document.getElementById("review-title")?.focus(); });

export function WeeklyReview({ rhythm, week }: { rhythm: Rhythm; week: WeekSummary }) {
  const router = useRouter();
  const { showToast } = useRitual();
  const saveReflection = useMutation(api.rhythm.saveReflection);
  const saveWeekPlan = useMutation(api.rhythm.saveWeekPlan);
  const setRhythm = useMutation(api.rhythm.setRhythm);
  const setPause = useMutation(api.rhythm.setPause);

  // Friday to Sunday looks back on this week and plans the next; earlier, last week and this.
  const weekday = (new Date(`${rhythm.today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const planWeek = weekday >= 4 ? rhythm.nextWeek : rhythm.currentWeek;
  const lookWeek = addDays(planWeek, -7);
  const planningNext = planWeek === rhythm.nextWeek;
  const reflection = rhythm.reflections.find(item => item.week === lookWeek);
  const plan = rhythm.plans.find(item => item.week === planWeek);
  const inForce = planningNext ? rhythm.next : rhythm.configured ? { target: rhythm.thisWeek.target ?? 3, paused: rhythm.thisWeek.status === "paused" } : null;

  const [step, setStep] = useState(0);
  const [learning, setLearning] = useState(reflection?.learning ?? "");
  const [intention, setIntention] = useState(plan?.intention ?? "");
  const [target, setTarget] = useState(inForce?.target ?? 3);
  const [paused, setPaused] = useState(Boolean(inForce?.paused));
  const [chosen, setChosen] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>(plan?.taskIds.map(String) ?? []);
  const [busy, setBusy] = useState(false);

  const tasks = useQuery(api.tasks.listPage, { paginationOpts: { numItems: 200, cursor: null }, view: "active" });
  const projects = useQuery(api.projects.options);
  const groups = groupTasks(tasks?.page, projects);
  const open = groups?.flatMap(group => group.tasks) ?? [];
  const lined = open.filter(task => picked.includes(String(task._id)));
  const minutes = lined.reduce((sum, task) => sum + task.minutes, 0);

  function go(next: number) { setStep(next); toTop(); }
  function back() { if (step) go(step - 1); else router.push("/journey"); }

  async function lookedBack() {
    const text = learning.trim();
    if (text !== (reflection?.learning ?? "")) {
      setBusy(true);
      try { await saveReflection({ week: lookWeek, learning: text, intention: reflection?.intention ?? "" }); }
      catch (caught) { showToast(readableError(caught, "Could not save your reflection. Please try again."), "alert"); return; }
      finally { setBusy(false); }
    }
    go(1);
  }

  async function save() {
    const zone = rhythm.savedTimezone && !rhythm.timezoneUnsupported ? rhythm.savedTimezone : rhythm.browserZone;
    // The rhythm's week is worked out in this same zone and refreshes every minute.
    const currentWeek = rhythm.currentWeek;
    setBusy(true);
    try {
      let startsLater = "";
      if (!rhythm.configured || !rhythm.savedTimezone || target !== inForce?.target) {
        const result = await setRhythm({ timezone: zone, weeklyTarget: target, currentWeek });
        if (result.appliesFrom > planWeek) startsLater = " Your new target starts next Monday.";
      }
      if (paused !== Boolean(inForce?.paused)) await setPause({ currentWeek, week: planWeek, paused });
      await saveWeekPlan({ currentWeek, week: planWeek, intention: intention.trim(), taskIds: lined.map(task => task._id) });
      const number = isoWeek(new Date(`${planWeek}T12:00:00Z`));
      showToast(paused
        ? `Week ${number} is planned as a pause. ${plural(lined.length, "step")} lined up.`
        : `Week ${number} is planned. ${plural(lined.length, "step")} lined up, ${target} evenings.${startsLater}`);
      router.push("/today");
    } catch (caught) { showToast(readableError(caught, "Could not save your week. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  function toggleGroup(group: Group, on: boolean) {
    const ids = group.tasks.map(task => String(task._id));
    if (on) { setChosen(chosen.filter(key => key !== group.key)); setPicked(picked.filter(id => !ids.includes(id))); }
    else setChosen([...chosen, group.key]);
  }

  // A group shows its steps when you chose it, or when one of its steps is already lined up.
  const shownGroups = groups?.filter(group => chosen.includes(group.key) || group.tasks.some(task => picked.includes(String(task._id)))) ?? [];

  return <>
    <div className="j-rev-head">
      <button type="button" className="r-back" onClick={back}>‹ Back</button>
      <ol className="j-steps" aria-label="Weekly review steps">{steps.map((label, index) => <li key={label} className="j-step" aria-current={index === step ? "step" : undefined}>
        <span className={`j-step-n${index <= step ? " on" : ""}`} aria-hidden="true">{index + 1}</span>{label}
        {index < step && <span className="sr-only"> (done)</span>}
      </li>)}</ol>
    </div>

    {step === 0 && <LookBack rhythm={rhythm} week={week} lookWeek={lookWeek} learning={learning} onLearning={setLearning} busy={busy} onNext={() => void lookedBack()} />}

    {step === 1 && <div key="plan" className="j-rev" style={{ gap: 22 }}>
      <div>
        <div className="r-eyebrow mint">{weekLabel(planWeek)}</div>
        <h1 id="review-title" tabIndex={-1} className="r-title">Shape {planningNext ? "next" : "this"} <em className="mint">week.</em></h1>
        <p className="r-lede" style={{ marginTop: 10 }}>A light plan, not a schedule. No days, no deadlines.</p>
      </div>

      <div>
        <h2 id="evenings-label" className="j-h14" style={{ marginBottom: 10 }}>How many evenings?</h2>
        <div className="r-row" style={{ gap: 6 }}>
          <div className="r-row" style={{ gap: 6 }} role="radiogroup" aria-labelledby="evenings-label" onKeyDown={radioKeys}>
            {[...new Set([...targetChoices, inForce?.target ?? 3])].sort((a, b) => a - b).map(value => <button key={value} type="button" role="radio" aria-checked={target === value} className="r-chip j-target" onClick={() => setTarget(value)}>{value}</button>)}
          </div>
          <span style={{ flex: 1 }} />
          <span className="j-pause-row">Plan a pause instead<button type="button" role="switch" aria-checked={paused} aria-label="Plan a pause instead" className="r-toggle" onClick={() => setPaused(!paused)} /></span>
        </div>
        {rhythm.configured && !planningNext && target !== inForce?.target && <p className="r-small" style={{ marginTop: 8 }}>This week keeps its target. The new one starts next Monday.</p>}
      </div>

      <div>
        <h2 id="move-label" className="j-h14">What should move?</h2>
        <p className="r-small" style={{ margin: "3px 0 10px" }}>One or two is plenty.</p>
        {groups === undefined ? <Skeleton label="Loading your ready steps…"><div className="j-projs" aria-hidden="true">{[0, 1, 2].map(n => <Bone key={n} h={84} shape="block" i={n} />)}</div></Skeleton>
          : groups.length === 0 ? <p className="j-empty-box">Nothing is ready yet. Add a task in Work and it can be lined up here.</p>
            : <div className="j-projs" role="group" aria-labelledby="move-label">{groups.map(group => {
              const on = shownGroups.includes(group);
              return <button key={group.key} type="button" className="j-proj" aria-pressed={on} onClick={() => toggleGroup(group, on)}>
                <span className="r-dot" style={{ ...dotStyle(group.lane), width: 9, height: 9 }} aria-hidden="true" />
                <span><span className="j-proj-name">{group.name}</span><span className="j-proj-sub">{plural(group.tasks.length, "ready step")}</span></span>
              </button>;
            })}</div>}
      </div>

      <div>
        <div className="r-row r-between" style={{ gap: 10, alignItems: "baseline" }}><h2 id="steps-label" className="j-h14">Line up a few steps</h2><span className="j-mono-12">{lined.length} · ~{(minutes / 60).toFixed(1).replace(".0", "")}h</span></div>
        <p className="r-small" style={{ margin: "3px 0 10px" }}>Today offers these first whenever they fit your time and energy.</p>
        {groups !== undefined && shownGroups.length === 0 && <p className="j-empty-box">Choose a project above to see its ready steps.</p>}
        <ul className="j-steps-list" aria-labelledby="steps-label">{shownGroups.flatMap(group => group.tasks.map(task => {
          const on = picked.includes(String(task._id));
          const full = !on && picked.length >= maxLinedUp;
          return <li key={task._id}><button type="button" role="checkbox" aria-checked={on} disabled={full} className="j-pick" onClick={() => setPicked(on ? picked.filter(id => id !== String(task._id)) : [...picked, String(task._id)])}>
            <span className="j-box" aria-hidden="true">{on ? "✓" : ""}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="j-pick-title">{task.title}</span>
              <span className="j-pick-meta"><span className="r-dot" style={{ ...dotStyle(task.lane), width: 6, height: 6 }} aria-hidden="true" />{group.name} · {task.minutes} min{task.status === "In progress" ? " · in progress" : ""}</span>
            </span>
          </button></li>;
        }))}</ul>
        {picked.length >= maxLinedUp && <p className="r-small" style={{ marginTop: 8 }}>Twelve steps is the most a week can line up.</p>}
      </div>

      <label className="j-intention">One intention <span className="r-small">What would make {planningNext ? "next" : "this"} week feel worth it?</span>
        <input className="r-input" value={intention} maxLength={120} onChange={event => setIntention(event.target.value)} placeholder="e.g. Finish milestone 2 and share the loader" />
      </label>
      <button type="button" className="r-btn mint" onClick={() => go(2)}>See my week →</button>
    </div>}

    {step === 2 && <div key="week" className="j-rev">
      <h1 id="review-title" tabIndex={-1} className="r-title" style={{ marginTop: 0 }}>Your week <em className="mint">ahead.</em></h1>
      <section className="j-week-card" aria-label="Your plan">
        <div className="r-eyebrow mint">{weekLabel(planWeek)}</div>
        <p className="j-week-intention" style={{ color: intention.trim() ? "var(--r-ink)" : "var(--r-muted)" }}>{intention.trim() || "No intention set. That’s fine too."}</p>
        {paused && <div className="j-pause-note">A planned pause. Your streak waits for you.</div>}
        <div className="r-row" style={{ gap: 12, marginTop: 18 }}>
          <div className="j-target-dots" aria-hidden="true">{dayLetters.map((letter, index) => <span key={index} className={!paused && index < target ? "on" : ""}>{letter}</span>)}</div>
          <span className="j-13">{paused ? "A rest week, nothing to meet" : `${target} evenings, any you like`}</span>
        </div>
        <div className="j-week-rule" />
        {lined.length === 0 ? <p className="j-13" style={{ padding: "10px 0", color: "var(--r-muted)" }}>Nothing lined up. Today will choose fresh each evening.</p>
          : <ul className="j-lined" aria-label="Lined-up steps">{lined.map(task => <li key={task._id}>
            <span className="r-dot" style={dotStyle(task.lane)} aria-hidden="true" />
            <span className="j-lined-title">{task.title}</span>
            <span className="j-mono-12" style={{ color: "var(--r-muted)" }}>{task.minutes}m</span>
          </li>)}</ul>}
        <p className="j-bloom-note" style={{ textAlign: "left", marginTop: 12 }}>Lined-up steps come first in Today when they fit. You can always choose something else.</p>
      </section>
      <button type="button" className="r-btn mint" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save my week"}</button>
    </div>}
  </>;
}

function LookBack({ rhythm, week, lookWeek, learning, onLearning, busy, onNext }: {
  rhythm: Rhythm; week: WeekSummary; lookWeek: string; learning: string; onLearning: (value: string) => void; busy: boolean; onNext: () => void;
}) {
  const range = weekRange(lookWeek, rhythm.timezone);
  const bloom = useQuery(api.journey.bloom, { since: range.start, until: range.end });
  const pipeline = useQuery(api.proof.pipeline);
  const sessions = rhythm.sessions.filter(session => session.endedAt >= range.start && session.endedAt < range.end);
  const result = rhythm.weeks.find(item => item.week === lookWeek);
  const count = sessions.length;
  const target = lookWeek === rhythm.currentWeek ? week.target : result?.target ?? null;
  const timed = sessions.flatMap(session => {
    if (session.startedAt === null) return [];
    const minutes = minutesBetween(session.startedAt, session.endedAt);
    return minutes <= maxTimedMinutes ? [minutes] : [];
  });
  const growth = bloom?.petals.reduce((sum, petal) => sum + petal.sessions, 0);
  const which = lookWeek === rhythm.currentWeek ? "this week" : "last week";
  const ready = pipeline?.next?.status === "Ready to share" ? pipeline.next.title : null;

  return <div key="look" className="j-rev">
    <div>
      <div className="r-eyebrow mint">{weekLabel(lookWeek)}</div>
      <h1 id="review-title" tabIndex={-1} className="r-title">A week, looked <em className="mint">back</em> on.</h1>
    </div>
    <dl className="j-stats">
      <div><dd>{target ? `${count}/${target}` : count}</dd><dt>{target ? "sessions of your target" : count === 1 ? "session" : "sessions"}</dt></div>
      <div><dd>{timed.length ? timed.reduce((sum, value) => sum + value, 0) : "–"}</dd><dt>{timed.length ? `minutes${timed.length < count ? " timed" : ""}` : "minutes · none timed"}</dt></div>
      <div><dd>{growth === undefined ? "…" : `+${growth}`}</dd><dt>petal growth</dt></div>
    </dl>
    <p className="j-14">{laneStory(sessions.map(session => session.lane), which)}{ready ? ` “${ready}” is ready to share.` : ""}</p>
    <label className="r-field">What did {which} teach you?
      <textarea className="r-textarea" rows={3} maxLength={2000} value={learning} onChange={event => onLearning(event.target.value)} placeholder="One honest sentence is plenty." />
    </label>
    <button type="button" className="r-btn mint" disabled={busy} onClick={onNext}>{busy ? "Saving…" : "Next: plan the week →"}</button>
  </div>;
}

/** "Showcases got most of your attention. Writing got one session." from the week's lanes. */
export function laneStory(sessionLanes: Lane[], which: string) {
  if (!sessionLanes.length) return `No sessions saved ${which}. A quiet week is information, not a verdict.`;
  const counts = (["Projects", "Showcases", "Writing"] as Lane[]).map(lane => ({ lane, count: sessionLanes.filter(item => item === lane).length })).filter(item => item.count).sort((a, b) => b.count - a.count);
  if (counts.length === 1) return `Every session ${which} was ${counts[0].lane}.`;
  const lines = [counts[0].count > counts[1].count ? `${counts[0].lane} got most of your attention.` : `${counts.filter(item => item.count === counts[0].count).map(item => item.lane).join(" and ")} shared your attention.`];
  for (const item of counts.slice(1)) if (item.count === 1 && item.count < counts[0].count) lines.push(`${item.lane} got one session.`);
  return lines.join(" ");
}

/** Open steps you could start (nothing unfinished before them), grouped by project, or by lane when they have none. */
function groupTasks(tasks: Task[] | undefined, projects: FunctionReturnType<typeof api.projects.options> | undefined): Group[] | undefined {
  if (tasks === undefined || projects === undefined) return undefined;
  const names = new Map(projects.map(project => [String(project._id), project.title]));
  const groups: Group[] = [];
  for (const task of tasks) {
    // Done or archived prerequisites no longer block, as on the server.
    if (task.prerequisites.some(item => item.status !== "Done" && item.status !== "Archived")) continue;
    const project = task.projectId ? names.get(String(task.projectId as Id<"projects">)) : undefined;
    const key = project ? String(task.projectId) : `lane:${task.lane}`;
    const group = groups.find(item => item.key === key);
    if (group) group.tasks.push(task);
    else groups.push({ key, name: project ?? `${task.lane} · no project`, lane: task.lane, tasks: [task] });
  }
  return groups;
}

export function ReviewSkeleton() {
  return <Skeleton label="Opening your weekly review…" className="j-rev">
    <div className="skel-full" aria-hidden="true"><Bone w={190} h={11} /><Bone w="70%" h={46} i={1} className="bone-title" /></div>
    <div className="j-stats" aria-hidden="true">{[0, 1, 2].map(n => <Bone key={n} h={72} shape="block" i={n + 2} />)}</div>
    <Bone h={96} shape="block" i={5} />
    <Bone h={56} shape="pill" i={6} />
  </Skeleton>;
}
