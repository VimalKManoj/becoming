"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRitual, type ToastAction } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { useFocus } from "@/components/focus/focus-layer";

// Every task move in the app goes through here (PLAN-one-tap-and-daily-loop, Phase 1): it
// happens at once, the toast says what happened with an Undo, and a finish shows what it
// meant (the skills it grew, its milestone's progress, and the next task to start).

export type Finish = NonNullable<FunctionReturnType<typeof api.tasks.setStatus>["finish"]>;
export type MovableTask = { _id: Id<"tasks">; title: string; status: string };
export type MoveTarget = "Ready" | "In progress" | "Blocked" | "Done";

const quote = (title: string) => `“${title.length > 48 ? `${title.slice(0, 46)}…` : title}”`;

export function useTaskMove() {
  const { showToast } = useRitual();
  const setStatus = useMutation(api.tasks.setStatus);
  const undoMove = useMutation(api.tasks.undo);
  const noteOn = useMutation(api.tasks.noteOn);
  const editTask = useMutation(api.tasks.edit);
  const archiveTask = useMutation(api.tasks.archive);
  const restoreTask = useMutation(api.tasks.restore);
  const removeTask = useMutation(api.tasks.remove);
  const [busy, setBusy] = useState<Id<"tasks"> | null>(null);
  const focus = useFocus();

  // A task with a focus session running can't move until the session is saved (Phase 4):
  // the toast offers to finish it rather than only saying no.
  const fail = (error: unknown, fallback: string) => {
    const text = readableError(error, fallback);
    if (/focus session running/i.test(text) && focus.active) showToast("This task has a focus session running. Finish it first: the recap moves the task.", "alert", { actions: [{ label: "Finish the session", run: () => focus.openRecap() }] });
    else showToast(text, "alert");
  };

  /** Undo returns false so the toast it opens ("Undone.") isn't closed straight after. */
  const undo = (eventId: Id<"taskEvents">, done = "Undone."): ToastAction => ({
    label: "Undo",
    run: async () => {
      try { await undoMove({ eventId }); showToast(done); } catch (error) { fail(error, "Couldn't undo that."); }
      return false;
    },
  });

  async function move(task: MovableTask, to: MoveTarget, options: { note?: string; skills?: string[] } = {}) {
    setBusy(task._id);
    try {
      const result = await setStatus({ taskId: task._id, status: to, ...(options.note?.trim() ? { note: options.note } : {}), ...(options.skills?.length ? { skills: options.skills } : {}) });
      const eventId = result.eventId;
      if (!eventId) return result;
      const name = quote(task.title);
      if (to === "Done") finished(task, eventId, result.finish);
      else if (to === "Blocked") showToast(`${name} is blocked. It stays out of Today until it's unblocked.`, "status", {
        actions: [undo(eventId)],
        ...(options.note?.trim() ? {} : { note: { label: "Say why", placeholder: "What's blocking it?", save: async (note: string) => { await noteOn({ eventId, note }); showToast("Saved. It's what unblocking starts from."); } } }),
      });
      else {
        const text = task.status === "Blocked" ? `${name} is unblocked.` : task.status === "Done" ? `Reopened ${name}.` : to === "In progress" ? `Started ${name}.` : `${name} is back to Ready.`;
        const asksNext = task.status === "Blocked" || task.status === "Done";
        showToast(text, "status", {
          actions: [undo(eventId)],
          ...(asksNext && !options.note?.trim() ? { note: { label: "Set the next step", placeholder: "The very next thing to do", save: async (nextStep: string) => { await editTask({ taskId: task._id, nextStep }); showToast("Next step saved."); } } } : {}),
        });
      }
      return result;
    } catch (error) {
      fail(error, "Could not move that task. Please try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function finished(task: MovableTask, eventId: Id<"taskEvents">, finish: Finish | null) {
    const milestone = finish?.milestone;
    const next = finish?.next;
    const headline = milestone?.completedNow ? `${quote(task.title)} is done, and ${quote(milestone.title)} is complete.` : `${quote(task.title)} is done.`;
    const actions: ToastAction[] = [];
    if (next?.status === "Ready") actions.push({ label: `Start ${quote(next.title)}`, run: async () => { await move({ _id: next.id, title: next.title, status: next.status }, "In progress"); return false; } });
    actions.push(undo(eventId));
    showToast(headline, "status", {
      duration: 8000,
      body: finish && (finish.skills.length > 0 || milestone || finish.phase?.completedNow || next) ? <FinishDetails finish={finish} /> : undefined,
      actions,
      note: { label: "Add what changed", placeholder: "What changed? Kept in its history.", save: async (note: string) => { await noteOn({ eventId, note }); showToast("Kept in its history."); } },
    });
  }

  async function archive(task: MovableTask) {
    setBusy(task._id);
    try {
      const { eventId } = await archiveTask({ taskId: task._id });
      if (eventId) showToast(`Archived ${quote(task.title)}. Its history is kept.`, "status", { actions: [undo(eventId)] });
    } catch (error) { fail(error, "Could not archive that task."); } finally { setBusy(null); }
  }

  async function restore(task: MovableTask) {
    setBusy(task._id);
    try {
      const { eventId } = await restoreTask({ taskId: task._id });
      if (eventId) showToast(`${quote(task.title)} is back.`, "status", { actions: [undo(eventId)] });
    } catch (error) { fail(error, "Could not restore that task."); } finally { setBusy(null); }
  }

  /** Archived tasks only, after a plain confirmation: this one can't be undone. */
  async function remove(task: MovableTask) {
    if (!window.confirm(`Delete ${quote(task.title)} for good? Its history, sessions and evidence go with it. This can't be undone.`)) return false;
    setBusy(task._id);
    try { await removeTask({ taskId: task._id }); showToast(`Deleted ${quote(task.title)}.`); return true; }
    catch (error) { fail(error, "Could not delete that task."); return false; }
    finally { setBusy(null); }
  }

  return { move, archive, restore, remove, undo, busy };
}

/** Under a finish: the skills it grew, its milestone's progress, and a phase that just completed. */
function FinishDetails({ finish }: { finish: Finish }) {
  const milestone = finish.milestone;
  return <div className="tk-finish">
    {finish.skills.length > 0 && <div className="tk-finish-skills">{finish.skills.map(skill => <span key={skill} className="tk-skill">+{skill}</span>)}</div>}
    {milestone && <div className="tk-finish-ms">
      <span className="tk-finish-name">{milestone.title}</span>
      <span className="tk-bar" aria-hidden="true"><span style={{ width: `${milestone.total ? Math.round(milestone.done / milestone.total * 100) : 0}%` }} /></span>
      <span className="tk-finish-count">{milestone.done} of {milestone.total}</span>
    </div>}
    {finish.phase?.completedNow && <div className="tk-finish-phase">Phase complete: {finish.phase.name}</div>}
    {finish.next && finish.next.status !== "Ready" && <div className="tk-finish-next">Next: {finish.next.title} · in progress</div>}
  </div>;
}
