// Weeks run Monday–Sunday in the person's own timezone. The key is that Monday's
// date (YYYY-MM-DD). Moved unchanged from the original local workspace rules for
// the weekly-commitment phase; nothing calls it yet.
export function weekKey(time: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(time);
  const part = (key: string) => Number(parts.find(p => p.type === key)!.value);
  const day = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
