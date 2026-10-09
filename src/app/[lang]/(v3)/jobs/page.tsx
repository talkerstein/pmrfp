import type { Metadata } from "next";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate } from "@/components/home-v3/directory-list";
import { listOpenJobs } from "@/lib/jobs/data";
import { EMPLOYMENT_TYPES, FREE_JOB_LIMIT } from "@/lib/jobs/rules";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getVisitorListCounts } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { provinceFirst, regionCountry, regionsInCountry } from "@/lib/visitor-geo";
import { gcFormPath } from "@/lib/gc/packages";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).jobs.board.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/jobs") };
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default async function JobsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ trade?: string; region?: string; type?: string; page?: string; country?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const t = all.jobs;
  const labels = getT("jobsClient");
  const sp = await searchParams;
  const filtered = Boolean(sp.trade || sp.region || sp.type);
  // Country-first: one country's jobs (a picked region decides it), the visitor's province/state first.
  const allRegions = await getRegions();
  const pickedRegion = sp.region ? allRegions.find((r) => r.slug === sp.region) : undefined;
  const where = await getVisitorCountry({ param: sp.country });
  const country = pickedRegion ? regionCountry(pickedRegion) : where.country;
  const regions = regionsInCountry(allRegions, country);
  const [found, unfiltered, trades, counts] = await Promise.all([
    listOpenJobs({ trade: sp.trade, region: sp.region, type: sp.type }),
    filtered ? listOpenJobs() : Promise.resolve(null),
    getCategories(),
    getVisitorListCounts(country),
  ]);
  const ready = found.ready;
  const jobs = provinceFirst(found.jobs.filter((j) => j.country === country), country === where.country ? where.province : null, (j) => j.province);
  const pool = unfiltered ? unfiltered.jobs.filter((j) => j.country === country) : jobs;
  const n = (x: number) => formatNumber(x, lang);
  const { page, pages, slice } = paginate(jobs, sp.page);
  const keep = { trade: sp.trade, region: sp.region, type: sp.type, country: sp.country };
  const byType = new Map<string, number>();
  for (const j of pool) byType.set(j.employmentType, (byType.get(j.employmentType) ?? 0) + 1);
  const free = lang === "fr" ? "0 $" : "$0";

  return (
    <DirectoryList
      lang={lang}
      type="jobs"
      t={all}
      eyebrow={t.eyebrow}
      h1={t.h1}
      h1Size={48}
      sub={t.sub}
      links={[{ href: gcFormPath(), label: `${getT("jobs").board.gcCta} →` }]}
      stats={ready ? [{ n: n(pool.length), l: t.stats.open }, { n: n(EMPLOYMENT_TYPES.length), l: t.stats.types }] : []}
      search={null}
      ctas={[{ href: "/jobs/post", label: t.cta1 }, { href: "/talent/edit", label: t.cta2 }]}
      tabs={{ trades: counts.trades, suppliers: counts.suppliers, winners: counts.winners, jobs: ready ? pool.length : null, talent: counts.talent }}
      filters={[
        { name: "trade", label: all.filters.trade, value: sp.trade ?? "", options: [{ value: "", label: all.filters.allTrades }, ...trades.map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))] },
        { name: "region", label: all.filters.region, value: sp.region ?? "", options: [{ value: "", label: all.filters.anywhere }, ...regions.map((r) => ({ value: r.slug, label: regionName(r.name, lang) }))] },
        { name: "type", label: all.filters.type, value: sp.type ?? "", options: [{ value: "", label: all.filters.anyType }, ...EMPLOYMENT_TYPES.map((e) => ({ value: e, label: labels.employment[e] }))] },
      ]}
      verified={null}
      filterButton={t.searchBtn}
      chips={
        ready
          ? {
              label: t.chipsLabel,
              items: [
                { name: all.filters.anyType, n: pool.length, href: listHref(LIST_PATH.jobs, { trade: sp.trade, region: sp.region }), on: !sp.type },
                ...EMPLOYMENT_TYPES.map((e) => ({ name: labels.employment[e], n: byType.get(e) ?? 0, href: listHref(LIST_PATH.jobs, { trade: sp.trade, region: sp.region, type: e }), on: sp.type === e })),
              ],
            }
          : null
      }
      featured={null}
      list={
        jobs.length
          ? {
              title: t.listTitle,
              cards: slice.map((j) => ({
                href: `/jobs/${j.slug}`,
                name: j.title,
                loc: [j.company.name, [j.city, j.region ? regionName(j.region, lang) : null].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
                tags: [j.trade ? tradeName(j.trade, lang) : null, labels.employment[j.employmentType]].filter(Boolean).join(" · "),
                desc: clip(j.description),
                badge: j.pro ? all.pro : null,
                logo: j.company.logoUrl,
              })),
              cardCta: t.cardCta,
              band: { eyebrow: t.bandEyebrow, head: t.bandHead, text: fmt(t.bandText, { n: FREE_JOB_LIMIT }), cta: { href: "/jobs/post", label: t.bandCta }, big: free },
              page,
              pages,
              total: jobs.length,
              perPage: PER_PAGE,
              pageHref: (p) => listHref(LIST_PATH.jobs, { ...keep, page: p }),
            }
          : null
      }
      noMatch={null}
      empty={
        jobs.length
          ? null
          : {
              tag: ready ? t.emptyTag : t.switchingOn,
              head: filtered ? t.emptyFilteredHead : t.emptyHead,
              text: filtered ? t.emptyFilteredText : t.emptyText,
              cta1: { href: "/jobs/post", label: t.emptyCta1 },
              cta2: filtered ? { href: "/jobs", label: all.clear } : { href: "/talent/edit", label: t.emptyCta2 },
              link: { href: "/talent", label: t.emptyLink },
              facts: [
                { n: n(FREE_JOB_LIMIT), l: t.facts[0] },
                { n: free, l: t.facts[1] },
                { n: t.factMin, l: t.facts[2] },
              ],
              howLabel: t.howLabel,
              howHead: t.howHead,
              how: t.how,
            }
      }
      close={{ eyebrow: t.closeEyebrow, head: t.closeHead, text: fmt(t.closeText, { n: FREE_JOB_LIMIT }), cta1: { href: "/jobs/post", label: t.closeCta1 }, cta2: { href: "/talent/edit", label: t.closeCta2 } }}
      sticky={{
        a: pool.length ? fmt(t.stickyA, { n: n(pool.length) }) : t.stickyNone,
        b: pool.length ? t.stickyBSome : t.stickyB,
        cta1: { href: "/jobs/post", label: t.stickyCta1 },
        cta2: { href: "/talent/edit", label: t.stickyCta2 },
      }}
    />
  );
}
