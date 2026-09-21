"use client";

import { useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!));
  return <ConvexBetterAuthProvider
    client={client}
    // @ts-expect-error Upstream session inference bug: https://github.com/get-convex/better-auth/issues/420. Remove when fixed.
    authClient={authClient}
  >
    {children}
  </ConvexBetterAuthProvider>;
}
