import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Form — a practice worth building", description: "Turn ideas and focused sessions into a design-engineering portfolio." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
