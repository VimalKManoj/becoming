import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { endpoint, notAllowed, preflight } from "./mcp";
import { pushLine } from "./reminders";

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
// Becoming for assistants (MCP): https://<deployment>.convex.site/mcp, with a token from Settings.
http.route({ path: "/mcp", method: "POST", handler: endpoint });
http.route({ path: "/mcp", method: "OPTIONS", handler: preflight });
http.route({ path: "/mcp", method: "GET", handler: notAllowed });
// The evening reminder push: the service worker asks for its words (pushes carry no payload).
http.route({ path: "/reminder-line", method: "POST", handler: pushLine });
http.route({ path: "/reminder-line", method: "OPTIONS", handler: pushLine });
export default http;
