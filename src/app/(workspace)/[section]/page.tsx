import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CloudIdeasScreen } from "@/components/cloud-ideas-screen";
import { CloudJourneyScreen } from "@/components/cloud-journey-screen";
import { CloudSettingsScreen } from "@/components/cloud-settings-screen";
import { CloudTodayScreen } from "@/components/cloud-today-screen";
import { CloudWorkScreen } from "@/components/cloud-work-screen";
import { isWorkspaceSection, sectionDetails, workspaceSections } from "@/components/workspace-sections";

type Props = { params: Promise<{ section: string }> };

export function generateStaticParams() { return workspaceSections.filter(section => section !== "proof").map(section => ({ section })); }

// Each section gets its own tab title, e.g. "Today · Becoming", through the root title template.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return isWorkspaceSection(section) ? { title: sectionDetails[section].label } : {};
}

export default async function Page({ params }: Props) {
  const { section } = await params;
  if (!isWorkspaceSection(section)) notFound();
  switch (section) {
    case "today": return <CloudTodayScreen />;
    case "work": return <CloudWorkScreen />;
    case "ideas": return <CloudIdeasScreen />;
    case "journey": return <CloudJourneyScreen />;
    case "settings": return <CloudSettingsScreen />;
    // Proof lives inside Journey; next.config.ts redirects /proof (with its query) before this runs.
    case "proof": redirect("/journey?tab=proof");
  }
}
