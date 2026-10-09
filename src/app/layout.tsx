import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
import "../styles/ritual.css";
import "../styles/today.css";
import "../styles/work.css";
import "../styles/ideas.css";
import "../styles/proof.css";
import "../styles/journey.css";
import "../styles/settings.css";
import "../styles/constellation.css";

// Three families (documents/DESIGN_SYSTEM.md): Bricolage Grotesque for intent (headlines,
// questions, titles), Geist for the interface, Geist Mono for time, counts and dates. The
// latin files (all SIL Open Font License) are served by the app itself, so nothing is
// fetched from a font service at build or run time.
const geist = localFont({ src: [{ path: "./fonts/geist-latin.woff2", weight: "300 600", style: "normal" }], variable: "--font-geist", display: "swap" });
const geistMono = localFont({ src: [{ path: "./fonts/geist-mono-latin.woff2", weight: "400 500", style: "normal" }], variable: "--font-geist-mono", display: "swap" });
const bricolage = localFont({ src: [{ path: "./fonts/bricolage-grotesque-latin.woff2", weight: "200 800", style: "normal" }], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Becoming", template: "%s · Becoming" },
  description: "Turn ideas and focused evenings into work you can show.",
  // Installed on a phone's Home Screen, it opens like an app (needed for iPhone notifications).
  appleWebApp: { capable: true, title: "Becoming", statusBarStyle: "black-translucent" },
  icons: { icon: "/pwa-icon?size=48", apple: "/pwa-icon?size=180" },
};

export const viewport: Viewport = { themeColor: "#12100F", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geist.variable} ${geistMono.variable} ${bricolage.variable}`}>
    <body><AuthProvider>{children}</AuthProvider></body>
  </html>;
}
