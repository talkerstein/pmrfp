import "@/components/v3-pages/portfolio.css";
import type { Metadata } from "next";
import { SimplePage } from "@/components/v3/simple";
import { GalleryCard } from "@/components/projects/gallery-card";
import { JsonLd, breadcrumbSchema, itemListSchema } from "@/lib/seo/jsonld";
import { listPublicProjects } from "@/lib/data/portfolio";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import {
  cleanFilters,
  filterGallery,
  galleryFacets,
  galleryIndexable,
  paginateGallery,
  type GalleryFilters,
} from "@/lib/projects/gallery";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { provinceFirst, regionCountry } from "@/lib/visitor-geo";
import { getVisitorCountry } from "@/lib/visitor-geo.server";

export const revalidate = 3600;

type SP = { trade?: string; region?: string; company?: string; page?: string; country?: string };

const PATH = "/projects";

/** Filters as a query string (trade, region, company, page), in a stable order. */
function href(f: GalleryFilters, page?: number): string {
  const q = new URLSearchParams();
  if (f.trade) q.set("trade", f.trade);
  if (f.region) q.set("region", f.region);
  if (f.company) q.set("company", f.company);
  if (page && page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

async function load(sp: SP) {
  const [allItems, categories, regions, visitor] = await Promise.all([listPublicProjects(), getCategories(), getRegions(), getVisitorCountry({ param: sp.country })]);
  // Country-first: one country's projects (a picked region decides it; a
  // company's own view shows all of its work), the visitor's province first.
  const picked = sp.region ? regions.find((r) => r.slug === sp.region) : undefined;
  const country = picked ? regionCountry(picked) : visitor.country;
  const items = sp.company ? allItems : filterGallery(allItems, { country });
  const filters = cleanFilters(
    { trade: sp.trade, region: sp.region, company: sp.company },
    {
      trades: new Set(categories.map((c) => c.slug)),
      regions: new Set(regions.map((r) => r.slug)),
      companies: new Set(items.map((i) => i.orgSlug)),
    },
  );
  const matches = provinceFirst(filterGallery(items, filters), country === visitor.country ? visitor.province : null, (i) => i.province);
  const { page, pages, slice } = paginateGallery(matches, sp.page);
  return {
    items,
    filters,
    matches,
    page,
    pages,
    slice,
    facets: galleryFacets(items),
    tradeLabel: categories.find((c) => c.slug === filters.trade)?.name ?? null,
    regionLabel: regions.find((r) => r.slug === filters.region)?.name ?? null,
    companyLabel: filters.company ? (items.find((i) => i.orgSlug === filters.company)?.orgName ?? null) : null,
  };
}

function headline(lang: Locale, d: Awaited<ReturnType<typeof load>>): string {
  const t = getDictionary(lang).portfolio.gallery;
  if (d.companyLabel) return fmt(t.companyTitle, { org: d.companyLabel });
  const parts = [d.tradeLabel ? tradeName(d.tradeLabel, lang) : null, d.regionLabel ? regionName(d.regionLabel, lang) : null].filter(Boolean);
  return parts.length ? fmt(t.filteredTitle, { what: parts.join(" · ") }) : t.h1;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).portfolio.gallery;
  const d = await load(await searchParams);
  const filtered = Boolean(d.filters.trade || d.filters.region || d.filters.company);
  const indexable = galleryIndexable({ count: d.matches.length, filters: d.filters, page: d.page });
  return {
    title: filtered ? headline(l, d) : t.metaTitle,
    description: fmt(t.metaDescription, { brand: SITE.name }),
    // Canonical keeps trade/region (each is its own listing) and drops paging.
    alternates: alternatesFor(l, href({ trade: d.filters.trade, region: d.filters.region })),
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ProjectsGalleryPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<SP> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("portfolio").gallery;
  const home = getT("v3Pages").simple.home;
  const L = (p: string) => localizePath(p, lang);
  const n = (x: number) => formatNumber(x, lang);
  const d = await load(await searchParams);
  const filtered = Boolean(d.filters.trade || d.filters.region || d.filters.company);
  const title = headline(lang, d);

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: home, path: L("/") }, { name: t.h1, path: L(PATH) }])} />
      {d.slice.length > 0 && (
        <JsonLd data={itemListSchema(title, d.slice.map((i) => ({ name: i.title, path: `/case-studies/${i.slug}` })))} />
      )}
      <SimplePage
        lang={lang}
        current={null}
        group="company"
        crumbs={filtered ? [{ label: t.h1, href: PATH }] : []}
        tabs={false}
        aside={false}
        title={title}
        lead={t.lead}
      >
        {d.items.length > 0 && (
          <form method="get" action={L(PATH)} className="g-filter" data-block="filters">
            {d.filters.company && <input type="hidden" name="company" value={d.filters.company} />}
            <label className="s-fld">
              <span>{t.trade}</span>
              <select name="trade" defaultValue={d.filters.trade ?? ""}>
                <option value="">{t.allTrades}</option>
                {d.facets.trades.map((f) => (
                  <option key={f.slug} value={f.slug}>{`${tradeName(f.name, lang)} (${n(f.count)})`}</option>
                ))}
              </select>
            </label>
            <label className="s-fld">
              <span>{t.region}</span>
              <select name="region" defaultValue={d.filters.region ?? ""}>
                <option value="">{t.allRegions}</option>
                {d.facets.regions.map((f) => (
                  <option key={f.slug} value={f.slug}>{`${regionName(f.name, lang)} (${n(f.count)})`}</option>
                ))}
              </select>
            </label>
            <button type="submit">{t.apply}</button>
            {filtered && (
              <a className="clr" href={L(PATH)}>
                {t.clear}
              </a>
            )}
          </form>
        )}

        {d.items.length === 0 ? (
          <div className="pf-empty" data-block="empty">
            <div className="hd">{t.emptyTitle}</div>
            <p>{t.emptyBody}</p>
          </div>
        ) : d.matches.length === 0 ? (
          <div className="pf-empty" data-block="empty-filtered">
            <div className="hd">{t.emptyFilteredTitle}</div>
            <p>{t.emptyFilteredBody}</p>
            <div className="g-acts">
              <a href={L(PATH)} className="btn navy md">{t.clear}</a>
              <a href={L("/directory")}>{t.directory}</a>
            </div>
          </div>
        ) : (
          <>
            <p className="pf-count">{plural(d.matches.length, t.count, { n: n(d.matches.length) })}</p>
            <ul className="pf-grid" data-list="projects">
              {d.slice.map((i) => (
                <li key={i.slug}>
                  <GalleryCard i={i} lang={lang} />
                </li>
              ))}
            </ul>
            {d.pages > 1 && (
              <nav className="g-pager" aria-label={fmt(t.pageOf, { page: d.page, pages: d.pages })}>
                {d.page > 1 ? <a href={L(href(d.filters, d.page - 1))} rel="prev">{t.prev}</a> : <span />}
                <span className="muted">{fmt(t.pageOf, { page: n(d.page), pages: n(d.pages) })}</span>
                {d.page < d.pages ? <a href={L(href(d.filters, d.page + 1))} rel="next">{t.next}</a> : <span />}
              </nav>
            )}
          </>
        )}

        <div className="g-cta">
          <div className="eb">{t.ctaEyebrow}</div>
          <div className="hd">{t.ctaHead}</div>
          <p>{t.ctaBody}</p>
          <div className="acts">
            <a href={L("/dashboard/projects/new")} className="btn mint md">{t.ctaPrimary}</a>
            <a href={L("/for-trades")} className="lnk">{t.ctaSecondary}</a>
          </div>
        </div>
      </SimplePage>
    </>
  );
}

