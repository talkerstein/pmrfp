import type { Metadata } from "next";
import { DirectoryList, LIST_PATH, PER_PAGE, listHref, paginate } from "@/components/home-v3/directory-list";
import { V3Price, V3PriceParts } from "@/components/home-v3/chrome";
import { JsonLd, breadcrumbSchema } from "@/lib/seo/jsonld";
import { awardTotals, listWinners } from "@/lib/data/winners";
import { compactDollars } from "@/lib/data/fomo";
import { getCategories } from "@/lib/data/taxonomy";
import { getVisitorListCounts } from "@/lib/data/list-counts";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { parseCountryParam } from "@/lib/visitor-geo";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { PRICING } from "@/lib/site";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).partners.winners.meta;
  return { title: t.title, description: t.description, alternates: alternatesFor(l, "/contract-winners") };
}

type Sort = "value" | "contracts" | "recent";

export default async function ContractWinnersPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const all = getT("v3Pages").list;
  const t = all.winners;
  const crumbs = getT("partners").crumbs;
  const sp = await searchParams;
  // Country-first: winners from the visitor's country's award notices only
  // (Canadian notices today, so a U.S. visitor sees the empty state, never Canada's).
  const { country } = await getVisitorCountry({ param: sp.country });
  const [winners, categories, counts] = await Promise.all([listWinners(country), getCategories(), getVisitorListCounts(country)]);
  const { contracts, value } = awardTotals(winners);

  const sort: Sort = sp.sort === "contracts" || sp.sort === "recent" ? sp.sort : "value";
  const trade = sp.trade ? categories.find((c) => c.slug === sp.trade) ?? null : null;
  const q = sp.q?.trim().toLowerCase() ?? "";
  // Trades that have winners, busiest first, for the filter.
  const tradeCount = new Map<string, number>();
  for (const w of winners) for (const c of w.categories) tradeCount.set(c, (tradeCount.get(c) ?? 0) + 1);
  const tradeOptions = categories.filter((c) => tradeCount.has(c.name)).sort((a, b) => (tradeCount.get(b.name) ?? 0) - (tradeCount.get(a.name) ?? 0));

  const filtered = winners
    .filter((w) => (!trade || w.categories.includes(trade.name)) && (!q || w.name.toLowerCase().includes(q)))
    .sort((a, b) =>
      sort === "contracts"
        ? b.awards.length - a.awards.length || b.totalValue - a.totalValue
        : sort === "recent"
          ? (b.latest ?? "").localeCompare(a.latest ?? "")
          : b.totalValue - a.totalValue || b.awards.length - a.awards.length,
    );
  // Rank is by total value, as on the board, whatever the sort.
  const rank = new Map(winners.map((w, i) => [w.slug, i + 1]));
  const { page, pages, slice } = paginate(filtered, sp.page);
  const keep = { trade: sp.trade, sort: sort === "value" ? undefined : sort, country: parseCountryParam(sp.country) ? sp.country : undefined };
  const n = (x: number) => formatNumber(x, lang);
  const filteredView = Boolean(trade || q);
  const proHref = signUpHrefForPlan("pro", "monthly");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: crumbs.home, path: localizePath("/", lang) },
          { name: crumbs.winners, path: localizePath("/contract-winners", lang) },
        ])}
      />
      <DirectoryList
        lang={lang}
        type="winners"
        t={all}
        eyebrow={t.eyebrow}
        h1={t.h1}
        h1Size={56}
        sub={t.sub}
        links={[{ href: "/gc-hub", label: `${getT("gcHub").links.hub} →` }, { href: "/reports/contract-winners", label: t.monthly }, { href: "/reports/public-building-contracts", label: t.reports }, { href: "/toronto-contracts", label: t.toronto }]}
        stats={
          winners.length
            ? [
                { n: n(winners.length), l: t.stats.repeat },
                { n: n(contracts), l: t.stats.contracts },
                ...(value ? [{ n: compactDollars(value, lang), l: t.stats.awarded }] : []),
              ]
            : []
        }
        search={{ q: sp.q ?? "", placeholder: t.searchPh, button: t.searchBtn, keep }}
        ctas={[{ href: proHref, label: t.cta1 }, { href: "/rfps", label: t.cta2 }]}
        tabs={{ trades: counts.trades, suppliers: counts.suppliers, winners: winners.length, jobs: counts.jobs, talent: counts.talent }}
        filters={
          winners.length
            ? [
                { name: "trade", label: all.filters.trade, value: trade?.slug ?? "", options: [{ value: "", label: all.filters.allTrades }, ...tradeOptions.map((c) => ({ value: c.slug, label: tradeName(c.name, lang) }))] },
                { name: "sort", label: all.sort.label, value: sort, options: [{ value: "value", label: all.sort.value }, { value: "contracts", label: all.sort.contracts }, { value: "recent", label: all.sort.recent }] },
              ]
            : []
        }
        verified={null}
        filterButton={t.apply}
        filterKeep={{ q: sp.q }}
        chips={null}
        featured={null}
        list={
          filtered.length
            ? {
                title: t.listTitle,
                cards: slice.map((w) => ({
                  href: `/contract-winners/${w.slug}`,
                  name: w.name,
                  loc: w.latest ? fmt(t.recent, { date: formatDate(`${w.latest.slice(0, 10)}T12:00:00Z`, lang, { month: "short", year: "numeric" }) }) : null,
                  tags: w.categories.slice(0, 3).map((c) => tradeName(c, lang)).join(" · ") || null,
                  desc: plural(w.awards.length, t.contracts, { n: n(w.awards.length) }),
                  metaN: w.totalValue ? compactDollars(w.totalValue, lang) : null,
                  metaL: w.totalValue ? all.total : null,
                  badge: String(rank.get(w.slug) ?? "").padStart(2, "0"),
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
                pageHref: (p) => listHref(LIST_PATH.winners, { ...keep, q: sp.q, page: p }),
                footnote: t.footnote,
              }
            : null
        }
        noMatch={!filtered.length && filteredView ? { clearHref: "/contract-winners" } : null}
        empty={null}
        close={{
          eyebrow: t.closeEyebrow,
          head: t.closeHead,
          text: counts.open != null && counts.closing7 != null ? fmt(t.closeText, { open: n(counts.open), closing: n(counts.closing7) }) : "",
          cta1: { href: proHref, label: t.closeCta1 },
          cta2: { href: "/rfps", label: t.closeCta2 },
        }}
        sticky={{
          a: counts.open != null ? fmt(t.stickyA, { n: n(counts.open) }) : t.closeHead,
          b: counts.closing7 != null ? fmt(t.stickyB, { n: n(counts.closing7) }) : "",
          cta1: { href: proHref, label: t.stickyCta1 },
          cta2: { href: "/rfps", label: t.stickyCta2 },
        }}
      />
    </>
  );
}
