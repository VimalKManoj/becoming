import { notFound } from "next/navigation";
import { WorkspaceScreen } from "@/components/workspace-screen";
const sections = ["today", "work", "ideas", "proof", "journey", "settings"] as const;
export function generateStaticParams() { return sections.map(section => ({ section })); }
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as typeof sections[number])) notFound();
  return <WorkspaceScreen section={section as typeof sections[number]} />;
}
