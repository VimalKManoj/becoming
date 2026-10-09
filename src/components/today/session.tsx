"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { bloomSkillList } from "../../../convex/lib/bloom";
import { zonedStartOfDay } from "../../../convex/lib/time";
import { FocusGauge, MindBloom } from "@/components/visuals";
import { WeekDots, type WeekSummary } from "@/components/ritual/week";
import { useRitual } from "@/components/ritual/ritual-context";
import { useModal } from "@/components/ritual/use-modal";
import { readableError } from "@/lib/errors";
import { useNow, type Rhythm } from "@/lib/use-rhythm";

// The evening's three full-screen moments (design 1b, 1c and the reward): the focus orb,
// the outcome-first recap, and "That counts." with the bloom growing.

type Overview = FunctionReturnType<typeof api.tasks.todayOverview>;
export type Active = NonNullable<Overview["active"]>;
type Outcome = "Finished" | "Made progress" | "Blocked";
export type Saved = { title: string; lane: string; taskTitle: string; skills: string[]; evidence: boolean };

const quotes = ["Small, finished things compound.", "You chose this. That already counts.", "Stuck is information. Note it and keep going.", "Fifteen honest minutes beat an hour of tabs.", "Make it work, then make it lovely.", "Leave a breadcrumb for tomorrow-you."];
const lofi = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function useElapsed(startedAt: number) {
  const now = useNow(1000);
  return now === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function FocusOverlay({ active, quotesOn, musicOn, onFinish }: { active: Active; quotesOn: boolean; musicOn: boolean; onFinish: () => void }) {
  const { showToast } = useRitual();
  const cancel = useMutation(api.tasks.cancelSession);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const seconds = useElapsed(active.startedAt);
  const planned = Math.max(1, active.minutes) * 60;
  const over = Math.floor(seconds / 60) - active.minutes;
  const dialog = useModal<HTMLDivElement>();

  async function stop() {
    setBusy(true);
    try { await cancel({ activeSessionId: active._id }); showToast("Session cancelled. Nothing was recorded."); }
    catch (caught) { showToast(readableError(caught, "Could not cancel the session. Please try again."), "alert"); }
    finally { setBusy(false); }
  }

  // The player never plays by itself: pressing play opens the stream in a new tab.
  function play() {
    if (!playing) window.open(lofi, "_blank", "noopener,noreferrer");
    setPlaying(!playing);
  }

  return <div ref={dialog} className="r-overlay focus" role="dialog" aria-modal="true" aria-labelledby="focus-title">
    <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <span className="t-focusing"><span className="t-pulse" aria-hidden="true" />Focusing · saved as your active session</span>
      <div style={{ textAlign: "center" }}>
        <div className="r-small" style={{ fontWeight: 500, fontSize: 12 }}>{active.lane} · {active.smaller ? `Smaller step of “${active.taskTitle}”` : active.taskTitle}</div>
        <h1 id="focus-title" style={{ font: "400 clamp(26px,4cqi,36px)/1.08 var(--r-serif)", marginTop: 6, maxWidth: 560, textWrap: "balance" }}>{active.title}</h1>
      </div>
      <div style={{ width: "100%", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "20px 56px" }}>
        <div style={{ flex: "0 1 360px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="t-orb">
            <span className="t-orb-halo" aria-hidden="true" />
            <div style={{ position: "relative", width: "100%", height: "100%" }}><FocusGauge fraction={seconds / planned} /></div>
            <div className="t-orb-centre">
              <div className="t-timer" aria-hidden="true">{clock(seconds)}</div>
              <div className="r-mono" style={{ font: "400 12px var(--r-mono)", color: "var(--r-muted)", letterSpacing: ".06em" }}>OF {active.minutes} MIN</div>
            </div>
          </div>
          <p className="sr-only" aria-live="off">{Math.floor(seconds / 60)} of {active.minutes} minutes</p>
          {quotesOn && <div style={{ minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
            <p key={Math.floor(seconds / 30)} className="t-quote" aria-hidden="true">“{quotes[Math.floor(seconds / 30) % quotes.length]}”</p>
          </div>}
          {over > 0 && <p className="r-small" style={{ textAlign: "center" }}>{over} min past your plan. Stop whenever the step is done.</p>}
        </div>
        <div style={{ flex: "1 1 320px", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="r-dashed" style={{ padding: "14px 16px", borderRadius: 20 }}><div className="r-eyebrow-sm">Your stopping point</div><div className="r-body" style={{ marginTop: 5 }}>{active.doneWhen}</div></div>
          {active.nextStep && !active.smaller && <div className="r-inset"><div className="r-eyebrow-sm">Pick up here</div><div className="r-body" style={{ marginTop: 4 }}>{active.nextStep}</div></div>}
          {musicOn && <div className="t-music">
            <button type="button" className="t-play" aria-pressed={playing} aria-label={playing ? "Mark the music as stopped" : "Play lo-fi in a new tab"} onClick={play}>{playing ? "❚❚" : "▶"}</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "500 14px var(--r-sans)" }}>Lo-fi for deep work</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span className={`t-eq${playing ? " on" : ""}`} aria-hidden="true">{[0.5, 0.8, 0.62, 0.9, 0.55].map(duration => <span key={duration} style={{ animationDuration: `${duration}s` }} />)}</span>
                <span className="r-small" style={{ fontSize: 12 }}>{playing ? "Playing in a new tab" : "Optional · off"}</span>
              </div>
            </div>
            <a href={lofi} target="_blank" rel="noopener noreferrer" className="r-ghost xs" style={{ height: 36, background: "transparent", color: "var(--r-ink-2)" }} aria-label="Open lo-fi stream (opens in a new tab)">Open ↗</a>
          </div>}
          <button type="button" className="r-btn lg" style={{ marginTop: 6 }} disabled={busy} onClick={onFinish}>Finish &amp; reflect</button>
          <div className="r-small" style={{ textAlign: "center" }}><button type="button" className="r-underline" disabled={busy} onClick={() => void stop()}>Cancel session</button> · records nothing</div>
        </div>
      </div>
    </div>
  </div>;
}

const outcomes: { key: Outcome; cls: string; glyph: string; desc: string }[] = [
  { key: "Finished", cls: "finished", glyph: "✓", desc: "Done condition met" },
  { key: "Made progress", cls: "progress", glyph: "◐", desc: "Saves a next step" },
  { key: "Blocked", cls: "blocked", glyph: "■", desc: "Needs an unblock" },
];

// The recap survives "Back to session" and a reload: a draft per active session, in this tab only.
type Draft = { outcome?: Outcome; skills?: string[]; contribution?: string; nextStep?: string; evidence?: string };
const draftKey = (id: string) => `becoming.recap.${id}`;
function readDraft(id: string): Draft {
  try { return JSON.parse(sessionStorage.getItem(draftKey(id)) ?? "{}") as Draft; } catch { return {}; }
}
function writeDraft(id: string, draft: Draft | null) {
  try { if (draft) sessionStorage.setItem(draftKey(id), JSON.stringify(draft)); else sessionStorage.removeItem(draftKey(id)); } catch { /* Optional. */ }
}

export function RecapOverlay({ active, onBack, onSaved }: { active: Active; onBack: () => void; onSaved: (saved: Saved) => void }) {
  const record = useMutation(api.tasks.recordSession);
  const [draft] = useState(() => readDraft(active._id));
  const [outcome, setOutcome] = useState<Outcome>(draft.outcome ?? "Made progress");
  const [skills, setSkills] = useState<string[]>(draft.skills ?? []);
  const dialog = useModal<HTMLDivElement>(onBack);
  const keep = (next: Draft) => writeDraft(active._id, { ...readDraft(active._id), ...next });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const seconds = useElapsed(active.startedAt);
  // A finished smaller step leaves its parent task in progress, so it needs a next step too.
  const needsNext = outcome !== "Finished" || active.smaller;
  const field = outcome === "Blocked" ? { label: "What's blocking it · and how to unblock", placeholder: "The mutation returns no error code. Ask in #backend." }
    : outcome === "Made progress" ? { label: "Next step · shown when you resume", placeholder: "Tighten the toast copy, then test offline." }
      : active.smaller ? { label: `Next step for ${active.taskTitle}`, placeholder: "What the full task needs next." }
        : { label: "Anything to follow up? · optional", placeholder: "Maybe a showcase clip of it." };

  function toggle(name: string) {
    const next = skills.includes(name) ? skills.filter(item => item !== name) : skills.length >= 5 ? skills : [...skills, name];
    setSkills(next);
    keep({ skills: next });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) || "").trim();
    setBusy(true); setFailure("");
    try {
      await record({ activeSessionId: active._id, outcome, contribution: text("contribution"), nextStep: text("nextStep"), evidence: text("evidence"), ...(skills.length ? { skills } : {}) });
      writeDraft(active._id, null);
      onSaved({ title: active.title, lane: active.lane, taskTitle: active.taskTitle, skills, evidence: Boolean(text("evidence")) });
    } catch (caught) { setFailure(readableError(caught, "Not saved. Your recap is still here, nothing was lost.")); }
    finally { setBusy(false); }
  }

  return <div ref={dialog} className="r-overlay recap" role="dialog" aria-modal="true" aria-labelledby="recap-title">
    <form className="r-col r-rise-6" style={{ gap: 16 }} onSubmit={save} aria-busy={busy}
      onChange={event => { const field = event.target as unknown as HTMLInputElement; if (["contribution", "nextStep", "evidence"].includes(field.name)) keep({ [field.name]: field.value }); }}>
      <button type="button" className="r-back" style={{ height: 34, padding: "0 12px", fontSize: 12.5 }} onClick={onBack}>‹ Back to session</button>
      <div>
        <div className="r-date" style={{ letterSpacing: ".06em" }}>{clock(seconds)} · {active.lane.toUpperCase()} · {active.taskTitle.toUpperCase()}</div>
        <h1 id="recap-title" style={{ font: "400 clamp(36px,6cqi,48px)/1 var(--r-serif)", marginTop: 8 }}>How did it go?</h1>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} disabled={busy}>
        <legend className="sr-only">Outcome</legend>
        <div className="t-outcomes">{outcomes.map(item => <label key={item.key} className={`t-outcome ${item.cls}`}>
          <input type="radio" name="outcome" value={item.key} checked={outcome === item.key} onChange={() => { setOutcome(item.key); keep({ outcome: item.key }); }} />
          <span className="t-glyph" aria-hidden="true">{item.glyph}</span><span className="t-outcome-key">{item.key}</span><span className="t-outcome-desc">{item.desc}</span>
        </label>)}</div>
      </fieldset>
      <label className="r-field">What changed<textarea name="contribution" className="r-textarea" rows={2} defaultValue={draft.contribution} required maxLength={4000} placeholder="Retry keeps the draft. Added a “Not saved yet” label." /></label>
      <label className="r-field">{field.label}<input name="nextStep" defaultValue={draft.nextStep} className="r-input" style={{ height: 48, fontSize: 14, ...(outcome === "Blocked" ? { borderColor: "rgba(255,107,91,.45)" } : {}) }} required={needsNext} maxLength={2000} placeholder={field.placeholder} /></label>
      <div role="group" aria-labelledby="skills-label">
        <div id="skills-label" className="r-label" style={{ marginBottom: 8 }}>Skills you practised <span style={{ color: "var(--r-muted)", fontWeight: 400 }}>· each one grows your Mind Bloom</span></div>
        <div className="r-row" style={{ gap: 6 }}>{bloomSkillList.map(skill => <button key={skill.name} type="button" className="r-chip round h34" style={{ padding: "0 13px", fontSize: 12.5 }} aria-pressed={skills.includes(skill.name)} onClick={() => toggle(skill.name)}>{skill.name}</button>)}</div>
      </div>
      <label className="r-field">Evidence link <span style={{ color: "var(--r-muted)", fontWeight: 400 }}>· optional, becomes a draft in Proof</span><input name="evidence" defaultValue={draft.evidence} type="url" className="r-input mono" style={{ height: 48 }} placeholder="https://…" maxLength={2000} /></label>
      {failure && <div className="t-failed" role="alert"><span className="t-bang" aria-hidden="true">!</span><span><b>Not saved.</b> {failure.startsWith("Not saved") ? "Your recap is still here, nothing was lost." : `${failure} Your recap is still here.`}</span></div>}
      <button type="submit" className="r-btn lg" style={{ marginTop: 4 }} disabled={busy}>{busy ? "Saving…" : failure ? "Retry save" : "Save recap"}</button>
    </form>
  </div>;
}

export function RewardOverlay({ saved, rhythm, week, onDone, onProof }: { saved: Saved; rhythm: Rhythm; week: WeekSummary; onDone: () => void; onProof: () => void }) {
  const since = zonedStartOfDay(`${rhythm.today.slice(0, 8)}01`, rhythm.timezone);
  const bloom = useQuery(api.journey.bloom, { since });
  const month = new Date(`${rhythm.today}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const dialog = useModal<HTMLDivElement>();
  return <div ref={dialog} className="r-overlay reward" role="dialog" aria-modal="true" aria-labelledby="reward-title">
    <div className="t-reward">
      <div className="r-eyebrow ember" style={{ letterSpacing: ".14em", animation: "r-rise .6s both" }}>Saved to your Journey</div>
      <h1 id="reward-title" className="t-reward-title" style={{ animation: "r-rise .6s .1s both" }}>That <em style={{ color: "var(--r-ember-text)" }}>counts.</em></h1>
      <div style={{ padding: "6px 0", width: "min(340px,80vw)" }}>
        {bloom && <MindBloom petals={bloom.petals} mode="reward" grown={saved.skills} size={340}
          label={`Mind Bloom for ${month}: ${bloom.petals.filter(petal => petal.sessions).map(petal => `${petal.name} ${petal.sessions}`).join(", ") || "no skills tagged yet"}`} />}
      </div>
      {saved.skills.length > 0 && <div className="t-gained" style={{ animation: "r-rise .6s 1.2s both" }}>{saved.skills.map(name => `+1 ${name}`).join("  ·  ")}</div>}
      <div style={{ animation: "r-rise .6s 1.4s both" }}><WeekDots days={week.days} size={34} /></div>
      <p className="r-body" style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 380, animation: "r-rise .6s 1.5s both" }}>{week.line}</p>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, animation: "r-rise .6s 1.7s both" }}>
        <button type="button" className="r-btn" onClick={onDone}>Done for tonight</button>
        <button type="button" className="r-ghost" onClick={onProof}>{saved.evidence ? "See it in Proof" : "Open Proof"}</button>
      </div>
    </div>
  </div>;
}
