import type { AuthConfig } from "convex/server";

// Connection checkpoint: no identity provider is enabled yet.
// Task functions still require authenticated identity and reject anonymous calls.
// The next auth step will register Better Auth's getAuthConfigProvider().
export default { providers: [] } satisfies AuthConfig;
