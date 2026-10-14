import { defineConfig } from "vitest/config";
// Backend tests run real Convex functions in memory; the assistant (MCP) ones go through the
// whole HTTP handler and take a few seconds on a busy machine, so they get 20 seconds, not 5.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts", "convex/**/*.test.ts"], testTimeout: 20000 } });
