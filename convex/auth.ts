import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { emailVerificationRequired, resetMessage, sendEmail, verificationMessage } from "./lib/email";
import { requireOwner } from "./lib/ownership";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

// Google sign-in turns on only when its OAuth client is set on this deployment
// (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Convex dashboard); see AUTH_SETUP.md.
const google = () => process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
  : undefined;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth({
  appName: "Becoming",
  baseURL: process.env.SITE_URL!,
  database: authComponent.adapter(ctx),
  emailAndPassword: {
    enabled: true,
    // A new account confirms its email before it can sign in; the link arrives by email
    // (lib/email.ts). Forgotten passwords are reset by an emailed link.
    requireEmailVerification: emailVerificationRequired(),
    minPasswordLength: 12,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => sendEmail(user.email, resetMessage(user.name, url)),
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: emailVerificationRequired(),
    // Signing in before confirming sends a fresh link.
    sendOnSignIn: emailVerificationRequired(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => sendEmail(user.email, verificationMessage(user.name, url)),
  },
  socialProviders: google(),
  // Google confirms the address, so signing in with Google joins an existing account
  // with the same email instead of making a second one.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  // Account deletion from Settings. The app deletes workspace data first (while the
  // person is still signed in to Convex), then calls this with their password.
  user: { deleteUser: { enabled: true } },
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

/** Which ways to sign in this deployment offers, so the sign-in screen only shows working ones. */
export const signInOptions = query({
  args: {},
  handler: async () => ({ google: Boolean(google()) }),
});
