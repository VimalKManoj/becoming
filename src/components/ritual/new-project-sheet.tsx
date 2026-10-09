"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { readableError } from "@/lib/errors";
import { useRitual } from "@/components/ritual/ritual-context";
import { useModal } from "@/components/ritual/use-modal";

// "Start something new." in two short steps, so neither overflows the screen: the project
// (name, why, lane), then its first step. Only the first step needs to be ready;
// milestones can come later. Nothing is saved until the second step.

type Lane = "Projects" | "Showcases" | "Writing";
const lanes: Lane[] = ["Projects", "Showcases", "Writing"];

export function NewProjectSheet() {
  const { newProject, closeNewProject, showToast } = useRitual();
  if (!newProject) return null;
  return <NewProject onClose={closeNewProject} onToast={showToast} />;
}

function NewProject({ onClose, onToast }: { onClose: () => void; onToast: (text: string, tone?: "status" | "alert") => void }) {
  const router = useRouter();
  const create = useMutation(api.projects.createWithFirstStep);
  const [stage, setStage] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [lane, setLane] = useState<Lane>("Projects");
  const [step, setStep] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [doneWhen, setDoneWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dialog = useModal<HTMLDivElement>(onClose);

  function next(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !why.trim()) { setError("Give it a name and say why it matters."); return; }
    setError(""); setStage(2);
  }

  async function save(startTonight: boolean) {
    if (!step.trim() || !doneWhen.trim()) { setError("Name the first step and say when it's done."); return; }
    setBusy(true); setError("");
    try {
      const { projectId } = await create({ title: name.trim(), purpose: why.trim(), step: { title: step.trim(), lane, minutes, energy: 2, doneWhen: doneWhen.trim() } });
      onClose();
      if (startTonight) { onToast("Project created. Its first step is ready."); router.push(`/today?intent=build&project=${projectId}`); }
      else { onToast("Saved to Work. Today can suggest its first step when it fits."); router.push("/work"); }
    } catch (caught) { setError(readableError(caught, "Could not create the project. Please try again.")); }
    finally { setBusy(false); }
  }

  const head = <div className="r-row r-between">
    <div className="r-row" style={{ gap: 12 }}>
      <span className="r-row" style={{ gap: 5 }} aria-hidden="true">{[1, 2].map(n => <span key={n} className={`t-ob-dot${n <= stage ? " on" : ""}`} style={{ width: n === stage ? 22 : 7 }} />)}</span>
      <span className="r-eyebrow ember">{stage === 1 ? "New project" : "First step"} · {stage} of 2</span>
    </div>
    <button type="button" className="r-close" aria-label="Close" onClick={onClose}>×</button>
  </div>;
  const alert = error && <p role="alert" className="r-small" style={{ color: "var(--r-red-pale)" }}>{error}</p>;

  return <div ref={dialog} className="r-overlay sheet" role="dialog" aria-modal="true" aria-labelledby="np-title">
    {stage === 1
      ? <form key="project" className="r-col r-rise-6" style={{ maxWidth: 560, gap: 16 }} onSubmit={next}>
        {head}
        <h1 id="np-title" style={{ font: "400 clamp(38px,7cqi,54px)/1 var(--r-serif)" }}>Start something <em style={{ color: "var(--r-ember-text)" }}>new.</em></h1>
        <p className="r-lede">Only the first step needs to be ready. Milestones can come once the shape is clearer.</p>
        <label className="r-field">Project name<input className="r-input" style={{ height: 52, font: "400 20px var(--r-serif)" }} placeholder="Type specimen tool" value={name} onChange={event => setName(event.target.value)} maxLength={160} autoFocus /></label>
        <label className="r-field">Why it matters<input className="r-input" style={{ fontSize: 14 }} placeholder="A living specimen for variable fonts, built in public." value={why} onChange={event => setWhy(event.target.value)} maxLength={2000} /></label>
        <div><div className="r-label" style={{ marginBottom: 8 }}>Lane</div><div className="r-row" style={{ gap: 6 }}>
          {lanes.map(item => <button key={item} type="button" className={`r-chip round h40 lane-${item}`} aria-pressed={item === lane} onClick={() => setLane(item)}><span className="r-dot" />{item}</button>)}
        </div></div>
        {alert}
        <button type="submit" className="r-btn" style={{ marginTop: 6 }}>Next: the first step →</button>
      </form>
      : <form key="step" className="r-col r-rise-6" style={{ maxWidth: 560, gap: 16 }} onSubmit={event => { event.preventDefault(); void save(true); }}>
        {head}
        <button type="button" className="r-back" style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} disabled={busy} onClick={() => { setError(""); setStage(1); }}>‹ {name.trim()}</button>
        <h1 id="np-title" style={{ font: "400 clamp(36px,6.5cqi,50px)/1 var(--r-serif)" }}>Make it small enough to <em style={{ color: "var(--r-ember-text)" }}>start.</em></h1>
        <label className="r-field">What&apos;s the first thing to do?<input className="r-input" placeholder="Two-axis waterfall with one bundled font" value={step} onChange={event => setStep(event.target.value)} maxLength={160} autoFocus /></label>
        <div><div className="r-label" style={{ marginBottom: 8 }}>Estimate</div><div className="r-row" style={{ gap: 6 }}>
          {[15, 20, 30, 45].map(value => <button key={value} type="button" className="r-chip mono h40" aria-pressed={value === minutes} onClick={() => setMinutes(value)}>{value} min</button>)}
        </div></div>
        <label className="r-field">Done when<input className="r-input" style={{ fontSize: 14 }} placeholder="Weight and width scrub smoothly at 60fps." value={doneWhen} onChange={event => setDoneWhen(event.target.value)} maxLength={1000} /></label>
        {alert}
        <div className="r-stack" style={{ gap: 8, marginTop: 6 }}>
          <button type="submit" className="r-btn" disabled={busy}>{busy ? "Creating…" : "Start the first step tonight"}</button>
          <button type="button" className="r-ghost" disabled={busy} onClick={() => void save(false)}>Save to Work for later</button>
        </div>
      </form>}
  </div>;
}
