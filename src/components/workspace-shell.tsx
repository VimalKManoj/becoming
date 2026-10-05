"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { isWorkspaceSection, sectionDetails, type WorkspaceSection } from "@/components/workspace-sections";

// The (workspace) layout renders this once. Because layouts persist across
// navigation, the sidebar, its motive subscription and the sign-in check survive
// moving between sections; only the page content below changes.
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const segment = usePathname().split("/")[1] ?? "";
  const section = isWorkspaceSection(segment) ? segment : null;
  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <WorkspaceSidebar section={section} />
    <main id="main" className="main">
      <header className="topbar"><span className="eyebrow">Personal workspace{section && ` / ${section}`}</span><Link href="/account">Account</Link></header>
      {section && <p className="mode-note">{sectionDetails[section].note}</p>}
      {/* An unknown address can only render the workspace not-found message, which
          holds no private data, so it shows without the sign-in check. If a new route
          is added under (workspace), add it to workspaceSections so it stays gated. */}
      {section ? <SignedInOnly section={section}>{children}</SignedInOnly> : children}
    </main>
  </div>;
}

// Private data renders only after both Better Auth and Convex confirm the person.
function SignedInOnly({ section, children }: { section: WorkspaceSection; children: ReactNode }) {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const details = sectionDetails[section];

  if (isPending || (session && isLoading)) return <p role="status">Opening your private workspace…</p>;
  if (error) return <div className="stack"><p role="alert">Could not check your session.</p><button onClick={() => void refetch()}>Try again</button></div>;
  if (!session) return <section className="panel empty stack">
    <h1>{details.signedOutTitle}</h1>
    <p className="muted">{details.signedOutDetail}</p>
    <Link className="button-link" href="/account">Open account</Link>
  </section>;
  if (!isAuthenticated) return <div className="stack"><p role="status">Confirming your account…</p><Link href="/account">Check account status</Link></div>;
  return children;
}
