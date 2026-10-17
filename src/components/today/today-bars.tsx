"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WeekSummary } from "@/components/ritual/week";
import { StatusControl } from "@/components/tasks/status-control";
import { useFocus } from "@/components/focus/focus-layer";

// Where things stand, below the tiles (PLAN-one-tap-and-daily-loop, Phase 3, in the owner's
// "Today · A" design, 15 October): one card that turns through up to three slides, "On it
// now", "Last time" and "This week", every 6 seconds. Each tab's bar fills as it waits;
// pointing at the card or focusing inside it holds it, and a tab picks a slide. With
// reduced motion it never turns by itself. Data: today.home and the week summary.

type Home = FunctionReturnType<typeof api.today.home>;
type LastTime = NonNullable<Home["lastTime"]>;
type Group = LastTime["groups"][number];

const short = (title: string, max = 38) => `“${title.length > max ? `${title.slice(0, max - 1)}…` : title}”`;
const ms = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

/** The day Last time covers: { long: "Monday", short: "Mon" }, "Today so far", "Yesterday", or "12 Oct". */
export function dayLabel(day: string, today: string) {
  const days = Math.round((ms(today) - ms(day)) / 86_400_000);
  if (days <= 0) return { long: "Today so far", short: "Today" };
  if (days === 1) return { long: "Yesterday", short: "Yesterday" };
  const date = new Date(ms(day));
  if (days < 7) return { long: date.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }), short: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) };
  const dated = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return { long: dated, short: dated };
}

/** One person's moves as a phrase: "You finished “R1” and started “R2”.", "Claude Code finished “R3” and 6 more." */
export function groupLine(group: Group) {
  const who = group.by === "you" ? "You" : group.by;
  const verbs: [string, { title: string }[]][] = [["finished", group.finished], ["started", group.started], ["blocked", group.blocked], ["worked on", group.logged]];
  const parts = verbs.filter(([, items]) => items.length).map(([verb, items]) =>
    items.length <= 2 ? `${verb} ${items.map(item => short(item.title)).join(" and ")}` : `${verb} ${short(items[0].title)} and ${items.length - 1} more`);
  if (!parts.length) return "";
  return `${who} ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`;
}

type Slide = { id: string; tab: string; body: ReactNode };

export function WhereThingsStand({ home, week, today, evening, onOpenTask, onCloseDay }: { home: Home | undefined; week: WeekSummary; today: string | null; evening: boolean; onOpenTask: (id: Id<"tasks">) => void; onCloseDay: () => void }) {
  const focus = useFocus();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [round, setRound] = useState(0);
  const [still, setStill] = useState(false);

  const slides: Slide[] = [];
  // Phase 5: after 8 pm, once something moved and the day isn't closed yet, it leads with the close.
  if (evening && home?.lastTime?.isToday && !home.closedToday) slides.push({
    id: "close", tab: "Tonight",
    body: <>
      <span className="t-car-txt"><b>Close the day ·</b> what moved, and one line for tomorrow.</span>
      <button type="button" className="t-car-focus" onClick={onCloseDay}>Close the day</button>
    </>,
  });
  const doing = home?.onItNow[0];
  if (doing) {
    const more = (home?.onItNow.length ?? 1) - 1 + (home?.moreInProgress ?? 0);
    slides.push({
      id: "now", tab: "On it now",
      body: <>
        <span className="t-car-what">
          <StatusControl task={{ _id: doing.taskId, title: doing.title, status: doing.status }} />
          <button type="button" className="t-car-tt" onClick={() => onOpenTask(doing.taskId)}>{doing.title}</button>
          <span className="t-car-meta">{[doing.project?.title, doing.code, more > 0 ? `+${more} more` : null].filter(Boolean).join(" · ")}</span>
        </span>
        <button type="button" className="t-car-focus" onClick={() => void focus.start({ _id: doing.taskId, title: doing.title })} aria-label={`Focus on ${doing.title}`}>{focus.active?.taskId === doing.taskId ? "◉ Focusing" : "▶ Focus"}</button>
      </>,
    });
  }
  const last = home?.lastTime;
  const lines = last ? last.groups.map(groupLine).filter(Boolean) : [];
  // The day after a close, Last time starts with your own words, until something moves today.
  const night = home?.lastNight && today && !last?.isToday ? home.lastNight : null;
  if (night && today) {
    const day = dayLabel(night.day, today);
    const when = day.long === "Yesterday" ? "Last night" : `${day.long} night`;
    const task = night.task && (night.task.status === "Ready" || night.task.status === "In progress") ? night.task : null;
    slides.push({
      id: "last", tab: when,
      body: <>
        <span className="t-car-txt" title={night.tomorrow}><b>{when} you said ·</b> “{night.tomorrow}”</span>
        {task
          ? <button type="button" className="t-car-focus" onClick={() => void focus.start({ _id: task.id, title: task.title })} aria-label={`Start ${task.title}`}>▶ Start</button>
          : last?.pickUp && <button type="button" className="t-car-pick" onClick={() => onOpenTask(last.pickUp!.taskId)} aria-label={`Pick up ${last.pickUp.title}`}>Pick up →</button>}
      </>,
    });
  } else if (last && today && (lines.length || last.pickUp)) {
    const day = dayLabel(last.day, today);
    const text = lines.length ? lines.join(" ") : `You left off: ${last.pickUp!.nextStep}`;
    slides.push({
      id: "last", tab: `Last time · ${day.short}`,
      body: <>
        <span className="t-car-txt" title={text}><b>{day.long} ·</b> {text}</span>
        {last.pickUp && <button type="button" className="t-car-pick" onClick={() => onOpenTask(last.pickUp!.taskId)} aria-label={`Pick up ${last.pickUp.title}: ${last.pickUp.nextStep}`}>Pick up →</button>}
      </>,
    });
  }
  const weekText = week.configured && week.target && !week.paused && week.count < week.target
    ? <><b>{week.count} of {week.target}</b> evenings · {week.line}</> : <>{week.line}</>;
  slides.push({
    id: "week", tab: "This week",
    body: <>
      <span className="t-car-what">
        <span className="t-hexes" aria-hidden="true">{week.days.map((day, i) => {
          const lane = day.count > 0 && day.lane ? day.lane[0] : "";
          return <span key={i} className={`t-hex${lane ? ` ${lane}` : day.today ? " today" : ""}`} title={day.name}><span className="t-hexl">{lane}</span></span>;
        })}</span>
        <span className="t-car-txt">{weekText}</span>
      </span>
      <Link className="t-car-pick" href="/journey">Journey →</Link>
    </>,
  });

  const count = slides.length;
  const current = Math.min(index, count - 1);

  // Reduced motion: no turning by itself.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (held || still || count < 2) return;
    const timer = window.setTimeout(() => setIndex(i => (Math.min(i, count - 1) + 1) % count), 6000);
    return () => window.clearTimeout(timer);
  }, [held, still, count, current, round]);

  const pick = (i: number) => { setIndex(i); setRound(r => r + 1); };
  // Letting go starts the wait again, so the bar and the turn stay together.
  const release = () => { setHeld(false); setRound(r => r + 1); };
  const slot = (i: number) => (i === current ? "on" : i === (current + count - 1) % count && count > 1 ? "gone" : "");

  return <section className={`t-car${held ? " held" : ""}${still ? " still" : ""}`} aria-roledescription="carousel" aria-label="Where things stand"
    onMouseEnter={() => setHeld(true)} onMouseLeave={release}
    onFocus={() => setHeld(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) release(); }}>
    <div className="t-car-tabs" role="tablist" aria-label="Where things stand">
      {slides.map((slide, i) => <button key={`${slide.id}-${i === current ? round : "x"}`} type="button" role="tab" id={`car-tab-${slide.id}`} aria-controls={`car-${slide.id}`} aria-selected={i === current}
        className={`t-car-tab${i === current ? " on" : ""}`} onClick={() => pick(i)}>
        <span className="t-car-k">{slide.tab}</span><span className="t-car-prog"><span /></span>
      </button>)}
    </div>
    <div className="t-car-slides">
      {slides.map((slide, i) => <div key={slide.id} id={`car-${slide.id}`} role="tabpanel" aria-labelledby={`car-tab-${slide.id}`}
        className={`t-car-slide ${slot(i)}`} aria-hidden={i !== current} inert={i !== current}>
        {slide.body}
      </div>)}
    </div>
  </section>;
}
