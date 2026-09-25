import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Web app manifest (served at /manifest.webmanifest, linked automatically).
 * Makes PMRFP installable: home-screen icon, standalone window, and long-press
 * shortcuts. `id` is pinned to /app so a later start_url change doesn't make
 * browsers treat it as a different app. /app routes each person to their own
 * dashboard (see src/app/app/route.ts). Icons are generated from
 * public/brand/mark.svg.
 */
export default function manifest(): MetadataRoute.Manifest {
  const shortcutIcon = [{ src: "/icons/shortcut-96.png", sizes: "96x96", type: "image/png" }];
  return {
    id: "/app",
    name: "PMRFP: Commercial Property RFPs",
    short_name: "PMRFP",
    description: SITE.description,
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#282B59",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Open RFPs", short_name: "RFPs", url: "/rfps", icons: shortcutIcon },
      { name: "My RFP feed", short_name: "My feed", url: "/dashboard/rfps", icons: shortcutIcon },
      { name: "Post an RFP", short_name: "Post RFP", url: "/pm-dashboard/rfps/new", icons: shortcutIcon },
      { name: "Trade jobs", short_name: "Jobs", url: "/jobs", icons: shortcutIcon },
    ],
  };
}
