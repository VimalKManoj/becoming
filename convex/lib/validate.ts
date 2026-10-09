import { ConvexError } from "convex/values";

// Shared server-side input rules. Browser constraints help people fill forms in;
// these checks are the real boundary.

/** A trimmed http(s) link, or a ConvexError with the given message. */
export function httpUrl(value: string, message = "Add a valid HTTP or HTTPS link.") {
  const url = value.trim();
  let valid = false;
  try { valid = ["https:", "http:"].includes(new URL(url).protocol); } catch { /* Rejected below. */ }
  if (!valid || url.length > 2000) throw new ConvexError(message);
  return url;
}

/** Optional text with a maximum length; empty becomes undefined. */
export function optionalText(value: string | undefined, max: number, label: string) {
  const text = value?.trim() ?? "";
  if (text.length > max) throw new ConvexError(`Keep ${label} under ${max.toLocaleString("en-US")} characters.`);
  return text || undefined;
}

/** A calendar date "YYYY-MM-DD" that really exists. */
export function dateKeyValue(value: string, message = "Choose a valid date.") {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ConvexError(message);
  return value;
}

/** Up to `max` short, distinct tags such as skills. */
export function tagList(values: string[], max = 10, maxLength = 40) {
  const tags = [...new Set(values.map(value => value.trim()).filter(Boolean))];
  if (tags.length > max) throw new ConvexError(`Use up to ${max} tags.`);
  if (tags.some(tag => tag.length > maxLength)) throw new ConvexError(`Keep each tag under ${maxLength} characters.`);
  return tags;
}

/** A timezone name in IANA form, such as "Asia/Kolkata", "America/Argentina/Buenos_Aires" or "UTC". */
export function timezoneValue(value: string, message = "Choose a valid timezone.") {
  const zone = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,3}$/.test(zone) || zone.length > 64) throw new ConvexError(message);
  return zone;
}
