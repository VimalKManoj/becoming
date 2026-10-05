"use client";

import Link from "next/link";
import { Leaf } from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { sectionDetails, workspaceSections, type WorkspaceSection } from "@/components/workspace-sections";

export function WorkspaceSidebar({ section }: { section: WorkspaceSection | null }) {
  const { isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.settings.getProfile, isAuthenticated ? {} : "skip");
  return <aside className="sidebar">
    <Link href="/today" className="brand"><Leaf aria-hidden="true" />becoming.</Link>
    <nav aria-label="Main navigation">
      {workspaceSections.map(id => {
        const { label, icon: Icon } = sectionDetails[id];
        return <Link key={id} href={`/${id}`} aria-current={section === id ? "page" : undefined}>
          <Icon size={17} aria-hidden="true" />{label}
        </Link>;
      })}
    </nav>
    {isAuthenticated && profile !== undefined && <div className="north-star">
      <p className="eyebrow">Your north star</p>
      {profile?.motive ? <><p>{profile.motive}</p><span className="muted">One useful session at a time.</span></> : <Link href="/settings">Set your motive in Settings</Link>}
    </div>}
  </aside>;
}
