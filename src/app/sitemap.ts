import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { listRfps } from "@/lib/data/rfps";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { winnersFromRfps } from "@/lib/data/winners";
import { listVendors } from "@/lib/data/directory";
import { listResources } from "@/lib/data/resources";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listQualifyingCombos } from "@/lib/data/trade-city";
import { listCaseStudies } from "@/lib/data/case-studies";
import { COMPETITORS } from "@/lib/seo/competitors";
import { VERTICALS } from "@/lib/seo/verticals";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";

// The RFP board now refreshes daily from the public-tender feed; without
// this the page was frozen at build time and showed stale open counts
// (and the sitemap missed every new tender) until the next deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const now = new Date();

  const staticPaths: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, freq: "weekly" },
    { path: "/for-trades", priority: 0.9, freq: "monthly" },
    { path: "/for-property-managers", priority: 0.9, freq: "monthly" },
    { path: "/directory", priority: 0.8, freq: "weekly" },
    { path: "/suppliers", priority: 0.8, freq: "weekly" },
    { path: "/rfps", priority: 0.8, freq: "daily" },
    { path: "/pricing", priority: 0.9, freq: "monthly" },
    { path: "/resources", priority: 0.7, freq: "weekly" },
    { path: "/resources/how-to-post-a-quality-rfp", priority: 0.7, freq: "monthly" },
    { path: "/resources/how-to-write-a-commercial-property-maintenance-rfp", priority: 0.7, freq: "monthly" },
    { path: "/badge", priority: 0.5, freq: "monthly" },
    { path: "/services-for-trades", priority: 0.5, freq: "monthly" },
    { path: "/about", priority: 0.5, freq: "monthly" },
    { path: "/trades", priority: 0.8, freq: "weekly" },
    { path: "/regions", priority: 0.8, freq: "weekly" },
    { path: "/vs", priority: 0.7, freq: "monthly" },
    { path: "/for", priority: 0.7, freq: "monthly" },
    { path: "/cost-guides", priority: 0.7, freq: "monthly" },
    { path: "/rfp-templates", priority: 0.8, freq: "monthly" },
    { path: "/rfp-writer", priority: 0.9, freq: "monthly" },
    { path: "/case-studies", priority: 0.7, freq: "weekly" },
    { path: "/get-found", priority: 0.8, freq: "monthly" },
    { path: "/refer-a-project", priority: 0.9, freq: "monthly" },
    { path: "/contact", priority: 0.5, freq: "yearly" },
    { path: "/terms", priority: 0.3, freq: "yearly" },
    { path: "/privacy", priority: 0.3, freq: "yearly" },
    { path: "/disclaimer", priority: 0.3, freq: "yearly" },
  ];

  const [rfps, vendors, resources, categories, regions, tradeCityCombos, caseStudies] = await Promise.all([
    listRfps().catch(() => []),
    listVendors().catch(() => []),
    listResources().catch(() => []),
    getCategories().catch(() => []),
    getRegions().catch(() => []),
    listQualifyingCombos().catch(() => []),
    listCaseStudies().catch(() => []),
  ]);

  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  entries.push({ url: `${base}/contract-winners`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
  entries.push({ url: `${base}/reports/public-building-contracts`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
  for (const w of winnersFromRfps(rfps)) entries.push({ url: `${base}/contract-winners/${w.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  // Only open RFPs are indexable (see isIndexableRfp); everything else stays out.
  for (const r of rfps.filter(isIndexableRfp)) entries.push({ url: `${base}/rfps/${r.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const v of vendors) entries.push({ url: `${base}/directory/${v.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const a of resources) entries.push({ url: `${base}/resources/${a.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  // Same thin-content guard as the trade page: a trade with no companies and no
  // RFPs is noindexed there, so it must not be in the sitemap either.
  for (const c of categories) {
    const hasContent = vendors.some((v) => v.categories.includes(c.name)) || rfps.some((r) => r.categories.includes(c.name));
    if (hasContent) entries.push({ url: `${base}/trades/${c.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  }
  for (const rg of regions) entries.push({ url: `${base}/regions/${rg.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  // Trade×city pages exist only for combos that clear the vendor gate, so the
  // sitemap stays in lockstep with what actually renders.
  for (const tc of tradeCityCombos) entries.push({ url: `${base}/trades/${tc.category.slug}/${tc.region.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const cs of caseStudies) entries.push({ url: `${base}/case-studies/${cs.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const c of COMPETITORS) entries.push({ url: `${base}/vs/${c.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const v of VERTICALS) entries.push({ url: `${base}/for/${v.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  for (const g of COST_GUIDES) entries.push({ url: `${base}/cost-guides/${g.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  for (const t of RFP_TEMPLATES) entries.push({ url: `${base}/rfp-templates/${t.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });

  return entries;
}
