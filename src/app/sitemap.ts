import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { listRfps } from "@/lib/data/rfps";
import { listVendors } from "@/lib/data/directory";
import { listResources } from "@/lib/data/resources";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");
  const now = new Date();

  const staticPaths: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, freq: "weekly" },
    { path: "/for-trades", priority: 0.9, freq: "monthly" },
    { path: "/for-property-managers", priority: 0.9, freq: "monthly" },
    { path: "/directory", priority: 0.8, freq: "weekly" },
    { path: "/rfps", priority: 0.8, freq: "daily" },
    { path: "/pricing", priority: 0.9, freq: "monthly" },
    { path: "/resources", priority: 0.7, freq: "weekly" },
    { path: "/contact", priority: 0.5, freq: "yearly" },
    { path: "/terms", priority: 0.3, freq: "yearly" },
    { path: "/privacy", priority: 0.3, freq: "yearly" },
    { path: "/disclaimer", priority: 0.3, freq: "yearly" },
  ];

  const [rfps, vendors, resources] = await Promise.all([
    listRfps().catch(() => []),
    listVendors().catch(() => []),
    listResources().catch(() => []),
  ]);

  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  for (const r of rfps) entries.push({ url: `${base}/rfps/${r.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const v of vendors) entries.push({ url: `${base}/directory/${v.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const a of resources) entries.push({ url: `${base}/resources/${a.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });

  return entries;
}
