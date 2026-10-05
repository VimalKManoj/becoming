import { WorkspaceShell } from "@/components/workspace-shell";

// A route group: "(workspace)" adds no URL segment, so /today, /work and the others
// keep their addresses while sharing this layout. Layouts persist across navigation.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
