import type { ReactNode } from "react";

// Small building blocks of the Ember Glass design system (documents/DESIGN_SYSTEM.md).
// Colour is never the only signal: every lane and status also says its name.

export type Lane = "Projects" | "Showcases" | "Writing";
export type TaskStatusValue = "Ready" | "In progress" | "Blocked" | "Done" | "Archived";
export type ArtifactStatusValue = "Draft" | "Ready to share" | "Published";
export type WeekStatusValue = "met" | "missed" | "paused" | "in-progress" | "not-set";

const laneClass = (lane: Lane) => `lane-${lane.toLowerCase()}`;

export function LaneDot({ lane }: { lane: Lane }) {
  return <span className={`lane-dot ${laneClass(lane)}`} aria-hidden="true" />;
}

/** "● Projects · Becoming" — the lane, and optionally where the work belongs. */
export function LaneTag({ lane, detail, dark }: { lane: Lane; detail?: string | null; dark?: boolean }) {
  return <span className={`badge${dark ? " dark" : ""}`}><LaneDot lane={lane} />{lane}{detail ? ` · ${detail}` : ""}</span>;
}

const taskStatusClass: Record<TaskStatusValue, string> = {
  "Ready": "status-ready", "In progress": "status-progress", "Blocked": "status-blocked", "Done": "status-done", "Archived": "status-archived",
};

export function TaskStatus({ status, archivedFrom }: { status: TaskStatusValue; archivedFrom?: string }) {
  return <span className={`status ${taskStatusClass[status]}`}>{status === "Done" ? "✓ Done" : status === "Archived" && archivedFrom ? `Archived · was ${archivedFrom}` : status}</span>;
}

const artifactStatusClass: Record<ArtifactStatusValue, string> = { "Draft": "status-draft", "Ready to share": "status-shareable", "Published": "status-published" };

export function ArtifactStatus({ status }: { status: ArtifactStatusValue }) {
  return <span className={`status ${artifactStatusClass[status]}`}>{status === "Published" ? "Published ↗" : status}</span>;
}

const weekStatus: Record<WeekStatusValue, [string, string]> = {
  "met": ["status-met", "Met target"], "missed": ["status-missed", "Target missed"], "paused": ["status-pause", "Planned pause"],
  "in-progress": ["status-progress", "In progress"], "not-set": ["status-missed", "Before your rhythm"],
};

export function WeekStatus({ status }: { status: WeekStatusValue }) {
  const [className, label] = weekStatus[status];
  return <span className={`status ${className}`}>{label}</span>;
}

/** A pill switch between views. Each option is a toggle button, so the choice is announced. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(option => <button key={option.id} type="button" aria-pressed={option.id === value} onClick={() => onChange(option.id)}>{option.label}</button>)}
  </div>;
}

/** Eyebrow + content, the design's labelled block (e.g. DONE WHEN). */
export function Labelled({ label, children, variant }: { label: string; children: ReactNode; variant?: "dashed" | "inset" }) {
  return <div className={variant}><p className="eyebrow">{label}</p><div className="labelled-body">{children}</div></div>;
}
