"use client";

import type { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const configured = Boolean(convexUrl && process.env.NEXT_PUBLIC_CONVEX_SITE_URL);

// One client for the whole browser tab. The root layout mounts this provider once,
// so moving between sections keeps the same connection and signed-in state instead
// of opening a new connection (and re-checking auth) on every navigation.
const client = configured ? new ConvexReactClient(convexUrl!) : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!client) return <main className="standalone panel stack">
    <h1>Account setup is incomplete.</h1>
    <p>Follow documents/AUTH_SETUP.md to connect your development backend, then restart the dev server.</p>
  </main>;
  return <ConvexBetterAuthProvider
    client={client}
    // @ts-expect-error Upstream session inference bug: https://github.com/get-convex/better-auth/issues/420. Remove when fixed.
    authClient={authClient}
  >
    {children}
  </ConvexBetterAuthProvider>;
}
