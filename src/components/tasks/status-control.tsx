"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { useTaskMove, type MovableTask, type MoveTarget } from "./use-task-move";

// The one way to move a task, the same on every screen (PLAN-one-tap-and-daily-loop,
// Phase 1). The circle shows the status and a tap takes the obvious next step:
// Ready → In progress → Done; Blocked → Ready; Done → In progress (reopen);
// Archived → restored. Everything else (block, back to Ready, focus, pin, archive, delete)
// is in its menu: the ⋯ beside it, or a right-click on the circle.

const tapTo: Record<string, MoveTarget | "restore"> = { "Ready": "In progress", "In progress": "Done", "Blocked": "Ready", "Done": "In progress", "Archived": "restore" };
const tapLabel: Record<string, string> = { "Ready": "Start", "In progress": "Mark done", "Blocked": "Unblock", "Done": "Reopen", "Archived": "Restore" };
const statusClass: Record<string, string> = { "Ready": "ready", "In progress": "doing", "Blocked": "blocked", "Done": "done", "Archived": "archived" };

type Props = {
  task: MovableTask;
  /** Hides the ⋯ button (the menu is still on right-click); for tight rows. */
  compact?: boolean;
  /** Called after the task was deleted, so a sheet showing it can close. */
  onDeleted?: () => void;
};

export function StatusControl({ task, compact = false, onDeleted }: Props) {
  const moves = useTaskMove();
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const busy = moves.busy === task._id;
  const next = tapTo[task.status] ?? "In progress";

  function tap() {
    if (busy) return;
    if (next === "restore") void moves.restore(task);
    else void moves.move(task, next);
  }

  return <span ref={anchor} className={`tk-control${compact ? " compact" : ""}`}>
    <button type="button" className={`tk-circle ${statusClass[task.status] ?? "ready"}${busy ? " busy" : ""}`} disabled={busy}
      aria-label={`${task.status}. ${tapLabel[task.status] ?? "Start"} “${task.title}”`} title={`${tapLabel[task.status] ?? "Start"} · right-click for more`}
      onClick={event => { event.stopPropagation(); tap(); }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu(true); }}>
      <span aria-hidden="true" />
    </button>
    {!compact && <button type="button" className="tk-more" aria-haspopup="menu" aria-expanded={menu} aria-label={`More for “${task.title}”`}
      onClick={event => { event.stopPropagation(); setMenu(open => !open); }}>⋯</button>}
    {menu && <StatusMenu task={task} anchor={anchor} moves={moves} onClose={() => setMenu(false)} onDeleted={onDeleted} />}
  </span>;
}

type MenuItem = { label: string; run: () => void; tone?: "red" } | { label: string; href: string };

function StatusMenu({ task, anchor, moves, onClose, onDeleted }: { task: MovableTask; anchor: RefObject<HTMLSpanElement | null>; moves: ReturnType<typeof useTaskMove>; onClose: () => void; onDeleted?: () => void }) {
  const profile = useQuery(api.settings.getProfile);
  const pin = useMutation(api.tasks.pin);
  const { showToast } = useRitual();
  const box = useRef<HTMLDivElement>(null);
  const [blocking, setBlocking] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const pinned = profile?.pinnedTaskId === task._id;
  const open = task.status === "Ready" || task.status === "In progress";

  // Fixed to the window beside the control, flipped up near the bottom of the screen.
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const height = box.current?.offsetHeight ?? 260;
    const top = rect.bottom + 6 + height > window.innerHeight - 12 ? Math.max(12, rect.top - 6 - height) : rect.bottom + 6;
    setPlace({ top, left: Math.min(Math.max(12, rect.left), window.innerWidth - 232) });
  }, [anchor, blocking]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose(); };
    const away = () => onClose();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    box.current?.querySelector<HTMLElement>("button, a, input")?.focus();
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", away); window.removeEventListener("scroll", away, true); };
  }, [anchor, onClose]);

  const run = (action: () => unknown) => () => { onClose(); void action(); };
  const togglePin = async () => {
    try { await pin({ taskId: pinned ? undefined : task._id }); showToast(pinned ? "Unpinned." : `Pinned “${task.title}” for tonight. Today offers it first when it fits.`); }
    catch (error) { showToast(readableError(error, "Could not change the pin."), "alert"); }
  };
  const items: MenuItem[] = [
    ...(task.status === "Ready" ? [{ label: "Start", run: run(() => moves.move(task, "In progress")) }] : []),
    ...(task.status === "Blocked" ? [{ label: "Unblock", run: run(() => moves.move(task, "Ready")) }] : []),
    ...(task.status === "Done" ? [{ label: "Reopen", run: run(() => moves.move(task, "In progress")) }] : []),
    ...(task.status !== "Done" && task.status !== "Archived" ? [{ label: "Mark done", run: run(() => moves.move(task, "Done")) }] : []),
    ...(task.status === "In progress" ? [{ label: "Back to Ready", run: run(() => moves.move(task, "Ready")) }] : []),
    ...(open ? [{ label: "Blocked…", run: () => setBlocking(true) }] : []),
    ...(open ? [{ label: "Start a focus session", href: `/today?task=${task._id}` }, { label: pinned ? "Unpin" : "Pin for tonight", run: run(togglePin) }] : []),
    ...(task.status !== "Archived" ? [{ label: "Archive", run: run(() => moves.archive(task)) }] : []),
    ...(task.status === "Archived" ? [
      { label: "Restore", run: run(() => moves.restore(task)) },
      { label: "Delete for good…", tone: "red" as const, run: run(async () => { if (await moves.remove(task)) onDeleted?.(); }) },
    ] : []),
  ];

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); anchor.current?.querySelector<HTMLElement>("button")?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (event.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
    event.preventDefault();
  }
  function block(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("reason") || "");
    onClose();
    void moves.move(task, "Blocked", { note });
  }

  const frame = typeof document === "undefined" ? null : document.querySelector(".r-app") ?? document.body;
  if (!frame) return null;
  return createPortal(<div ref={box} className="tk-menu" role="menu" aria-label={`Actions for “${task.title}”`} onKeyDown={keys}
    style={{ top: place?.top ?? -9999, left: place?.left ?? -9999 }} onClick={event => event.stopPropagation()}>
    {blocking
      ? <form className="tk-block" onSubmit={block}>
        <label className="r-label" htmlFor={`block-${task._id}`}>What&apos;s blocking it? <span className="r-small">· optional</span></label>
        <input id={`block-${task._id}`} name="reason" className="r-input" maxLength={2000} placeholder="Waiting on the API key" autoFocus />
        <div className="r-row" style={{ gap: 8 }}><button type="submit" className="r-btn red">Block it</button><button type="button" className="tk-menu-link" onClick={() => setBlocking(false)}>Back</button></div>
      </form>
      : <>
        {items.map(item => "href" in item
          ? <Link key={item.label} role="menuitem" className="tk-menu-item" href={item.href} onClick={onClose}>{item.label}</Link>
          : <button key={item.label} type="button" role="menuitem" className={`tk-menu-item${item.tone === "red" ? " red" : ""}`} onClick={item.run}>{item.label}</button>)}
      </>}
  </div>, frame);
}
