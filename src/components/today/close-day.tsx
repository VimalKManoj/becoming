"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRitual } from "@/components/ritual/ritual-context";
import { useModal } from "@/components/ritual/use-modal";
import { readableError } from "@/lib/errors";
import { groupLine } from "./today-bars";

// Close the day (PLAN-one-tap-and-daily-loop, Phase 5): what moved today, listed for you,
// then one line for tomorrow (or a task to start with). About a minute. Tomorrow's Today
// ("Last night you said…") and the evening reminder open with it.

type Home = FunctionReturnType<typeof api.today.home>;

export function CloseDaySheet({ home, today, onClose, onSaved }: { home: Home; today: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useRitual();
  const close = useMutation(api.today.close);
  const dialog = useModal<HTMLDivElement>(onClose);
  const [text, setText] = useState(home.closedToday?.tomorrow ?? "");
  const [taskId, setTaskId] = useState<Id<"tasks"> | null>(home.closedToday?.taskId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const moved = home.lastTime?.isToday ? home.lastTime.groups.map(groupLine).filter(Boolean) : [];
  // Tasks to start tomorrow with: what's in progress, and where you left off.
  const picks = [...home.onItNow.map(task => ({ id: task.taskId, title: task.title })), ...(home.lastTime?.pickUp ? [{ id: home.lastTime.pickUp.taskId, title: home.lastTime.pickUp.title }] : [])]
    .filter((task, i, all) => all.findIndex(other => other.id === task.id) === i).slice(0, 4);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !taskId) { setError("Write one line for tomorrow, or pick a task."); return; }
    setBusy(true); setError("");
    try {
      await close({ day: today, tomorrow: text, ...(taskId ? { taskId } : {}) });
      showToast("Day closed. Tomorrow starts with it.");
      onSaved();
    } catch (caught) { setError(readableError(caught, "Could not save. Please try again.")); }
    finally { setBusy(false); }
  }

  return <div ref={dialog} className="r-cap" role="dialog" aria-modal="true" aria-labelledby="close-title">
    <div className="r-cap-back" onClick={onClose} />
    <form className="r-cap-card cd" onSubmit={event => void save(event)} aria-busy={busy}>
      <div className="r-row r-between">
        <span className="cd-eyebrow">Close the day · about a minute</span>
        <button type="button" className="r-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <h2 id="close-title" className="cd-title">What moved <em>today.</em></h2>
      {moved.length
        ? <ul className="cd-moves">{moved.map(line => <li key={line}>{line}</li>)}</ul>
        : <p className="r-small">Nothing moved today. That counts as rest, and resting is fine.</p>}
      <label className="r-field cd-field">Tomorrow starts with…
        <textarea className="r-textarea" rows={2} maxLength={300} value={text} placeholder="Trace one session end to end." onChange={event => setText(event.target.value)} />
      </label>
      {picks.length > 0 && <div className="cd-picks" role="group" aria-label="Or start with a task">
        <span className="r-small">Or start with:</span>
        {picks.map(task => <button key={task.id} type="button" className="r-chip round" aria-pressed={taskId === task.id} onClick={() => setTaskId(taskId === task.id ? null : task.id)}>{task.title}</button>)}
      </div>}
      {error && <p role="alert" className="r-small cd-error">{error}</p>}
      <button type="submit" className="r-btn" disabled={busy}>{busy ? "Saving…" : home.closedToday ? "Save changes" : "Close the day"}</button>
    </form>
  </div>;
}
