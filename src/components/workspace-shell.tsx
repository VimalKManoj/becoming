"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useConvexAuth, useConvexConnectionState } from "convex/react";
import { authClient } from "@/lib/auth-client";
import { CaptureSheet } from "@/components/ritual/capture-sheet";
import { Embers } from "@/components/ritual/embers";
import { NewProjectSheet } from "@/components/ritual/new-project-sheet";
import { RitualProvider, RitualToast } from "@/components/ritual/ritual-context";
import { Skeleton, Bone } from "@/components/skeleton";
import { Avatar, PillNav, Rail } from "@/components/workspace-nav";
import { isWorkspaceSection, sectionDetails, type WorkspaceSection } from "@/components/workspace-sections";

// The (workspace) layout renders this once, so navigation, the capture sheet and the
// sign-in check survive moving between sections; only the page content changes.
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const segment = usePathname().split("/")[1] ?? "";
  const section = isWorkspaceSection(segment) ? segment : null;
  const { isAuthenticated } = useConvexAuth();
  return <RitualProvider>
    <div className="r-app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Rail section={section} signedIn={isAuthenticated} />
      <div className="r-main">
        <Embers />
        {isAuthenticated && <Avatar section={section} mobile />}
        <main id="main" className="r-scroll">
          {/* An unknown address only renders the not-found message, which holds no private data. */}
          {section ? <SignedInOnly section={section}>{children}</SignedInOnly> : children}
        </main>
        <PillNav section={section} signedIn={isAuthenticated} />
      </div>
      {isAuthenticated && <><CaptureSheet /><NewProjectSheet /></>}
      <RitualToast />
    </div>
  </RitualProvider>;
}

// Private data renders only after both Better Auth and Convex confirm the person.
function SignedInOnly({ section, children }: { section: WorkspaceSection; children: ReactNode }) {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const details = sectionDetails[section];

  if (isPending || (session && isLoading) || (session && !isAuthenticated)) return <OpeningSkeleton />;
  if (error) return <div className="r-col r-top" style={{ gap: 14 }}><p role="alert" className="r-body">Could not check your session.</p><button className="r-ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => void refetch()}>Try again</button></div>;
  if (!session) return <section className="r-col r-top r-rise" style={{ gap: 18, alignItems: "flex-start" }}>
    <span className="r-orb" aria-hidden="true" style={{ width: 56, height: 56, animation: "r-breathe 6s ease-in-out infinite" }} />
    <h1 className="r-greet" style={{ marginTop: 0 }}>{details.signedOutTitle.replace(/\.$/, "")}<em>.</em></h1>
    <p className="r-lede">{details.signedOutDetail}</p>
    <Link className="r-btn" href="/account">Sign in or create an account</Link>
  </section>;
  return <><ConnectionNote />{children}</>;
}

/** While the account is checked: the shape of a page header and two cards, breathing. */
function OpeningSkeleton() {
  return <Skeleton label="Opening your private workspace…" className="r-col r-top">
    <div className="r-stack" style={{ gap: 12 }} aria-hidden="true">
      <Bone w={180} h={12} /><Bone w="70%" h={52} i={1} className="bone-title" /><Bone w="45%" h={16} i={2} />
      <Bone h={120} shape="block" i={3} className="r-skel-card" /><Bone h={220} shape="block" i={4} className="r-skel-card" />
    </div>
  </Skeleton>;
}

// Convex keeps working through a dropped connection: queued changes are sent when it
// returns. This says so, instead of leaving a "Saving…" button unexplained.
function ConnectionNote() {
  const { hasEverConnected, isWebSocketConnected, hasInflightRequests } = useConvexConnectionState();
  const offline = hasEverConnected && !isWebSocketConnected;
  return <p role="status" className={offline ? "r-card soft r-small" : "sr-only"} style={offline ? { maxWidth: 620, margin: "0 auto 16px" } : undefined}>
    {offline ? (hasInflightRequests ? "You're offline. Your latest changes will be saved when the connection returns." : "You're offline. You can keep reading; changes will be saved when the connection returns.") : ""}
  </p>;
}
