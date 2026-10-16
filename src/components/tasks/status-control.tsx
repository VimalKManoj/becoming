"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRitual } from "@/components/ritual/ritual-context";
import { readableError } from "@/lib/errors";
import { copyWorkPrompt } from "./work-prompt";
import { useFocus } from "@/components/focus/focus-layer";
import { useTaskMove, type MovableTask, type MoveTarget } from "./use-task-move";

// The one way to move a task, the same on every screen (PLAN-one-tap-and-daily-loop,
// Phase 1). The circle shows the status; clicking it opens a small menu that says what each
// status means, with the current one ticked, so nothing changes until you choose. Below
// that: a focus session, the pin, "Work on this with Claude" (Phase 2), archive (and restore
// or delete for an archived task).
// Every choice applies at once, with an Undo in the toast.

const statusClass: Record<string, string> = { "Ready": "ready", "In progress": "doing", "Blocked": "blocked", "Done": "done", "Archived": "archived" };
const choices: { status: MoveTarget; label: string; hint: string }[] = [
  { status: "Ready", label: "Ready", hint: "Not started yet" },
  { status: "In progress", label: "In progress", hint: "You're working on it" },
  { status: "Blocked", label: "Blocked…", hint: "Something's in the way" },
  { status: "Done", label: "Done", hint: "Finished" },
];

type Props = {
  task: MovableTask;
  /** "pill" shows the status in words with a caret (the task sheet); the circle is for rows. */
  variant?: "circle" | "pill";
  /** Called after the task was deleted, so a sheet showing it can close. */
  onDeleted?: () => void;
};

export function StatusControl({ task, variant = "circle", onDeleted }: Props) {
  const moves = useTaskMove();
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const busy = moves.busy === task._id;

  return <span ref={anchor} className="tk-control">
    {variant === "pill"
      ? <button type="button" className={`tk-pill${busy ? " busy" : ""}`} disabled={busy} aria-haspopup="menu" aria-expanded={menu}
        aria-label={`Status: ${task.status}. Change the status of “${task.title}”`} onClick={event => { event.stopPropagation(); setMenu(open => !open); }}>
        <span className={`tk-glyph ${statusClass[task.status] ?? "ready"}`} aria-hidden="true" />{task.status}<span className="tk-caret" aria-hidden="true">▾</span>
      </button>
      : <button type="button" className={`tk-circle ${statusClass[task.status] ?? "ready"}${busy ? " busy" : ""}`} disabled={busy}
        aria-haspopup="menu" aria-expanded={menu} aria-label={`Status: ${task.status}. Change the status of “${task.title}”`}
        title={`${task.status} · click to change status`}
        onClick={event => { event.stopPropagation(); setMenu(open => !open); }}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu(true); }}>
        <span aria-hidden="true" />
      </button>}
    {menu && <StatusMenu task={task} anchor={anchor} moves={moves} onClose={() => setMenu(false)} onDeleted={onDeleted} />}
  </span>;
}

type MenuItem = { label: string; run: () => void; tone?: "red" } | { label: string; href: string };

function StatusMenu({ task, anchor, moves, onClose, onDeleted }: { task: MovableTask; anchor: RefObject<HTMLSpanElement | null>; moves: ReturnType<typeof useTaskMove>; onClose: () => void; onDeleted?: () => void }) {
  const profile = useQuery(api.settings.getProfile);
  const pin = useMutation(api.tasks.pin);
  const { showToast } = useRitual();
  const focus = useFocus();
  const box = useRef<HTMLDivElement>(null);
  const [blocking, setBlocking] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const pinned = profile?.pinnedTaskId === task._id;
  const archived = task.status === "Archived";
  const open = task.status === "Ready" || task.status === "In progress";

  // Fixed to the window below the control, or above it near the bottom of the screen; never
  // over it. When neither side fits, it takes the roomier one and scrolls.
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const height = box.current?.scrollHeight ?? 300;
    const width = box.current?.offsetWidth ?? 248;
    const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18;
    const down = height <= below || (height > above && below >= above);
    const room = Math.max(120, down ? below : above);
    setPlace({ top: down ? rect.bottom + 6 : Math.max(12, rect.top - 6 - Math.min(height, room)), left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12), maxHeight: room });
  }, [anchor, blocking]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) onClose(); };
    const away = () => onClose();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    // Focus starts on the current status, so arrow keys move from where the task is.
    (box.current?.querySelector<HTMLElement>("[aria-checked=true]") ?? box.current?.querySelector<HTMLElement>("[role^=menuitem]"))?.focus();
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", away); window.removeEventListener("scroll", away, true); };
  }, [anchor, onClose]);

  const run = (action: () => unknown) => () => { onClose(); void action(); };
  const choose = (status: MoveTarget) => {
    if (status === task.status) { onClose(); return; }
    if (status === "Blocked") { setBlocking(true); return; }
    onClose();
    void moves.move(task, status);
  };
  const togglePin = async () => {
    try { await pin({ taskId: pinned ? undefined : task._id }); showToast(pinned ? "Unpinned." : `Pinned “${task.title}” for tonight. Today offers it first when it fits.`); }
    catch (error) { showToast(readableError(error, "Could not change the pin."), "alert"); }
  };
  const more: MenuItem[] = archived ? [
    { label: "Restore", run: run(() => moves.restore(task)) },
    { label: "Delete for good…", tone: "red", run: run(async () => { if (await moves.remove(task)) onDeleted?.(); }) },
  ] : [
    ...(open ? [{ label: focus.active?.taskId === task._id ? "Open the focus view" : "Start a focus session", run: run(() => focus.active?.taskId === task._id ? focus.expand() : focus.start(task)) }, { label: pinned ? "Unpin" : "Pin for tonight", run: run(togglePin) }] : []),
    ...(task.status !== "Done" ? [{ label: "Work on this with Claude", run: run(() => copyWorkPrompt(task, showToast)) }] : []),
    { label: "Archive", run: run(() => moves.archive(task)) },
  ];

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); anchor.current?.querySelector<HTMLElement>("button")?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = [...(box.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
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
  return createPortal(<div ref={box} className="tk-menu" role="menu" aria-label={`Status of “${task.title}”`} onKeyDown={keys}
    style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, maxHeight: place?.maxHeight }} onClick={event => event.stopPropagation()}>
    {blocking
      ? <form className="tk-block" onSubmit={block}>
        <label className="r-label" htmlFor={`block-${task._id}`}>What&apos;s blocking it? <span className="r-small">· optional</span></label>
        <input id={`block-${task._id}`} name="reason" className="r-input" maxLength={2000} placeholder="Waiting on the API key" autoFocus />
        <div className="r-row" style={{ gap: 8 }}><button type="submit" className="r-btn red">Mark blocked</button><button type="button" className="tk-menu-link" onClick={() => setBlocking(false)}>Back</button></div>
      </form>
      : <>
        {!archived && <>
          <div className="tk-menu-label" aria-hidden="true">Status</div>
          {choices.map(choice => {
            const current = task.status === choice.status;
            return <button key={choice.status} type="button" role="menuitemradio" aria-checked={current} aria-label={`${choice.label.replace("…", "")}: ${choice.hint.toLowerCase()}`} className={`tk-menu-item tk-status${current ? " current" : ""}`} onClick={() => choose(choice.status)}>
              <span className={`tk-glyph ${statusClass[choice.status]}`} aria-hidden="true" />
              <span className="tk-status-text"><span>{choice.label}</span><span className="tk-hint">{choice.hint}</span></span>
              {current && <span className="tk-tick" aria-hidden="true">✓</span>}
            </button>;
          })}
          <div className="tk-menu-sep" role="separator" />
        </>}
        {archived && <div className="tk-menu-label">Archived · hidden everywhere, history kept</div>}
        {more.map(item => "href" in item
          ? <Link key={item.label} role="menuitem" className="tk-menu-item" href={item.href} onClick={onClose}>{item.label}</Link>
          : <button key={item.label} type="button" role="menuitem" className={`tk-menu-item${item.tone === "red" ? " red" : ""}`} onClick={item.run}>{item.label}</button>)}
      </>}
  </div>, frame);
}
