// Calendar maths in a person's own timezone. Weeks run Monday to Sunday and are
// named by that Monday's date ("2026-09-28"). These functions use the browser's
// Intl timezone data and run mostly on the client. The server uses them only to
// double-check a week key, and only when its runtime supports that timezone
// (rhythm.assertCurrentWeek falls back to a wider check otherwise).

export const DAY = 86_400_000;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(time: number, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(time);
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second") };
}

/** Local date ("YYYY-MM-DD") of an instant in a timezone. */
export function dayKey(time: number, timeZone: string): string {
  const { year, month, day } = zonedParts(time, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Monday-start week key of an instant in a timezone. */
export function weekKey(time: number, timeZone: string): string {
  const key = dayKey(time, timeZone);
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(key, -((weekday + 6) % 7));
}

/** Pure calendar arithmetic on a date key; no timezone involved. */
export function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A real calendar date that falls on a Monday. */
export function isWeekKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

// How far a timezone is ahead of UTC at an instant, in milliseconds.
function offsetAt(time: number, timeZone: string) {
  const p = zonedParts(time, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(time / 1000) * 1000;
}

/** The UTC instant when a local date begins (its first moment, if midnight is skipped by daylight saving). */
export function zonedStartOfDay(key: string, timeZone: string): number {
  const utcMidnight = Date.parse(`${key}T00:00:00Z`);
  const guess = utcMidnight - offsetAt(utcMidnight, timeZone);
  // A second pass corrects the rare case where the offset changes between the guess and midnight.
  return utcMidnight - offsetAt(guess, timeZone);
}

/** [start, end) UTC instants of a week in a timezone. Daylight-saving weeks are 167 or 169 hours long. */
export function weekRange(week: string, timeZone: string) {
  return { start: zonedStartOfDay(week, timeZone), end: zonedStartOfDay(addDays(week, 7), timeZone) };
}

/** Whether a timezone name is supported by this runtime's Intl data. */
export function isSupportedTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; }
}
