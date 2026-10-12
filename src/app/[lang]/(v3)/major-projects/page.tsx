import type { Metadata } from "next";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate } from "@/components/home-v3/directory-list";
import { V3Price, V3PriceParts } from "@/components/home-v3/chrome";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { getMajorProjects } from "@/lib/major-projects/data";
import { filterProjects, parseProjectFilters, provinceCounts, sortProjects } from "@/lib/major-projects/filters";
import { MAJOR_PROJECT_CATEGORIES, MAJOR_PROJECT_STATUSES, VALUE_BANDS, provinceName } from "@/lib/major-projects/model";
import { compactDollars } from "@/lib/data/fomo";
import { getCategories } from "@/lib/data/taxonomy";
import { getVisitorListCounts } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { slugify } from "@/lib/tenders/shared";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export const revalidate = 3600;

type SP = Record<string, string | undefined>;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).majorProjects.meta;
  const sp = await searchParams;
  const province = provinceName(sp.province?.replace(/-/g, " ") ?? null);
  // Only the plain list is indexed; filtered and paged views are for people.
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "lang");
  return {
    title: province ? fmt(t.provinceTitle, { province: regionName(province, l) }) : t.title,
    description: province ? fmt(t.provinceDescription, { province: regionName(province, l) }) : t.description,
    alternates: alternatesFor(l, "/major-projects"),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Major projects in Canada: the shared cached snapshot (lib/major-projects/
 * data), filtered and paged in memory. Canada only: a U.S. visitor gets the
 * "Canada only for now" panel unless they ask for ?country=ca.
 */
export default async function MajorProjectsPage({ searchParams, params }: { searchParams: Promise<SP>; params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const m = getT("majorProjects");
  const t = m.list;
  const sp = await searchParams;
  const { country, province: visitorProvince } = await getVisitorCountry({ param: sp.country });
  const proHref = signUpHrefForPlan("pro", "monthly");
  const n = (x: number) => formatNumber(x, lang);
  const [projects, categories, counts] = await Promise.all([
    country === "CA" ? getMajorProjects() : Promise.resolve([]),
    getCategories().catch(() => []),
    getVisitorListCounts("CA"),
  ]);

  const f = parseProjectFilters(sp);
  const live = projects.filter((p) => !p.stale);
  const filtered = sortProjects(filterProjects(projects, f), visitorProvince);
  const { page, pages, slice } = paginate(filtered, sp.page);
  const keep = {
    province: f.province ? slugify(f.province) : undefined,
    category: f.category ?? undefined,
    status: f.status ?? undefined,
    value: f.band ?? undefined,
    trade: f.trade ?? undefined,
    stale: f.showStale ? "1" : undefined,
    country: country === "CA" && sp.country ? "ca" : undefined,
  };
  const filteredView = Boolean(f.province || f.category || f.status || f.band || f.trade || f.q);
  const totalValue = live.reduce((s, p) => s + (p.estValueCad ?? 0), 0);
  const building = live.filter((p) => p.status === "under_construction").length;
  const tradeNames = new Map(categories.map((c) => [c.slug, c.name]));
  const tradesUsed = new Map<string, number>();
  for (const p of live) for (const s of p.tradesNeeded) tradesUsed.set(s, (tradesUsed.get(s) ?? 0) + 1);
  const tradeOptions = [...tradesUsed.keys()].filter((s) => tradeNames.has(s)).sort((a, b) => (tradesUsed.get(b) ?? 0) - (tradesUsed.get(a) ?? 0));
  const provinces = provinceCounts(projects);
  // Province-first: the visitor's own province leads the chips.
  const chipProvinces = visitorProvince ? [...provinces.filter((p) => p.province === visitorProvince), ...provinces.filter((p) => p.province !== visitorProvince)] : provinces;
  const place = (city: string | null, prov: string | null) => [city, prov ? regionName(prov, lang) : null].filter(Boolean).join(", ") || null;
  const usView = country === "US";

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: all.home, path: localizePath("/", lang) },
          { name: t.eyebrow, path: localizePath("/major-projects", lang) },
        ])}
      />
      <DirectoryList
        lang={lang}
        type="projects"
        t={all}
        eyebrow={t.eyebrow}
        h1={t.h1}
        h1Size={56}
        sub={t.sub}
        links={[
          { href: "/contract-winners", label: `${getT("gcHub").links.hub} →` },
          ...(projects.length > live.length && !f.showStale ? [{ href: listHref(LIST_PATH.projects, { ...keep, q: sp.q, stale: "1" }), label: `${t.staleToggle} →` }] : []),
        ]}
        stats={
          live.length
            ? [
                { n: n(live.length), l: t.stats.projects },
                ...(totalValue ? [{ n: compactDollars(totalValue, lang), l: t.stats.value }] : []),
                { n: n(building), l: t.stats.building },
              ]
            : []
        }
        search={usView ? null : { q: sp.q ?? "", placeholder: t.searchPh, button: t.searchBtn, keep }}
        ctas={[{ href: proHref, label: t.cta1 }, { href: "/rfps", label: t.cta2 }]}
        tabs={null}
        filters={
          projects.length
            ? [
                { name: "province", label: t.filters.province, value: keep.province ?? "", options: [{ value: "", label: t.filters.allProvinces }, ...provinces.map((p) => ({ value: slugify(p.province), label: regionName(p.province, lang) }))] },
                { name: "category", label: t.filters.category, value: f.category ?? "", options: [{ value: "", label: t.filters.allCategories }, ...MAJOR_PROJECT_CATEGORIES.map((c) => ({ value: c, label: m.categories[c] }))] },
                { name: "status", label: t.filters.status, value: f.status ?? "", options: [{ value: "", label: t.filters.allStatuses }, ...MAJOR_PROJECT_STATUSES.map((s) => ({ value: s, label: m.statuses[s] }))] },
                { name: "value", label: t.filters.value, value: f.band ?? "", options: [{ value: "", label: t.filters.allValues }, ...VALUE_BANDS.map((b) => ({ value: b, label: m.bands[b] }))] },
                { name: "trade", label: t.filters.trade, value: f.trade ?? "", options: [{ value: "", label: t.filters.allTrades }, ...tradeOptions.map((s) => ({ value: s, label: tradeName(tradeNames.get(s) ?? s, lang) }))] },
              ]
            : []
        }
        verified={null}
        filterButton={t.apply}
        filterKeep={{ q: sp.q, stale: keep.stale, country: keep.country }}
        chips={
          chipProvinces.length > 1
            ? {
                label: t.chips,
                items: chipProvinces.map((p) => ({
                  name: regionName(p.province, lang),
                  n: p.n,
                  href: listHref(LIST_PATH.projects, { ...keep, province: f.province === p.province ? undefined : slugify(p.province) }),
                  on: f.province === p.province,
                })),
              }
            : null
        }
        featured={null}
        list={
          filtered.length
            ? {
                title: f.province ? fmt(t.listTitleProvince, { province: regionName(f.province, lang) }) : t.listTitle,
                cards: slice.map((p) => ({
                  href: `/major-projects/${p.slug}`,
                  name: p.name,
                  loc: place(p.city, p.province),
                  tags: [m.categories[p.category], m.statuses[p.status]].join(" · "),
                  desc: p.owner ? fmt(t.owner, { owner: p.owner }) : (p.description ?? "").slice(0, 140) || null,
                  metaN: p.estValueCad ? compactDollars(p.estValueCad, lang) : null,
                  metaL: p.estValueCad ? t.valueLabel : null,
                })),
                cardCta: t.cardCta,
                band: {
                  eyebrow: t.bandEyebrow,
                  head: t.bandHead,
                  text: <V3Price lang={lang} template={t.bandText} cad={PRICING.proMonthly} cad2={PRICING.proAnnual} w="18em" />,
                  cta: { href: proHref, label: t.bandCta },
                  big: <V3PriceParts lang={lang} cad={PRICING.proMonthly} />,
                },
                page,
                pages,
                total: filtered.length,
                perPage: PER_PAGE,
                pageHref: (p) => listHref(LIST_PATH.projects, { ...keep, q: sp.q, page: p }),
                footnote: t.footnote,
              }
            : null
        }
        sponsor={
          // Province view only: that province's sponsor for the chosen trade (or any trade's when none is chosen).
          f.province && !usView ? (
            <SponsorSlot
              ctx={{
                placement: "major_projects",
                market: "CA",
                province: f.province,
                categories: f.trade ? [f.trade] : [],
                anyTrade: !f.trade,
                seed: `${f.province}|${f.trade ?? ""}`,
              }}
            />
          ) : null
        }
        noMatch={!filtered.length && filteredView ? { clearHref: "/major-projects" } : null}
        empty={
          usView
            ? {
                tag: t.usTag,
                head: t.usHead,
                text: t.usText,
                cta1: { href: "/major-projects?country=ca", label: t.usCta },
                cta2: { href: "/rfps", label: t.cta2 },
                link: { href: "/contract-winners", label: t.emptyLink },
                facts: [],
                howLabel: t.howLabel,
                howHead: t.howHead,
                how: t.how,
              }
            : !projects.length
              ? {
                  tag: t.emptyTag,
                  head: t.emptyHead,
                  text: t.emptyText,
                  cta1: { href: "/rfps", label: t.emptyCta1 },
                  cta2: { href: proHref, label: t.emptyCta2 },
                  link: { href: "/contract-winners", label: t.emptyLink },
                  facts: [],
                  howLabel: t.howLabel,
                  howHead: t.howHead,
                  how: t.how,
                }
              : null
        }
        close={{
          eyebrow: t.closeEyebrow,
          head: t.closeHead,
          text: counts.open != null && counts.closing7 != null ? fmt(t.closeText, { open: n(counts.open), closing: n(counts.closing7) }) : "",
          cta1: { href: proHref, label: t.closeCta1 },
          cta2: { href: "/rfps", label: t.closeCta2 },
        }}
        sticky={{
          a: live.length ? fmt(t.stickyA, { n: n(live.length) }) : t.closeHead,
          b: t.stickyB,
          cta1: { href: proHref, label: t.stickyCta1 },
          cta2: { href: "/rfps", label: t.stickyCta2 },
        }}
      />
    </>
  );
}
