import { ImageIcon, Layers, Lightbulb, Settings, Sprout, Sun, type LucideIcon } from "lucide-react";

// One place for each section's name, icon and copy. The sidebar, the shared
// shell and the page titles all read from here, so a rename happens once.
export const workspaceSections = ["today", "work", "ideas", "proof", "journey", "settings"] as const;
export type WorkspaceSection = typeof workspaceSections[number];

type SectionDetails = {
  label: string;
  icon: LucideIcon;
  /** A short orientation line under the top bar. */
  note: string;
  signedOutTitle: string;
  signedOutDetail: string;
};

export const sectionDetails: Record<WorkspaceSection, SectionDetails> = {
  today: {
    label: "Today", icon: Sun,
    note: "Your time and energy choice only shapes tonight's suggestion. It isn't saved.",
    signedOutTitle: "Sign in to plan today.", signedOutDetail: "Your work and focus sessions belong to your Becoming account.",
  },
  work: {
    label: "Work", icon: Layers,
    note: "Ready and in-progress tasks can appear in Today. Blocked, done and archived tasks never do.",
    signedOutTitle: "Sign in to see your work.", signedOutDetail: "Your tasks are private to your Becoming account.",
  },
  ideas: {
    label: "Ideas", icon: Lightbulb,
    note: "Capturing an idea never adds work to Today. Make it active when you're ready.",
    signedOutTitle: "Sign in to keep your ideas.", signedOutDetail: "Your notebook belongs to your Becoming account.",
  },
  proof: {
    label: "Proof", icon: ImageIcon,
    note: "Evidence links from your sessions appear here as private drafts. Nothing is published automatically.",
    signedOutTitle: "Sign in to see your proof.", signedOutDetail: "Your evidence belongs to your Becoming account.",
  },
  journey: {
    label: "Journey", icon: Sprout,
    note: "Every saved session appears here. Counts cover the sessions shown below.",
    signedOutTitle: "Sign in to see your journey.", signedOutDetail: "Your contributions belong to your Becoming account.",
  },
  settings: {
    label: "Settings", icon: Settings,
    note: "Your settings are private to your account.",
    signedOutTitle: "Sign in to set your direction.", signedOutDetail: "Your motive belongs to your Becoming account.",
  },
};

export function isWorkspaceSection(value: string): value is WorkspaceSection {
  return (workspaceSections as readonly string[]).includes(value);
}
