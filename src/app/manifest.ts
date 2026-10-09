import type { MetadataRoute } from "next";

// Makes Becoming installable ("Add to Home Screen"). On iPhone, notifications only work
// for an installed web app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Becoming",
    short_name: "Becoming",
    description: "Turn ideas and focused evenings into work you can show.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#0B0908",
    theme_color: "#0B0908",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512&maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
