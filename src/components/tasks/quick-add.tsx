"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import type { Lane } from "@/components/task-forms";
import { useTaskMove } from "./use-task-move";

// A task from just a title, where it belongs: type it, press Enter, keep typing the next
// one (PLAN-one-tap-and-daily-loop, Phase 1). It's Ready at 30 minutes and steady energy,
// with "done when" left for later. "More…" opens the full form for everything else.

type Props = {
  projectId?: Id<"projects">;
  milestoneId?: Id<"milestones">;
  lane?: Lane;
  placeholder?: string;
  /** Opens the full task form with what's typed so far. */
  onMore?: (title: string) => void;
};

export function QuickAdd({ projectId, milestoneId, lane, placeholder = "Add a task…", onMore }: Props) {
  const quickAdd = useMutation(api.tasks.quickAdd);
  const { showToast } = useRitual();
  const { undo } = useTaskMove();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = title.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const { eventId } = await quickAdd({ title: text, ...(projectId ? { projectId } : {}), ...(milestoneId ? { milestoneId } : {}), ...(lane ? { lane } : {}) });
      setTitle("");
      showToast(`Added “${text}”. It's Ready.`, "status", eventId ? { actions: [undo(eventId, "Removed.")] } : {});
    } catch (error) {
      showToast(readableError(error, "Could not add that task."), "alert");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  return <form className="tk-quick" onSubmit={add} onClick={event => event.stopPropagation()}>
    <span className="tk-quick-plus" aria-hidden="true">+</span>
    <input ref={input} className="tk-quick-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={160}
      placeholder={placeholder} aria-label={placeholder.replace(/…$/, "")} disabled={busy} enterKeyHint="done" />
    {title.trim() && <button type="submit" className="tk-quick-add" disabled={busy}>{busy ? "Adding…" : "Add"}</button>}
    {onMore && <button type="button" className="tk-quick-more" onClick={() => onMore(title.trim())}>More…</button>}
  </form>;
}
