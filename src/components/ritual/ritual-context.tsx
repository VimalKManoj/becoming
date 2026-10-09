"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

// App-wide pieces of the Ritual design that any screen can call on: the capture sheet,
// the new-project sheet and the toast. The shell renders them once.

export type CaptureMode = "idea" | "task" | "project" | "assignment";
type Toast = { text: string; tone: "status" | "alert"; id: number };

type RitualContextValue = {
  capture: CaptureMode | null;
  openCapture: (mode?: CaptureMode) => void;
  closeCapture: () => void;
  newProject: boolean;
  openNewProject: () => void;
  closeNewProject: () => void;
  toast: Toast | null;
  showToast: (text: string, tone?: "status" | "alert") => void;
};

const RitualContext = createContext<RitualContextValue | null>(null);

export function RitualProvider({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState<CaptureMode | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);

  const showToast = useCallback((text: string, tone: "status" | "alert" = "status") => {
    counter.current += 1;
    setToast({ text, tone, id: counter.current });
  }, []);

  // A toast stays for 3.4 seconds, as in the prototype.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(current => (current?.id === toast.id ? null : current)), 3400);
    return () => clearTimeout(timer);
  }, [toast]);

  const value: RitualContextValue = {
    capture,
    openCapture: (mode = "idea") => { setNewProject(false); setCapture(mode); },
    closeCapture: () => setCapture(null),
    newProject,
    openNewProject: () => { setCapture(null); setNewProject(true); },
    closeNewProject: () => setNewProject(false),
    toast,
    showToast,
  };
  return <RitualContext.Provider value={value}>{children}</RitualContext.Provider>;
}

export function useRitual() {
  const value = useContext(RitualContext);
  if (!value) throw new Error("useRitual must be used inside RitualProvider");
  return value;
}

/** The toast itself; announced politely to screen readers. */
export function RitualToast() {
  const { toast } = useRitual();
  return <div role="status" aria-live="polite" className={toast ? "" : "sr-only"}>
    {toast && <div key={toast.id} className={`r-toast${toast.tone === "alert" ? " alert" : ""}`}><span className="r-dot" aria-hidden="true" />{toast.text}</div>}
  </div>;
}
