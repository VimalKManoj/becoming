// One place for each section's name and copy. Navigation, the shell and page titles read
// from here. The Ritual design has four places plus Settings (from your avatar); the old
// /proof address now opens Journey's Proof tab.
export const workspaceSections = ["today", "work", "ideas", "journey", "settings", "proof"] as const;
export type WorkspaceSection = typeof workspaceSections[number];

/** The four places in the rail and the phone pill, in order. */
export const navSections = ["today", "work", "ideas", "journey"] as const;
export type NavSection = typeof navSections[number];

type SectionDetails = { label: string; signedOutTitle: string; signedOutDetail: string };

export const sectionDetails: Record<WorkspaceSection, SectionDetails> = {
  today: { label: "Today", signedOutTitle: "Sign in to plan tonight.", signedOutDetail: "Your work and focus sessions belong to your Becoming account." },
  work: { label: "Work", signedOutTitle: "Sign in to see your work.", signedOutDetail: "Your projects and tasks are private to your account." },
  ideas: { label: "Ideas", signedOutTitle: "Sign in to keep your ideas.", signedOutDetail: "Your notebook belongs to your Becoming account." },
  journey: { label: "Journey", signedOutTitle: "Sign in to see your journey.", signedOutDetail: "Your sessions, bloom and proof belong to your account." },
  settings: { label: "Settings", signedOutTitle: "Sign in to set your direction.", signedOutDetail: "Your settings are private to your account." },
  proof: { label: "Proof", signedOutTitle: "Sign in to see your proof.", signedOutDetail: "Your evidence belongs to your Becoming account." },
};

export function isWorkspaceSection(value: string): value is WorkspaceSection {
  return (workspaceSections as readonly string[]).includes(value);
}
