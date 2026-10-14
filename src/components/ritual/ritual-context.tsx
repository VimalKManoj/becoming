"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// App-wide pieces of the Ritual design that any screen can call on: the capture sheet, the
// way to the New project page (Work → New project) and the toast. The shell renders them once.

export type CaptureMode = "idea" | "task" | "project" | "assignment";
/** A button on a toast, such as Undo. Running it closes the toast unless it returns false. */
export type ToastAction = { label: string; run: () => void | boolean | Promise<void | boolean> };
type ToastOptions = {
  /** More under the text: a finish's skills, milestone progress and what's next. */
  body?: ReactNode;
  actions?: ToastAction[];
  /** "Add a note": a one-line field inside the toast, saved with this. */
  note?: { label: string; placeholder: string; save: (text: string) => Promise<void> };
  /** How long it stays, in ms. Longer when there's something to act on. */
  duration?: number;
};
type Toast = { text: string; tone: "status" | "alert"; id: number } & ToastOptions;

type RitualContextValue = {
  capture: CaptureMode | null;
  openCapture: (mode?: CaptureMode) => void;
  closeCapture: () => void;
  /** Opens the New project page; with an idea, it starts from that idea. */
  openNewProject: (ideaId?: string) => void;
  toast: Toast | null;
  showToast: (text: string, tone?: "status" | "alert", options?: ToastOptions) => void;
  closeToast: () => void;
};

const RitualContext = createContext<RitualContextValue | null>(null);

export function RitualProvider({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState<CaptureMode | null>(null);
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);

  const showToast = useCallback((text: string, tone: "status" | "alert" = "status", options: ToastOptions = {}) => {
    counter.current += 1;
    setToast({ text, tone, id: counter.current, ...options });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const value: RitualContextValue = {
    capture,
    openCapture: (mode = "idea") => setCapture(mode),
    closeCapture: () => setCapture(null),
    openNewProject: (ideaId?: string) => { setCapture(null); router.push(`/work?new=project${ideaId ? `&idea=${ideaId}` : ""}`); },
    toast,
    showToast,
    closeToast,
  };
  return <RitualContext.Provider value={value}>{children}</RitualContext.Provider>;
}

export function useRitual() {
  const value = useContext(RitualContext);
  if (!value) throw new Error("useRitual must be used inside RitualProvider");
  return value;
}

/**
 * The toast itself; announced politely to screen readers. A plain one stays 3.4 seconds, as
 * in the prototype; one with actions stays longer, and pauses while the pointer or focus is
 * on it, so Undo and "Add a note" never vanish mid-reach.
 */
export function RitualToast() {
  const { toast } = useRitual();
  return <div role="status" aria-live="polite" className={toast ? "" : "sr-only"}>
    {toast && <ToastCard key={toast.id} toast={toast} />}
  </div>;
}

function ToastCard({ toast }: { toast: Toast }) {
  const { closeToast } = useRitual();
  const [held, setHeld] = useState(false);
  const [noting, setNoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const interactive = Boolean(toast.actions?.length || toast.note);

  useEffect(() => {
    if (held || noting) return;
    const timer = setTimeout(closeToast, toast.duration ?? (interactive ? 6500 : 3400));
    return () => clearTimeout(timer);
  }, [held, noting, toast.duration, interactive, closeToast]);

  async function act(action: ToastAction) {
    setBusy(true);
    try { if ((await action.run()) !== false) closeToast(); } finally { setBusy(false); }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("note") || "").trim();
    if (!text || !toast.note) { setNoting(false); return; }
    setBusy(true);
    try { await toast.note.save(text); closeToast(); } finally { setBusy(false); }
  }

  return <div className={`r-toast${toast.tone === "alert" ? " alert" : ""}${interactive ? " rich" : ""}`}
    onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
    <div className="r-toast-line"><span className="r-dot" aria-hidden="true" />{toast.text}</div>
    {toast.body}
    {noting && toast.note
      ? <form className="r-toast-note" onSubmit={saveNote}>
        <input className="r-input" name="note" autoFocus maxLength={2000} aria-label={toast.note.label} placeholder={toast.note.placeholder} disabled={busy} />
        <button type="submit" className="r-toast-act" disabled={busy}>Save</button>
      </form>
      : interactive && <div className="r-toast-acts">
        {toast.actions?.map(action => <button key={action.label} type="button" className="r-toast-act" disabled={busy} onClick={() => void act(action)}>{action.label}</button>)}
        {toast.note && <button type="button" className="r-toast-act" disabled={busy} onClick={() => setNoting(true)}>{toast.note.label}</button>}
      </div>}
  </div>;
}
