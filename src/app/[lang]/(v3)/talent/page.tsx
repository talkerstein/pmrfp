import type { Metadata } from "next";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate } from "@/components/home-v3/directory-list";
import { listTalent } from "@/lib/talent/data";
import { AVAILABILITY, FREE_CONTACTS_PER_MONTH } from "@/lib/talent/rules";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { getListCounts } from "@/lib/data/list-counts";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).jobs.talent.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/talent") };
}

export default async function TalentPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ trade?: string; region?: string; availability?: string; page?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const t = all.talent;
  const labels = getT("jobsClient");
  const sp = await searchParams;
  const filtered = Boolean(sp.trade || sp.region || sp.availability);
  const [{ ready, people }, unfiltered, trades, regions, counts] = await Promise.all([
    listTalent({ trade: sp.trade, region: sp.region, availability: sp.availability }),
    filtered ? listTalent() : Promise.resolve(null),
    getCategories(),
    getRegions(),
    getListCounts(),
  ]);
  const pool = unfiltered?.people ?? people;
  const n = (x: number) => formatNumber(x, lang);
  const { page, pages, slice } = paginate(people, sp.page);
  const keep = { trade: sp.trade, region: sp.region, availability: sp.availability };
  const byAvail = new Map<string, number>();
  for (const p of pool) byAvail.set(p.availability, (byAvail.get(p.availability) ?? 0) + 1);
  const free = lang === "fr" ? "0 $" : "$0";

  return (
    <DirectoryList
      lang={lang}
      type="talent"
      t={all}
      eyebrow={t.eyebrow}
      h1={t.h1}
      h1Size={52}
      sub={t.sub}
      stats={ready ? [{ n: n(pool.length), l: t.stats.profiles }, { n: n(FREE_CONTACTS_PER_MONTH), l: t.stats.messages }] : []}
      search={null}
      ctas={[{ href: "/talent/edit", label: t.cta1 }, { href: "/jobs/post", label: t.cta2 }]}
      tabs={{ trades: counts.trades, suppliers: counts.suppliers, winners: counts.winners, jobs: counts.jobs, talent: ready ? pool.length : null }}
      filters={[
        { name: "trade", label: all.filters.trade, value: sp.trade ?? "", options: [{ value: "", label: all.filters.allTrades }, ...trades.map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))] },
        { name: "region", label: all.filters.region, value: sp.region ?? "", options: [{ value: "", label: all.filters.anywhere }, ...regions.map((r) => ({ value: r.slug, label: regionName(r.name, lang) }))] },
        { name: "availability", label: all.filters.availability, value: sp.availability ?? "", options: [{ value: "", label: all.filters.any }, ...AVAILABILITY.map((a) => ({ value: a, label: labels.availability[a] }))] },
      ]}
      verified={null}
      filterButton={t.searchBtn}
      chips={
        ready
          ? {
              label: t.chipsLabel,
              items: [
                { name: all.filters.any, n: pool.length, href: listHref(LIST_PATH.talent, { trade: sp.trade, region: sp.region }), on: !sp.availability },
                ...AVAILABILITY.map((a) => ({ name: labels.availability[a], n: byAvail.get(a) ?? 0, href: listHref(LIST_PATH.talent, { trade: sp.trade, region: sp.region, availability: a }), on: sp.availability === a })),
              ],
            }
          : null
      }
      featured={null}
      list={
        people.length
          ? {
              title: t.listTitle,
              cards: slice.map((p) => ({
                href: `/talent/${p.handle}`,
                name: p.displayName,
                loc: [p.trade ? tradeName(p.trade, lang) : null, [p.city, p.region ? regionName(p.region, lang) : null].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
                tags: p.certifications.slice(0, 4).join(" · ") || null,
                desc: p.headline,
                metaN: p.yearsExperience ? n(p.yearsExperience) : null,
                metaL: p.yearsExperience ? all.yrs : null,
                badge: labels.availability[p.availability],
              })),
              cardCta: t.cardCta,
              band: { eyebrow: t.bandEyebrow, head: t.bandHead, text: t.bandText, cta: { href: "/talent/edit", label: t.bandCta }, big: free },
              page,
              pages,
              total: people.length,
              perPage: PER_PAGE,
              pageHref: (pg) => listHref(LIST_PATH.talent, { ...keep, page: pg }),
            }
          : null
      }
      noMatch={null}
      empty={
        people.length
          ? null
          : {
              tag: ready ? t.emptyTag : t.switchingOn,
              head: filtered ? t.emptyFilteredHead : t.emptyHead,
              text: filtered ? t.emptyFilteredText : t.emptyText,
              cta1: { href: "/talent/edit", label: t.emptyCta1 },
              cta2: filtered ? { href: "/talent", label: all.clear } : { href: "/jobs/post", label: t.emptyCta2 },
              link: { href: "/jobs", label: t.emptyLink },
              facts: [
                { n: free, l: t.facts[0] },
                { n: n(FREE_CONTACTS_PER_MONTH), l: t.facts[1] },
                { n: t.factPrivate, l: t.facts[2] },
              ],
              howLabel: t.howLabel,
              howHead: t.howHead,
              how: t.how,
            }
      }
      close={{ eyebrow: t.closeEyebrow, head: t.closeHead, text: t.closeText, cta1: { href: "/talent/edit", label: t.closeCta1 }, cta2: { href: "/jobs/post", label: t.closeCta2 } }}
      sticky={{
        a: pool.length ? fmt(t.stickyA, { n: n(pool.length) }) : t.stickyNone,
        b: pool.length ? t.stickyBSome : t.stickyB,
        cta1: { href: "/talent/edit", label: t.stickyCta1 },
        cta2: { href: "/jobs/post", label: t.stickyCta2 },
      }}
    />
  );
}
