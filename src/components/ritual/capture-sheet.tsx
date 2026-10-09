"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { readableError } from "@/lib/errors";
import { useRitual, type CaptureMode } from "@/components/ritual/ritual-context";
import { useModal } from "@/components/ritual/use-modal";

// "Get it out of your head." One sheet for an idea, a task, a project or a pasted
// assignment. Saving an idea never adds work to Today.

type Lane = "Projects" | "Showcases" | "Writing";
const lanes: Lane[] = ["Projects", "Showcases", "Writing"];
const modes: { id: CaptureMode; label: string; placeholder: string; button: string; note: string }[] = [
  { id: "idea", label: "Idea", placeholder: "A title is enough", button: "Save to Ideas", note: "Saving an idea never adds work to Today." },
  { id: "task", label: "Task", placeholder: "What is the task?", button: "Add to Work", note: "Ready tasks can appear in Today when they fit." },
  { id: "project", label: "Project", placeholder: "What do you want to build?", button: "Set it up", note: "Two short steps: the project, then its first step." },
  { id: "assignment", label: "Paste assignment", placeholder: "Paste the assignment text", button: "Brainstorm it", note: "It becomes an idea you can shape first. Nothing is added to Today." },
];

export function CaptureSheet() {
  const { capture, closeCapture, openCapture, openNewProject, showToast } = useRitual();
  if (!capture) return null;
  return <CaptureCard mode={capture} onMode={openCapture} onClose={closeCapture} onProject={openNewProject} onToast={showToast} />;
}

function CaptureCard({ mode, onMode, onClose, onProject, onToast }: { mode: CaptureMode; onMode: (mode: CaptureMode) => void; onClose: () => void; onProject: () => void; onToast: (text: string, tone?: "status" | "alert") => void }) {
  const router = useRouter();
  const profile = useQuery(api.settings.getProfile);
  const createIdea = useMutation(api.ideas.create);
  const createTask = useMutation(api.tasks.create);
  const [text, setText] = useState("");
  const [doneWhen, setDoneWhen] = useState("");
  const [lane, setLane] = useState<Lane | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const details = modes.find(item => item.id === mode)!;
  const chosenLane = lane ?? profile?.laneFocus ?? "Projects";

  // Switching between Idea, Task and Paste assignment keeps what you typed.
  useEffect(() => { area.current?.focus(); }, [mode]);
  const dialog = useModal<HTMLDivElement>(onClose);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (mode === "project") return onProject();
    const value = text.trim();
    if (!value) { setError(mode === "task" ? "Write what the task is." : "Write something first."); return; }
    const [first, ...rest] = value.split("\n");
    const title = first.trim().slice(0, 160);
    setBusy(true); setError("");
    try {
      if (mode === "idea") {
        await createIdea({ title, lane: chosenLane, notes: rest.join("\n").trim() });
        onToast("Saved to Ideas. Nothing was added to Today.");
        onClose();
      } else if (mode === "task") {
        if (!doneWhen.trim()) { setError("Say when it's done, so you know when to stop."); setBusy(false); return; }
        await createTask({ title, lane: chosenLane, minutes, energy: 2, doneWhen: doneWhen.trim() });
        onToast("Added to Work as Ready. Today can suggest it when it fits.");
        onClose();
      } else {
        const ideaId = await createIdea({ title, lane: chosenLane, notes: value });
        onClose();
        router.push(`/ideas?idea=${ideaId}`);
      }
    } catch (caught) { setError(readableError(caught, "Could not save. Please try again.")); }
    finally { setBusy(false); }
  }

  return <div ref={dialog} className="r-cap" role="dialog" aria-modal="true" aria-labelledby="capture-title">
    <div className="r-cap-back" onClick={onClose} />
    <form className="r-cap-card" onSubmit={save} aria-busy={busy}>
      <div className="r-row r-between">
        <h2 id="capture-title" className="r-serif" style={{ font: "400 28px/1 var(--r-serif)" }}>Get it out of your <em style={{ color: "var(--r-lilac)" }}>head.</em></h2>
        <button type="button" className="r-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="r-row" style={{ gap: 6 }} role="group" aria-label="What are you capturing?">
        {modes.map(item => <button key={item.id} type="button" className="r-chip round" aria-pressed={item.id === mode} onClick={() => onMode(item.id)}>{item.label}</button>)}
      </div>
      {mode !== "project" && <textarea ref={area} className="r-textarea r-cap-textarea" rows={3} placeholder={details.placeholder} value={text} onChange={event => setText(event.target.value)} maxLength={mode === "assignment" ? 10000 : 2000} aria-label={details.placeholder} />}
      {mode === "project" && <p className="r-lede">A name, why it matters, and one first step. About a minute.</p>}
      {mode === "task" && <>
        <input className="r-input" placeholder="Done when…" value={doneWhen} onChange={event => setDoneWhen(event.target.value)} maxLength={1000} aria-label="Done when" />
        <div className="r-row" style={{ gap: 6 }}>
          {lanes.map(item => <button key={item} type="button" className={`r-chip round lane-${item}`} aria-pressed={item === chosenLane} onClick={() => setLane(item)}><span className="r-dot" />{item}</button>)}
          <span style={{ flex: 1 }} />
          {[15, 30, 45, 60].map(value => <button key={value} type="button" className="r-chip mono" aria-pressed={value === minutes} onClick={() => setMinutes(value)}>{value}m</button>)}
        </div>
      </>}
      {error && <p role="alert" className="r-small" style={{ color: "var(--r-red-pale)" }}>{error}</p>}
      <div className="r-row r-between" style={{ gap: 10 }}>
        <span className="r-small">{details.note}</span>
        <button type="submit" className="r-btn sm" disabled={busy}>{busy ? "Saving…" : details.button}</button>
      </div>
    </form>
  </div>;
}
