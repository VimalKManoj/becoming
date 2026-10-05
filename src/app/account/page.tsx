import type { Metadata } from "next";
import Link from "next/link";
import { AccountScreen } from "@/components/account-screen";

export const metadata: Metadata = { title: "Account" };

// The root layout already provides the shared Convex + Better Auth client.
export default function AccountPage() {
  return <main className="standalone panel stack">
    <Link href="/today">← Back to workspace</Link>
    <div><p className="eyebrow">Becoming · Account</p><h1>A place to begin.</h1></div>
    <p className="notice">Development sign-in. Your tasks, ideas, sessions, evidence and motive are saved privately to this account.</p>
    <AccountScreen />
    <p className="small muted">Email verification and password recovery are not set up yet. Use a development account and a unique password.</p>
  </main>;
}
