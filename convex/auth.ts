import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireOwner } from "./lib/ownership";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth({
  appName: "Becoming",
  baseURL: process.env.SITE_URL!,
  database: authComponent.adapter(ctx),
  emailAndPassword: {
    enabled: true,
    // Development checkpoint only. Configure email delivery before production.
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [convex({ authConfig })],
});

// An actual authenticated Convex query, not just a browser session indicator.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null; // Revoked sessions are an expected sign-out state.
    await requireOwner(ctx);
    return { name: user.name, email: user.email };
  },
});
