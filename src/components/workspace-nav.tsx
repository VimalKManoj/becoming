"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useRitual } from "@/components/ritual/ritual-context";
import { navSections, sectionDetails, type WorkspaceSection } from "@/components/workspace-sections";

// The Ritual design's navigation: a 92px rail on desktop (orb, capture, four places,
// your avatar) and a floating pill on phones (Today, Work, capture, Ideas, Journey).

function Glyph({ section }: { section: string }) {
  return <span className={`r-glyph r-glyph-${section}`} aria-hidden="true" />;
}

const current = (section: WorkspaceSection | null, id: string) => section === id || (id === "journey" && section === "proof");

export function Avatar({ section, mobile }: { section: WorkspaceSection | null; mobile?: boolean }) {
  const { data: session } = authClient.useSession();
  const initial = session?.user.name?.trim()[0]?.toUpperCase() ?? "";
  return <Link href="/settings" className={`r-avatar${mobile ? " r-avatar-mobile" : ""}`} aria-label="Settings and account" aria-current={section === "settings" ? "page" : undefined}>{initial || "·"}</Link>;
}

export function Rail({ section, signedIn }: { section: WorkspaceSection | null; signedIn: boolean }) {
  const { openCapture } = useRitual();
  return <aside className="r-rail">
    <Link href="/today" aria-label="Becoming — Today"><span className="r-orb" aria-hidden="true" /></Link>
    {signedIn && <button type="button" className="r-rail-capture" aria-label="Capture an idea, task or project" onClick={() => openCapture("idea")}>+</button>}
    <nav aria-label="Main navigation" className="r-stack" style={{ gap: 8 }}>
      {navSections.map(id => <Link key={id} href={`/${id}`} className="r-nav" aria-current={current(section, id) ? "page" : undefined}>
        <span className="r-nav-box"><Glyph section={id} /></span><span className="r-nav-label">{sectionDetails[id].label}</span>
      </Link>)}
    </nav>
    {signedIn && <Avatar section={section} />}
  </aside>;
}

export function PillNav({ section, signedIn }: { section: WorkspaceSection | null; signedIn: boolean }) {
  const { openCapture } = useRitual();
  const item = (id: (typeof navSections)[number]) => <Link key={id} href={`/${id}`} aria-current={current(section, id) ? "page" : undefined} aria-label={sectionDetails[id].label}>
    <Glyph section={id} /><span className="r-pill-label">{sectionDetails[id].label}</span>
  </Link>;
  return <>
    <div className="r-pill-fade" aria-hidden="true" />
    <nav className="r-pill" aria-label="Main navigation">
      {item("today")}{item("work")}
      {signedIn && <button type="button" className="r-pill-capture" aria-label="Capture an idea, task or project" onClick={() => openCapture("idea")}>+</button>}
      {item("ideas")}{item("journey")}
    </nav>
  </>;
}
