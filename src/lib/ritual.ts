// Small, pure helpers for the Ritual design's words: the date line, the greeting and the
// week line. Kept here so they're tested and say the same thing on every screen.

const weekdayShort = (date: Date) => date.toLocaleDateString("en-GB", { weekday: "long" }).slice(0, 3).toUpperCase();
const monthShort = (date: Date) => date.toLocaleDateString("en-GB", { month: "long" }).slice(0, 3).toUpperCase();

/** "THU · 24 SEP · 8:42 PM" in the browser's local time. */
export function dateLine(time: number) {
  const date = new Date(time);
  const clock = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toUpperCase();
  return `${weekdayShort(date)} · ${date.getDate()} ${monthShort(date)} · ${clock}`;
}

/** Whole days between two instants, by the browser's calendar. */
export function daysBetween(earlier: number, later: number) {
  const a = new Date(earlier), b = new Date(later);
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()), end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / 86_400_000);
}

/** The opening line: welcome back after a gap of three days or more, Sunday evenings named, otherwise the time of day. */
/** "Vimal K Manoj" → "Vimal". The app greets you by first name. */
export const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? "";

export function greeting({ now, name, lastSessionAt }: { now: number; name: string | null; lastSessionAt: number | null }) {
  const first = firstName(name);
  const who = first ? `, ${first}.` : ".";
  if (lastSessionAt === null) return first ? `Hello, ${first}.` : "Hello.";
  if (daysBetween(lastSessionAt, now) >= 3) return `Welcome back${who}`;
  const date = new Date(now), hour = date.getHours();
  if (date.getDay() === 0 && hour >= 17) return `Sunday evening${who}`;
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}${who}`;
}

/** The week's one-line status, as the design words it. */
export function weekLine({ count, target, streak, configured, paused }: { count: number; target: number | null; streak: number; configured: boolean; paused: boolean }) {
  if (paused) return "A planned pause. Your streak waits for you.";
  if (!configured || !target) return count ? `${count} ${count === 1 ? "session" : "sessions"} this week.` : "Your week starts with your first session.";
  if (count >= target) return `Week met. ${streak} ${streak === 1 ? "week" : "weeks"} in a row. Anything more is a bonus.`;
  const left = target - count;
  return `${left === 1 ? "One more makes" : `${left} more make`} the week. No rush.`;
}

/** "SUN · 52 MIN · MADE PROGRESS" for a saved session. */
export function sessionLine({ endedAt, startedAt, outcome }: { endedAt: number; startedAt: number | null; outcome: string }) {
  const minutes = startedAt ? Math.max(1, Math.round((endedAt - startedAt) / 60_000)) : null;
  return [weekdayShort(new Date(endedAt)), minutes ? `${minutes} MIN` : null, outcome.toUpperCase()].filter(Boolean).join(" · ");
}

/** "Last worked Sunday", "Resting for 2 weeks", "Not started yet". */
export function lastWorked(lastAt: number | null, now: number) {
  if (lastAt === null) return "Not started yet";
  const days = daysBetween(lastAt, now);
  if (days <= 0) return "Worked on today";
  if (days < 7) return `Last worked ${new Date(lastAt).toLocaleDateString("en-GB", { weekday: "long" })}`;
  const weeks = Math.floor(days / 7);
  return `Resting for ${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
