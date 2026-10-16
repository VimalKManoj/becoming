"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRitual } from "@/components/ritual/ritual-context";
import { useModal } from "@/components/ritual/use-modal";
import { useWeek } from "@/components/ritual/week";
import { FocusOverlay, RecapOverlay, RewardOverlay, clock, elapsedSeconds, type Active, type Saved } from "@/components/today/session";
import { readableError } from "@/lib/errors";
import { useNow } from "@/lib/use-rhythm";

// Focus as a tool (PLAN-one-tap-and-daily-loop, Phase 4). The workspace shell renders this
// once, so a session follows you around the app: a chip in the corner (the task, the time,
// Pause, Stop, and a tap to open the full focus view), the recap and the reward. Any ▶ Focus
// starts at once through \`useFocus().start\`; with a session already running on another
// task it asks first. When the planned time is reached: a soft chime (a setting), a
// notification if allowed, and the chip glows. Nothing stops the timer by itself.

type Target = { _id: Id<"tasks">; title: string };
type StartOptions = { smaller?: boolean; recommended?: boolean; minutes?: number; expand?: boolean };
type FocusValue = {
  active: Active | null | undefined;
  start: (task: Target, options?: StartOptions) => Promise<void>;
  openRecap: () => void;
  expand: () => void;
  /** Goes up each time "Done for tonight" is pressed, so Today can show "Tonight is done". */
  doneTick: number;
};

const FocusContext = createContext<FocusValue | null>(null);
/** Today's "Tonight is done" marker, shared with the reward's "Done for tonight". */
export const tonightDoneKey = "becoming.today.done";

export function useFocus(): FocusValue {
  return useContext(FocusContext) ?? { active: null, start: async () => {}, openRecap: () => {}, expand: () => {}, doneTick: 0 };
}

export function FocusProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const router = useRouter();
  const { showToast } = useRitual();
  const active = useQuery(api.focus.active, enabled ? {} : "skip");
  const profile = useQuery(api.settings.getProfile, enabled ? {} : "skip");
  const startSession = useMutation(api.tasks.startSession);
  const [view, setView] = useState<"chip" | "expanded" | "recap">("chip");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [asking, setAsking] = useState<{ task: Target; options: StartOptions } | null>(null);
  const [pending, setPending] = useState<{ task: Target; options: StartOptions } | null>(null);
  const [doneTick, setDoneTick] = useState(0);
  // The latest running session, for callbacks that shouldn't change identity every tick.
  const current = useRef<Active | null | undefined>(active);
  useEffect(() => { current.current = active; }, [active]);

  const begin = useCallback(async (task: Target, options: StartOptions, replace = false) => {
    try {
      await startSession({ taskId: task._id, ...(options.smaller ? { smaller: true } : {}), ...(options.recommended !== undefined ? { recommended: options.recommended } : {}), ...(options.minutes ? { minutes: options.minutes } : {}), ...(replace ? { replace: true } : {}) });
      setView(options.expand ? "expanded" : "chip");
      if (!options.expand) showToast(`Focusing on “${task.title.length > 40 ? `${task.title.slice(0, 39)}…` : task.title}”. The timer is in the corner.`);
    } catch (caught) { showToast(readableError(caught, "Could not start the session. Please try again."), "alert"); }
  }, [startSession, showToast]);

  const start = useCallback(async (task: Target, options: StartOptions = {}) => {
    const running = current.current;
    if (running && running.taskId !== task._id) { setAsking({ task, options }); return; }
    if (running) { setView(options.expand ? "expanded" : view); if (!options.expand) showToast("You're already focusing on this one."); return; }
    await begin(task, options);
  }, [begin, showToast, view]);

  const value = useMemo<FocusValue>(() => ({
    active, start, doneTick,
    openRecap: () => setView("recap"),
    expand: () => setView("expanded"),
  }), [active, start, doneTick]);

  const startAnother = () => {
    setSaved(null);
    if (pending) { const next = pending; setPending(null); void begin(next.task, next.options); }
    else router.push("/today?focus=1");
  };

  return <FocusContext.Provider value={value}>
    {children}
    {active && <FocusTicker active={active} chime={profile?.focusChime ?? true} />}
    {active && view === "chip" && <FocusChip active={active} onExpand={() => setView("expanded")} onStop={() => setView("recap")} />}
    {active && view === "expanded" && <FocusOverlay active={active} quotesOn={profile?.focusQuotes ?? true} musicOn={profile?.focusMusic ?? true}
      onFinish={() => setView("recap")} onMinimise={() => setView("chip")} />}
    {active && view === "recap" && <RecapOverlay active={active} onBack={() => setView("chip")} onSaved={value => { setView("chip"); setSaved(value); }} />}
    {saved && <Reward saved={saved}
      anotherLabel={pending ? `Start “${pending.task.title.length > 28 ? `${pending.task.title.slice(0, 27)}…` : pending.task.title}”` : "Start another"}
      onAnother={startAnother}
      onProof={() => { setSaved(null); router.push("/journey?tab=proof"); }}
      onDone={today => {
        setSaved(null); setPending(null);
        try { sessionStorage.setItem(tonightDoneKey, today); } catch { /* Optional. */ }
        setDoneTick(tick => tick + 1);
        router.push("/today");
      }} />}
    {asking && active && <SwitchPrompt current={active} next={asking.task}
      onSaveFirst={() => { setPending(asking); setAsking(null); setView("recap"); }}
      onSwitch={() => { const next = asking; setAsking(null); void begin(next.task, next.options, true); }}
      onKeep={() => setAsking(null)} />}
  </FocusContext.Provider>;
}

/** "That counts.", with the week; loads the week only while it shows. */
function Reward({ saved, anotherLabel, onAnother, onProof, onDone }: { saved: Saved; anotherLabel: string; onAnother: () => void; onProof: () => void; onDone: (today: string) => void }) {
  const week = useWeek();
  if (!week) return null;
  return <RewardOverlay saved={saved} rhythm={week.rhythm} week={week.week} anotherLabel={anotherLabel} onAnother={onAnother} onProof={onProof} onDone={() => onDone(week.rhythm.today)} />;
}

/** The tab title, and the moment the planned time is reached. Renders nothing. */
function FocusTicker({ active, chime }: { active: Active; chime: boolean }) {
  const now = useNow(1000);
  const seconds = now === null ? 0 : elapsedSeconds(active, now);
  const over = seconds >= active.minutes * 60;
  const base = useRef<string | null>(null);

  useEffect(() => {
    if (now === null) return;
    // Next.js sets the page's own title on navigation; keep it as the base to restore.
    const ours = /^(⏸ )?\d+:\d{2} · /.test(document.title);
    if (!ours) base.current = document.title;
    document.title = `${active.pausedAt ? "⏸ " : ""}${clock(seconds)} · ${active.title}`;
  }, [now, seconds, active.pausedAt, active.title]);
  useEffect(() => () => { if (base.current) document.title = base.current; }, []);

  useEffect(() => {
    if (!over) return;
    const key = `becoming.focus.timeup.${active._id}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* Once per tab is fine. */ }
    if (chime) playChime();
    notify(`Time's up: ${active.minutes} min`, `“${active.title}”. Stop whenever the step is done.`, String(active._id));
  }, [over, chime, active._id, active.minutes, active.title]);
  return null;
}

/** A soft two-note chime, made in the browser; nothing to download. */
function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audio = new AudioCtx();
    const t = audio.currentTime;
    for (const [frequency, delay] of [[659.25, 0], [880, 0.22]]) {
      const tone = audio.createOscillator(), gain = audio.createGain();
      tone.type = "sine"; tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.4);
      tone.connect(gain).connect(audio.destination);
      tone.start(t + delay); tone.stop(t + delay + 1.5);
    }
    window.setTimeout(() => void audio.close(), 2200);
  } catch { /* Sound is a nicety. */ }
}

/** A notification only if they're already allowed (Settings → Reminder asks); never a prompt here. */
function notify(title: string, body: string, tag: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options = { body, tag, icon: "/pwa-icon" };
    if (navigator.serviceWorker?.controller) void navigator.serviceWorker.ready.then(registration => registration.showNotification(title, options));
    else new Notification(title, options);
  } catch { /* A notification is a nicety. */ }
}

function FocusChip({ active, onExpand, onStop }: { active: Active; onExpand: () => void; onStop: () => void }) {
  const { showToast } = useRitual();
  const pause = useMutation(api.focus.pause);
  const resume = useMutation(api.focus.resume);
  const now = useNow(1000);
  const seconds = now === null ? 0 : elapsedSeconds(active, now);
  const over = seconds >= active.minutes * 60;
  const paused = Boolean(active.pausedAt);
  const toggle = async () => {
    try { await (paused ? resume : pause)({ activeSessionId: active._id }); }
    catch (caught) { showToast(readableError(caught, paused ? "Could not resume." : "Could not pause."), "alert"); }
  };
  return <section className={`fc${over ? " over" : ""}${paused ? " paused" : ""}`} aria-label="Focus session">
    <button type="button" className="fc-main" onClick={onExpand} aria-label={`Open the focus view: ${active.title}, ${clock(seconds)} of ${active.minutes} minutes${paused ? ", paused" : ""}`}>
      <span className="fc-orb" aria-hidden="true" />
      <span className="fc-text">
        <span className="fc-title">{active.title}</span>
        <span className="fc-time">{paused ? "Paused · " : over ? "Time’s up · " : ""}{clock(seconds)}<span className="fc-of"> / {active.minutes} min</span></span>
      </span>
      <svg className="fc-expand" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
    </button>
    <button type="button" className="fc-btn" onClick={() => void toggle()} aria-label={paused ? "Resume" : "Pause"} title={paused ? "Resume" : "Pause"}>
      {paused
        ? <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 2.6v10.8c0 .6.6.9 1.1.6l8.4-5.4c.5-.3.5-.9 0-1.2L5.6 2c-.5-.3-1.1 0-1.1.6z" /></svg>
        : <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>}
    </button>
    <button type="button" className="fc-btn stop" onClick={onStop} aria-label="Stop and save the session" title="Stop and save">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /></svg>
    </button>
  </section>;
}

function SwitchPrompt({ current, next, onSaveFirst, onSwitch, onKeep }: { current: Active; next: Target; onSaveFirst: () => void; onSwitch: () => void; onKeep: () => void }) {
  const dialog = useModal<HTMLDivElement>(onKeep);
  const now = useNow(1000);
  const minutes = now === null ? 0 : Math.floor(elapsedSeconds(current, now) / 60);
  return <div ref={dialog} className="r-cap" role="dialog" aria-modal="true" aria-labelledby="fs-title">
    <div className="r-cap-back" onClick={onKeep} />
    <div className="r-cap-card fs">
      <h2 id="fs-title" className="fs-title">Switch to this <em>one?</em></h2>
      <p className="r-body">You’re {minutes ? `${minutes} min into` : "focusing on"} “{current.title}”. “{next.title}” would start now.</p>
      <div className="fs-actions">
        <button type="button" className="r-btn" onClick={onSaveFirst}>Save “{current.title.length > 24 ? `${current.title.slice(0, 23)}…` : current.title}” first</button>
        <button type="button" className="r-ghost" onClick={onSwitch}>Switch now <span className="r-small">· nothing recorded for the current one</span></button>
        <button type="button" className="r-underline fs-keep" onClick={onKeep}>Keep going</button>
      </div>
    </div>
  </div>;
}
