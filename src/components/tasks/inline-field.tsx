"use client";

import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

// A field edited where it's shown (PLAN-one-tap-and-daily-loop, Phase 1): the value is a
// quiet button; clicking it turns it into an input. Enter saves (Ctrl or ⌘+Enter in a
// longer field), Escape puts it back without closing the sheet around it.

type Props = {
  label: string;
  value: string;
  /** Shown, dimmed, when there's no value yet: what clicking it lets you add. */
  empty: string;
  multiline?: boolean;
  maxLength: number;
  /** Refuses an empty value (a title); otherwise empty clears the field. */
  required?: boolean;
  className?: string;
  /** How the saved value is displayed, when it isn't plain text. */
  display?: ReactNode;
  onSave: (value: string) => Promise<boolean>;
};

export function InlineField({ label, value, empty, multiline = false, maxLength, required = false, className = "", display, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("value") || "").trim();
    if (next === value.trim()) { setEditing(false); return; }
    if (required && !next) return;
    setBusy(true);
    try { if (await onSave(next)) setEditing(false); } finally { setBusy(false); }
  }
  function keys(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") { event.stopPropagation(); setEditing(false); }
    if (multiline && event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }

  if (!editing) return <button type="button" className={`tk-inline${value ? "" : " empty"} ${className}`} aria-label={`${label}: ${value || "not set"}. Edit`} onClick={() => setEditing(true)}>
    {value ? display ?? value : empty}
  </button>;
  return <form className="tk-inline-edit" onSubmit={save}>
    {multiline
      ? <textarea className="r-textarea w-textarea" name="value" aria-label={label} defaultValue={value} maxLength={maxLength} rows={3} autoFocus required={required} disabled={busy} onKeyDown={keys} />
      : <input className="r-input" name="value" aria-label={label} defaultValue={value} maxLength={maxLength} autoFocus required={required} disabled={busy} onKeyDown={keys} />}
    <div className="tk-inline-acts">
      <button type="submit" className="r-btn sm" style={{ height: 38 }} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="r-ghost sm" style={{ height: 38 }} disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      {multiline && <span className="r-small">Ctrl+Enter saves</span>}
    </div>
  </form>;
}

type ChoiceProps<T extends string | number> = {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  /** How the current value reads when it isn't being changed, e.g. "45 min". */
  display: string;
  onSave: (value: T) => Promise<boolean>;
};

/** A value picked from a few choices, shown as plain text until clicked (time, energy). */
export function ChoiceField<T extends string | number>({ label, value, options, display, onSave }: ChoiceProps<T>) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(next: T) {
    if (next === value) { setEditing(false); return; }
    setBusy(true);
    try { if (await onSave(next)) setEditing(false); } finally { setBusy(false); }
  }

  if (!editing) return <button type="button" className="tk-inline" aria-label={`${label}: ${display}. Change`} onClick={() => setEditing(true)}>{display}</button>;
  return <div className="tk-choices" role="group" aria-label={label} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setEditing(false); } }}>
    {options.map(option => <button key={String(option.value)} type="button" className="r-chip round h34" aria-pressed={option.value === value} disabled={busy} autoFocus={option.value === value} onClick={() => void pick(option.value)}>{option.label}</button>)}
    <button type="button" className="tk-menu-link" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
  </div>;
}
