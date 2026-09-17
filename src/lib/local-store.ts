"use client";
import { useSyncExternalStore } from "react";
import { workspaceSchema, type Workspace } from "@/domain/workspace";
import { createWorkspace } from "@/domain/seed";

const KEY = "form.workspace.v1";
type Snapshot = { data: Workspace | null; error: string | null };
const initial: Snapshot = { data: null, error: null };
let snapshot = initial;
let loaded = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(listener => listener()); }
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    snapshot = { data: raw ? workspaceSchema.parse(JSON.parse(raw)) : createWorkspace(), error: null };
  } catch {
    snapshot = { data: null, error: "Your saved workspace could not be loaded. It has not been overwritten. Check browser storage permissions or export the stored value before repairing it." };
  }
  loaded = true;
  emit();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) load();
  const sync = (event: StorageEvent) => { if (event.key === KEY) load(); };
  window.addEventListener("storage", sync);
  return () => { listeners.delete(listener); window.removeEventListener("storage", sync); };
}
export function updateWorkspace(change: (current: Workspace) => Workspace) {
  if (!snapshot.data) throw new Error("The workspace is not ready.");
  const next = workspaceSchema.parse(change(snapshot.data));
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error("The browser could not save this change. Free some storage or allow site storage, then try again."); }
  snapshot = { data: next, error: null };
  emit();
}
export function useWorkspace() { return useSyncExternalStore(subscribe, () => snapshot, () => initial); }
