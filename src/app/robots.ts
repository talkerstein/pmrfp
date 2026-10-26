import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { BLOCKED_BOTS } from "@/lib/bot-guard";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/pm-dashboard", "/admin", "/onboarding", "/checkout", "/go/", "/out/"],
        // Bing, Yandex and others slow down to this many seconds between
        // requests. Googlebot ignores Crawl-delay (it is steered from Search
        // Console), so Google indexing is unaffected.
        crawlDelay: 2,
      },
      {
        // SEO-tool crawlers and bulk scrapers: they resell our pages and send
        // no visitors. (The proxy also refuses the ones that ignore this.)
        userAgent: [...BLOCKED_BOTS],
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
