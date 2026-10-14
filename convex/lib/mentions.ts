/** True when any string inside a value (an Inbox proposal, say) is one of these ids. */
export function mentions(value: unknown, ids: Set<string>): boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some(item => mentions(item, ids));
  if (value && typeof value === "object") return Object.values(value).some(item => mentions(item, ids));
  return false;
}
