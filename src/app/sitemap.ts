import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { listRfps } from "@/lib/data/rfps";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { indexableWinners } from "@/lib/data/winners";
import { monthlyAwards, reportMonths } from "@/lib/data/monthly-winners";
import { torontoToday } from "@/lib/data/monthly-winners-load";
import { listVendors } from "@/lib/data/directory";
import { listResources } from "@/lib/data/resources";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listQualifyingCombos } from "@/lib/data/trade-city";
import { listCaseStudies } from "@/lib/data/case-studies";
import { benchmarkAwards, benchmarkCombos, provinceSlug } from "@/lib/data/price-benchmarks";
import { COMPETITORS } from "@/lib/seo/competitors";
import { VERTICALS } from "@/lib/seo/verticals";
import { COST_GUIDES } from "@/lib/seo/cost-guides";
import { RFP_TEMPLATES } from "@/lib/seo/rfp-templates";
import { listOpenJobs } from "@/lib/jobs/data";
import { listIndexableThreads } from "@/lib/forum/data";
import { FORUM_CATEGORY_SLUGS, isFrenchForum } from "@/lib/forum/categories";
import { listActiveListings } from "@/lib/marketplace/data";
import { CATEGORIES, landingIndexable } from "@/lib/marketplace/rules";
import { getTorontoIndexSafe, torontoContractSlugsForSitemap } from "@/lib/data/toronto-awards";
import { PROVINCES } from "@/lib/data/province-hub";
import { getMajorProjects } from "@/lib/major-projects/data";
import { isThinProject } from "@/lib/major-projects/filters";
import { FOUNDING_PATH } from "@/lib/founding/config";
import { intelAwards } from "@/lib/intel/model";
import { indexableMarkets } from "@/lib/insights/market";
import { insightsMarketPath } from "@/lib/insights/paths";
import { loadBuyers } from "@/lib/buyers/load";
import { isIndexableBuyer } from "@/lib/buyers/model";

/** Toronto supplier pages in the sitemap: indexable ones only, biggest first. */
const TORONTO_SITEMAP_LIMIT = 2000;
/** Above this many URLs the single sitemap should become a sitemap index. */
const SITEMAP_SPLIT_AT = 45_000;
import { localizePath } from "@/i18n/config";
import { translationsOf } from "@/i18n/translated";

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
    { path: "/become-a-supplier", priority: 0.8, freq: "monthly" },
    { path: "/rfps", priority: 0.8, freq: "daily" },
    { path: "/jobs", priority: 0.8, freq: "daily" },
    { path: "/talent", priority: 0.6, freq: "daily" },
    { path: "/marketplace", priority: 0.7, freq: "daily" },
    { path: "/marketplace/rules", priority: 0.3, freq: "yearly" },
    { path: "/pricing", priority: 0.9, freq: "monthly" },
    { path: "/resources", priority: 0.7, freq: "weekly" },
    { path: "/resources/how-to-post-a-quality-rfp", priority: 0.7, freq: "monthly" },
    { path: "/resources/how-to-write-a-commercial-property-maintenance-rfp", priority: 0.7, freq: "monthly" },
    { path: "/badge", priority: 0.5, freq: "monthly" },
    { path: "/widgets", priority: 0.5, freq: "monthly" },
    { path: "/advertise", priority: 0.6, freq: "monthly" },
    { path: "/spotlight", priority: 0.6, freq: "weekly" },
    { path: "/services-for-trades", priority: 0.5, freq: "monthly" },
    { path: "/about", priority: 0.5, freq: "monthly" },
    { path: "/reputation", priority: 0.4, freq: "monthly" },
    { path: FOUNDING_PATH, priority: 0.7, freq: "weekly" },
    // Always indexable: the sign-up form always shows (sending is flag-gated separately).
    { path: "/weekly-email", priority: 0.5, freq: "weekly" },
    { path: "/for-agencies", priority: 0.6, freq: "monthly" },
    { path: "/resources/contractor-directories", priority: 0.6, freq: "monthly" },
    { path: "/trades", priority: 0.8, freq: "weekly" },
    { path: "/regions", priority: 0.8, freq: "weekly" },
    ...Object.values(PROVINCES).map((p) => ({ path: `/${p.slug}`, priority: 0.8, freq: "daily" as const })),
    { path: "/toronto-contracts", priority: 0.7, freq: "daily" },
    { path: "/vs", priority: 0.7, freq: "monthly" },
    { path: "/for", priority: 0.7, freq: "monthly" },
    { path: "/cost-guides", priority: 0.7, freq: "monthly" },
    { path: "/rfp-templates", priority: 0.8, freq: "monthly" },
    { path: "/rfp-writer", priority: 0.9, freq: "monthly" },
    { path: "/get-found", priority: 0.8, freq: "monthly" },
    { path: "/refer-a-project", priority: 0.9, freq: "monthly" },
    { path: "/contact", priority: 0.5, freq: "yearly" },
    { path: "/terms", priority: 0.3, freq: "yearly" },
    { path: "/privacy", priority: 0.3, freq: "yearly" },
    { path: "/disclaimer", priority: 0.3, freq: "yearly" },
    { path: "/corrections", priority: 0.3, freq: "yearly" },
    { path: "/forum/rules", priority: 0.3, freq: "yearly" },
  ];

  const [rfps, vendors, resources, categories, regions, tradeCityCombos, caseStudies, toronto] = await Promise.all([
    listRfps().catch(() => []),
    listVendors().catch(() => []),
    listResources().catch(() => []),
    getCategories().catch(() => []),
    getRegions().catch(() => []),
    listQualifyingCombos().catch(() => []),
    listCaseStudies().catch(() => []),
    getTorontoIndexSafe(),
  ]);

  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.freq,
    priority: p.priority,
  }));

  entries.push({ url: `${base}/contract-winners`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
  entries.push({ url: `${base}/gc-hub`, lastModified: now, changeFrequency: "daily", priority: 0.7 });
  // Major projects (Canada): the list plus every project page that isn't thin (thin ones are noindexed).
  entries.push({ url: `${base}/major-projects`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const p of (await getMajorProjects()).filter((x) => !isThinProject(x)).slice(0, 5000))
    entries.push({ url: `${base}/major-projects/${p.slug}`, lastModified: new Date(`${p.lastSeen}T12:00:00Z`), changeFrequency: "weekly", priority: 0.5 });
  // Buyer directory ("where every buyer posts bids"): the index plus buyer pages with PMRFP data (the rest are noindexed).
  entries.push({ url: `${base}/buyers`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const b of (await loadBuyers()).pages.filter(isIndexableBuyer))
    entries.push({ url: `${base}${b.path}`, lastModified: now, changeFrequency: "weekly", priority: 0.5 });
  entries.push({ url: `${base}/reports/public-building-contracts`, lastModified: now, changeFrequency: "weekly", priority: 0.8 });
  // Monthly contract-winner reports: only months that have a page (complete, 10+ awards).
  entries.push({ url: `${base}/reports/contract-winners`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const m of reportMonths(monthlyAwards(rfps), torontoToday()))
    entries.push({ url: `${base}/reports/contract-winners/${m.month}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  // Contract-winner profiles: every one the page renders AND indexes (isWinnerIndexable,
  // 2+ awards). One-award profiles exist but are noindexed, so they stay out.
  for (const w of indexableWinners(rfps)) entries.push({ url: `${base}/contract-winners/${w.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  // City of Toronto suppliers: the page's own rule (isTorontoSupplierIndexable); thin
  // ones (one small award) are noindexed, so they stay out.
  for (const s of torontoContractSlugsForSitemap(toronto, TORONTO_SITEMAP_LIMIT))
    entries.push({ url: `${base}/toronto-contracts/${s.slug}`, lastModified: s.latest ? new Date(`${s.latest}T12:00:00Z`) : now, changeFrequency: "monthly", priority: 0.5 });
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
  // Same thin-content guard as the region page (no companies and no RFPs there
  // → noindex). Listing those sent Google noindexed URLs (e.g. /regions/edmonton).
  for (const rg of regions.filter((rg) => vendors.some((v) => v.regions.includes(rg.name)) || rfps.some((r) => r.regionName === rg.name))) entries.push({ url: `${base}/regions/${rg.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  // Trade×city pages exist only for combos that clear the vendor gate, so the
  // sitemap stays in lockstep with what actually renders.
  for (const tc of tradeCityCombos) entries.push({ url: `${base}/trades/${tc.category.slug}/${tc.region.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  // Price benchmarks: only trade × province pages with a real range (5+ valued
  // awards) — the same rule that keeps the others noindexed.
  const benchCombos = benchmarkCombos(benchmarkAwards(rfps, { regionProvince: new Map(regions.map((rg) => [rg.name, rg.province] as const)) }), torontoToday()).filter((c) => c.enough);
  if (benchCombos.length) entries.push({ url: `${base}/benchmarks`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  // Award Intelligence: only the public landing page; every /intel/* page is noindexed paid analysis.
  entries.push({ url: `${base}/intel`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  for (const c of benchCombos) {
    const slug = categories.find((cat) => cat.name === c.trade)?.slug;
    if (slug) entries.push({ url: `${base}/benchmarks/${slug}/${provinceSlug(c.province)}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  }
  // Monthly market insights: only trade × province pages with enough records (the page's own noindex rule).
  {
    const today = torontoToday();
    const awards = intelAwards(rfps, {
      regionProvince: new Map(regions.map((rg) => [rg.name, rg.province] as const)),
      tradeSlug: new Map(categories.map((c) => [c.name, c.slug] as const)),
    });
    const data = { today, rfps, awards, refs: [], benchmarkAwards: [], leads: null };
    const tradeRefs = categories.map((c) => ({ slug: c.slug, name: c.name }));
    const markets = [...indexableMarkets(data, "CA", tradeRefs), ...indexableMarkets(data, "US", tradeRefs)];
    if (markets.length) entries.push({ url: `${base}/insights`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
    for (const m of markets) entries.push({ url: `${base}${insightsMarketPath(m.trade.slug, m.province)}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  }
  // Public projects only (listCaseStudies drops unlisted and private). The
  // /projects gallery is noindexed while it's empty, so it's listed only then.
  if (caseStudies.length > 0) entries.push({ url: `${base}/projects`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  for (const cs of caseStudies) entries.push({ url: `${base}/case-studies/${cs.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const c of COMPETITORS) entries.push({ url: `${base}/vs/${c.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  for (const v of VERTICALS) entries.push({ url: `${base}/for/${v.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  for (const g of COST_GUIDES) entries.push({ url: `${base}/cost-guides/${g.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  for (const t of RFP_TEMPLATES) entries.push({ url: `${base}/rfp-templates/${t.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  // Open jobs (Google for Jobs reads the JobPosting markup on each page).
  for (const j of (await listOpenJobs()).jobs) entries.push({ url: `${base}/jobs/${j.slug}`, lastModified: new Date(j.createdAt), changeFrequency: "daily", priority: 0.6 });

  // Marketplace: live listings, plus category / category×region landings that clear the
  // LANDING_MIN_LISTINGS gate (thinner ones are noindexed on the page). Empty before the migration.
  const { listings: market } = await listActiveListings();
  for (const l of market) entries.push({ url: `${base}/marketplace/${l.slug}`, lastModified: new Date(l.updatedAt), changeFrequency: "weekly", priority: 0.5 });
  for (const c of CATEGORIES) {
    const inCat = market.filter((l) => l.category === c);
    if (landingIndexable(inCat.length)) entries.push({ url: `${base}/marketplace/category/${c}`, lastModified: now, changeFrequency: "daily", priority: 0.6 });
    for (const rg of new Set(inCat.map((l) => l.regionSlug).filter((s): s is string => Boolean(s)))) {
      if (landingIndexable(inCat.filter((l) => l.regionSlug === rg).length)) {
        entries.push({ url: `${base}/marketplace/category/${c}/${rg}`, lastModified: now, changeFrequency: "daily", priority: 0.5 });
      }
    }
  }

  // Forum: the index, each category, and only threads that pass the indexing
  // gate (approved, answered or 2+ replies, 150+ words). lastmod = last reply.
  const forumThreads = await listIndexableThreads().catch(() => []);
  if (forumThreads.length) {
    entries.push({ url: `${base}/forum`, lastModified: new Date(forumThreads[0].lastPostAt), changeFrequency: "daily", priority: 0.6 });
    for (const c of FORUM_CATEGORY_SLUGS.filter((c) => forumThreads.some((t) => t.path.startsWith(`/forum/${c}/`)))) entries.push({ url: `${base}/forum/${c}`, lastModified: now, changeFrequency: "daily", priority: 0.5 });
    for (const t of forumThreads) entries.push({ url: `${base}${isFrenchForum(t.path.split("/")[2]) ? localizePath(t.path, "fr") : t.path}`, lastModified: new Date(t.lastPostAt), changeFrequency: "weekly", priority: 0.6 });
  }

  // Translated pages (the same list the language switcher uses): list each
  // language version and pair them with the hreflang the page itself sets
  // (alternatesFor: en, fr, es, x-default -> English).
  const localized: MetadataRoute.Sitemap = [];
  for (const e of entries) {
    const path = e.url.slice(base.length) || "/";
    const langs = translationsOf(path);
    if (!langs.length) continue;
    const languages: Record<string, string> = { en: e.url, "x-default": e.url };
    for (const l of langs) languages[l] = `${base}${localizePath(path, l)}`;
    e.alternates = { languages };
    for (const l of langs) localized.push({ ...e, url: languages[l], alternates: { languages } });
  }

  const all = [...entries, ...localized];
  // One sitemap file holds 50,000 URLs / 50 MB. Well under today (~6k URLs); past
  // 45k, split this into a sitemap index with generateSitemaps().
  if (all.length > SITEMAP_SPLIT_AT) console.warn(`sitemap: ${all.length} URLs, split it into a sitemap index (limit 50,000)`);
  return all;
}
