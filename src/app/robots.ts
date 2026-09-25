import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/pm-dashboard", "/admin", "/onboarding", "/go/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
