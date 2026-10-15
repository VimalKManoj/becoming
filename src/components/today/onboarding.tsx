"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { weekKey } from "../../../convex/lib/time";
import { useRitual } from "@/components/ritual/ritual-context";
import { Embers } from "@/components/ritual/embers";
import { radioKeys } from "@/components/ritual/radio-keys";
import { useModal } from "@/components/ritual/use-modal";
import { readableError } from "@/lib/errors";
import { ClaudeLoop } from "@/components/assistants/claude-loop";
import { Glyph } from "@/components/assistants/assistant-badge";

// First-time setup (Ritual design): what Becoming is, your motive, your rhythm, your
// assistant (connect Claude Code after setup, or not now), what's on your plate, and one
// first step small enough to start. Every answer is saved for real; "Skip setup" leaves
// everything as it is.

type Lane = "Projects" | "Showcases" | "Writing";
const motives = ["Ship things people can touch.", "Get a little better at my craft.", "Make one small thing better every week."];
const targets = [2, 3, 4, 5, 6];
// "A project" opens the New project page after setup (phases, milestones and tasks), so it
// asks for no first step here; the others make one small first task.
const firsts: { title: string; detail: string; lane: Lane | null; project?: boolean; example: { title: string; done: string; minutes: number } | null }[] = [
  { title: "A project", detail: "Something big, in steps", lane: null, project: true, example: null },
  { title: "A small piece", detail: "A component or showcase", lane: "Showcases", example: { title: "Finish the orbit loader showcase", done: "The loop is seamless and a 6s clip is exported.", minutes: 20 } },
  { title: "Some writing", detail: "A note or a post", lane: "Writing", example: { title: "Draft: what a recap form taught me", done: "400 rough words and one diagram idea.", minutes: 30 } },
  { title: "Just look around", detail: "Skip for now", lane: null, example: null },
];
const features = ["Check in: your time and energy. About 10 seconds.", "Focus on one thing, then say how it went.", "Watch your Mind Bloom fill in, skill by skill."];
const assistantChoices = [
  { yes: true, title: "Connect it after setup", detail: "About a minute: one command to copy." },
  { yes: false, title: "Not now", detail: "It waits on Today whenever you want it." },
];
const choiceStyle = { minHeight: 86, padding: 16, borderRadius: 20, flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: 8, color: "var(--r-ink)" } as const;

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { showToast, openConnect, openNewProject } = useRitual();
  const saveMotive = useMutation(api.settings.saveMotive);
  const setRhythm = useMutation(api.rhythm.setRhythm);
  const savePreferences = useMutation(api.settings.savePreferences);
  const createTask = useMutation(api.tasks.create);
  const complete = useMutation(api.settings.completeOnboarding);
  const [step, setStep] = useState(0);
  const [motive, setMotive] = useState(0);
  const [target, setTarget] = useState(1);
  const [remind, setRemind] = useState(true);
  const [first, setFirst] = useState(0);
  const [title, setTitle] = useState("");
  const [done, setDone] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [connectAfter, setConnectAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = firsts[first];
  const dialog = useModal<HTMLDivElement>();
  const last = pick.lane ? 5 : 4;

  async function finish(skip: boolean) {
    setBusy(true); setError("");
    try {
      if (!skip) {
        if (pick.lane && (!title.trim() || !done.trim())) { setError("Name the first step and when it's done."); setBusy(false); return; }
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await saveMotive({ motive: motives[motive] });
        await setRhythm({ timezone: zone, weeklyTarget: targets[target], currentWeek: weekKey(Date.now(), zone) });
        await savePreferences({ reminderOn: remind });
        if (pick.lane) await createTask({ title: title.trim(), lane: pick.lane, minutes, energy: 2, doneWhen: done.trim() });
      }
      await complete({});
      onClose();
      if (!skip) showToast(pick.lane ? "You're set. Tonight's first focus is ready." : pick.project ? "You're set. Now shape your project." : "You're set. Have a look around.");
      if (!skip && pick.project) openNewProject();
      if (!skip && connectAfter) openConnect();
    } catch (caught) { setError(readableError(caught, "Could not save your setup. Please try again.")); }
    finally { setBusy(false); }
  }

  function next() {
    if (step === 4 && pick.example && !title) setMinutes(pick.example.minutes);
    if (step >= last) void finish(false); else setStep(step + 1);
  }

  return <div ref={dialog} className="r-overlay setup" role="dialog" aria-modal="true" aria-labelledby="ob-title">
    <Embers />
    <div className="t-ob">
      <div className="r-row r-between" style={{ height: 36 }}>
        <div className="r-row" style={{ gap: 5 }} aria-label={`Step ${step + 1} of ${last + 1}`}>{Array.from({ length: last + 1 }, (_, i) => <span key={i} className={`t-ob-dot${i <= step ? " on" : ""}`} style={{ width: i === step ? 22 : 7 }} />)}</div>
        <button type="button" className="r-link" style={{ color: "var(--r-muted)" }} disabled={busy} onClick={() => void finish(true)}>Skip setup</button>
      </div>

      {step === 0 && <div className="r-stack r-rise-6" style={{ gap: 22, paddingTop: "clamp(10px,6cqi,48px)" }}>
        <span className="t-ob-orb" aria-hidden="true" />
        <h1 id="ob-title" style={{ font: "400 clamp(44px,9cqi,64px)/.98 var(--r-serif)" }}>A mind that <em style={{ color: "var(--r-ember-text)" }}>grows</em> one evening at a time.</h1>
        <p className="r-lede" style={{ fontSize: 15, lineHeight: 1.55, textWrap: "pretty" }}>Each evening you say how much you have. Becoming gives you one clear thing to do, then keeps proof of what you made.</p>
        <div className="r-stack" style={{ gap: 8 }}>
          {features.map((line, i) => <div key={line} className="t-ob-step"><span className="r-mono" style={{ font: "500 12px var(--r-mono)", color: "var(--r-ember-soft)" }}>0{i + 1}</span><span style={{ font: "400 14px var(--r-sans)" }}>{line}</span></div>)}
          <div className="t-ob-step t-ob-claude"><span className="r-mono" style={{ font: "500 12px var(--r-mono)", color: "var(--r-ember-soft)" }}>04</span><span style={{ font: "400 14px var(--r-sans)", flex: 1 }}>Build with Claude Code, and your work records itself here.</span><Glyph /></div>
        </div>
      </div>}

      {step === 1 && <div className="r-stack r-rise-6" style={{ gap: 18, paddingTop: "clamp(10px,4cqi,32px)" }}>
        <div className="r-eyebrow">Your motive</div>
        <h1 id="ob-title" className="r-title-xl" style={{ fontSize: "clamp(36px,7cqi,52px)" }}>What are you <em>becoming?</em></h1>
        <div className="r-stack" style={{ gap: 8 }} role="radiogroup" aria-label="Your motive" onKeyDown={radioKeys}>{motives.map((text, i) => <button key={text} type="button" role="radio" aria-checked={motive === i} className="r-chip t-ob-motive" onClick={() => setMotive(i)}>{text}</button>)}</div>
        <p className="r-small" style={{ fontSize: 13 }}>This becomes your headline on Today. You can rewrite it any time.</p>
      </div>}

      {step === 2 && <div className="r-stack r-rise-6" style={{ gap: 18, paddingTop: "clamp(10px,4cqi,32px)" }}>
        <div className="r-eyebrow">Your rhythm</div>
        <h1 id="ob-title" className="r-title-xl" style={{ fontSize: "clamp(36px,7cqi,52px)" }}>How many evenings a week feel <em>right?</em></h1>
        <div className="t-ob-targets" role="radiogroup" aria-label="Evenings a week" onKeyDown={radioKeys}>{targets.map((n, i) => <button key={n} type="button" role="radio" aria-checked={target === i} className="r-chip t-ob-target" onClick={() => setTarget(i)}><span style={{ font: "500 28px var(--r-mono)" }}>{n}</span><span style={{ font: "400 11px var(--r-sans)" }}>a week</span></button>)}</div>
        <p className="r-lede" style={{ fontSize: 13.5 }}>A week counts when you reach {targets[target]}. Rest days never break anything, and you can plan a pause.</p>
        <div className="r-row" style={{ gap: 14, padding: "14px 16px", borderRadius: 20, background: "rgba(255,240,225,.04)", border: "1px solid var(--r-line-2)", flexWrap: "nowrap" }}>
          <div style={{ flex: 1 }}><div style={{ font: "500 14.5px var(--r-sans)" }}>Evening reminder</div><div className="r-small" style={{ marginTop: 2 }}>{remind ? "On · 8:30 pm on weekdays. Sending starts once notifications are set up." : "Off"}</div></div>
          <button type="button" role="switch" aria-checked={remind} aria-label="Evening reminder" className="r-toggle" onClick={() => setRemind(!remind)} />
        </div>
      </div>}

      {step === 3 && <div className="r-stack r-rise-6" style={{ gap: 16, paddingTop: "clamp(10px,3cqi,24px)" }}>
        <div className="r-eyebrow">Your assistant</div>
        <h1 id="ob-title" className="r-title-xl" style={{ fontSize: "clamp(32px,6.5cqi,46px)" }}>Build with Claude. Let it <em>keep the record.</em></h1>
        <div className="t-ob-art"><ClaudeLoop /></div>
        <p className="r-lede" style={{ fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}>If you build with Claude Code, connect it once. It starts a task when you begin and finishes it with a summary and the PR link. It all shows up here in seconds, with an Undo.</p>
        <div className="t-ob-firsts" role="radiogroup" aria-label="Connect Claude Code" onKeyDown={radioKeys}>{assistantChoices.map(item => <button key={item.title} type="button" role="radio" aria-checked={connectAfter === item.yes} className="r-chip" style={choiceStyle} onClick={() => setConnectAfter(item.yes)}>
          <span style={{ font: "500 15.5px var(--r-sans)" }}>{item.title}</span><span className="r-small">{item.detail}</span>
        </button>)}</div>
      </div>}

      {step === 4 && <div className="r-stack r-rise-6" style={{ gap: 18, paddingTop: "clamp(10px,4cqi,32px)" }}>
        <div className="r-eyebrow">First thing</div>
        <h1 id="ob-title" className="r-title-xl" style={{ fontSize: "clamp(36px,7cqi,52px)" }}>What&apos;s on your <em>plate?</em></h1>
        <div className="t-ob-firsts" role="radiogroup" aria-label="What's on your plate" onKeyDown={radioKeys}>{firsts.map((item, i) => <button key={item.title} type="button" role="radio" aria-checked={first === i} className="r-chip" style={choiceStyle} onClick={() => setFirst(i)}>
          <span style={{ font: "500 15.5px var(--r-sans)" }}>{item.title}</span><span className="r-small">{item.detail}</span>
        </button>)}</div>
      </div>}

      {step === 5 && pick.lane && <div className="r-stack r-rise-6" style={{ gap: 16, paddingTop: "clamp(10px,4cqi,32px)" }}>
        <div className="r-eyebrow">First step</div>
        <h1 id="ob-title" className="r-title-xl" style={{ fontSize: "clamp(36px,7cqi,52px)" }}>Make it small enough to <em>start.</em></h1>
        <label className="r-field"><span className="r-row" style={{ gap: 8 }}>The first step {!title && <span className="r-example">EXAMPLE</span>}</span><input className="r-input" placeholder={pick.example?.title} value={title} onChange={event => setTitle(event.target.value)} maxLength={160} /></label>
        <label className="r-field">It&apos;s done when<input className="r-input" style={{ fontSize: 14 }} placeholder={pick.example?.done} value={done} onChange={event => setDone(event.target.value)} maxLength={1000} /></label>
        <div className="r-row" style={{ gap: 8 }}>
          {[15, 20, 30, 45].map(value => <button key={value} type="button" className="r-chip mono h38" aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} min</button>)}
          <span className="r-fact" style={{ padding: "8px 12px", borderRadius: 12 }}>{pick.lane}</span>
        </div>
      </div>}

      {error && <p role="alert" className="r-small" style={{ color: "var(--r-red-pale)" }}>{error}</p>}
      <div className="r-row" style={{ marginTop: "auto", gap: 8, paddingTop: 12, flexWrap: "nowrap" }}>
        {step > 0 && <button type="button" className="r-ghost" style={{ height: 56, fontSize: 15 }} disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        <button type="button" className="r-btn" style={{ flex: 1 }} disabled={busy} onClick={next}>{busy ? "Saving…" : step === 0 ? "Begin" : step >= last ? (pick.project ? "Set up my project" : "Start my first evening") : "Continue"}</button>
      </div>
    </div>
  </div>;
}
