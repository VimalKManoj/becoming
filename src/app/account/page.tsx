import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import { AccountScreen } from "@/components/account-screen";

export default function AccountPage() {
  return <main className="standalone panel stack">
    <Link href="/today">← Back to local workspace</Link>
    <div><p className="eyebrow">Becoming · Account</p><h1>A place to begin.</h1></div>
    <p className="notice">Development sign-in. Your tasks still live in this browser and are shared across accounts on this device. Signing out does not clear them.</p>
    {process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_CONVEX_SITE_URL
      ? <AuthProvider><AccountScreen /></AuthProvider>
      : <p role="status">Account setup is incomplete. Follow documents/AUTH_SETUP.md to connect your development backend.</p>}
    <p className="small muted">Email verification and password recovery are not set up yet. Use a development account and a unique password.</p>
  </main>;
}
