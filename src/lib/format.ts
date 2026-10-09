// Small display helpers shared by Today, Journey and Proof. They format saved
// timestamps; none of them read the current time, so they are safe during render.

/** "Tue 30 Sep" in the person's own locale. */
export function formatDay(time: number) {
  return new Date(time).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Whole minutes between two timestamps, never negative. */
export function minutesBetween(start: number, end: number) {
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** "29 Sep" for a week key (its Monday), formatted without shifting the date. */
export function formatWeek(week: string) {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "1 session" / "3 sessions". */
export function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

/** ISO week number (1–53) of a local calendar date. */
export function isoWeek(date: Date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** The header's date lines: "THURSDAY · 24 SEPTEMBER · WEEK 39", "THU · 24 SEP" and "Thursday evening". */
export function dateLines(time: number) {
  const date = new Date(time);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const hour = date.getHours();
  const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "night";
  return {
    long: `${weekday} · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} · Week ${isoWeek(date)}`.toUpperCase(),
    // Three-letter month, as in the design (en-GB would write "Sept").
    short: `${weekday.slice(0, 3)} · ${date.getDate()} ${date.toLocaleDateString("en-GB", { month: "long" }).slice(0, 3)}`.toUpperCase(),
    part: `${weekday} ${part}`,
  };
}

/** Splits a motive so its last word can carry the design's ember emphasis. */
export function emphasiseLast(text: string) {
  const trimmed = text.trim();
  const at = trimmed.lastIndexOf(" ");
  return at < 0 ? { before: "", emphasis: trimmed } : { before: trimmed.slice(0, at + 1), emphasis: trimmed.slice(at + 1) };
}
