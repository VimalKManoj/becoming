import { ConvexError } from "convex/values";

// Server functions throw ConvexError("…") for problems a person can fix, and the
// Convex client re-throws them with that message as `data`. Anything else (a bug,
// a malformed request) gets a calm fallback rather than raw technical text.
export function readableError(error: unknown, fallback = "Could not save. Please try again.") {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return fallback;
}
