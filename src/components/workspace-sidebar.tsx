import Link from "next/link";
import { ImageIcon, Layers, Leaf, Lightbulb, Settings, Sprout, Sun } from "lucide-react";

export type WorkspaceSection = "today" | "work" | "ideas" | "proof" | "journey" | "settings";

const navigation = [
  { href: "today", label: "Today", icon: Sun },
  { href: "work", label: "Work", icon: Layers },
  { href: "ideas", label: "Ideas", icon: Lightbulb },
  { href: "proof", label: "Proof", icon: ImageIcon },
  { href: "journey", label: "Journey", icon: Sprout },
  { href: "settings", label: "Settings", icon: Settings },
] as const;

export function WorkspaceSidebar({ section, northStar }: { section: WorkspaceSection; northStar?: string }) {
  return <aside className="sidebar">
    <Link href="/today" className="brand"><Leaf aria-hidden="true" />form.</Link>
    <nav aria-label="Main navigation">
      {navigation.map(item => <Link key={item.href} href={`/${item.href}`} aria-current={section === item.href ? "page" : undefined}>
        <item.icon size={17} aria-hidden="true" />{item.label}
      </Link>)}
    </nav>
    {northStar && <div className="north-star">
      <p className="eyebrow">Your north star</p>
      <p>{northStar}</p>
      <span className="muted">One useful session at a time.</span>
    </div>}
  </aside>;
}
