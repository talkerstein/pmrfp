import type { Metadata } from "next";
import { setLangFrom, getT } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { formatDate, formatNumber } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";
import { fmt } from "@/i18n/format";
import { SITE } from "@/lib/site";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached, listQualifyingCombos } from "@/lib/data/trade-city";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStats, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { isIndexableRfp } from "@/lib/seo/rfp-indexing";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import type { RfpListItem } from "@/lib/data/types";
import { HomeV3, type V3Closing, type V3Data, type V3Messages } from "@/components/home-v3/home-v3";
import { V3_FALLBACK } from "@/components/home-v3/fallback";

/**
 * Homepage (Claude Design handoff 2026-10-07, approved). Its own route group so
 * the marketing layout's SiteHeader/SiteFooter don't wrap it: the design ships
 * its own announcement bar, header and footer. Organization + WebSite JSON-LD
 * come from the root layout; canonical + hreflang from generateMetadata.
 */
// The board refreshes daily from the public-tender feed.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const t = getDictionary(l).home.meta;
  return {
    title: { absolute: `${SITE.name} — ${t.title}` },
    description: t.description,
    alternates: alternatesFor(l, "/"),
  };
}

/** SEAO (Quebec) notices are published in French. */
const isFrench = (r: { slug: string }) => /-qca?-/.test(r.slug);

/** Round-robin by key, keeping each group's order. */
function spread<T>(items: T[], key: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  const out: T[] = [];
  const queues = [...groups.values()];
  while (out.length < items.length) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

/** Trades with their own photo tile, as in the design. */
const BIG = { name: "General Contracting", img: "/images/photos/site-crew-deck.webp" };
const TILES = [
  { name: "Roofing", img: "/images/home/hero-roofing.webp" },
  { name: "Snow Removal", img: "/images/home/trade-snow.webp" },
  { name: "Cleaning / Janitorial", img: "/images/home/trade-cleaning.webp" },
  { name: "HVAC", img: "/images/home/trade-hvac.webp" },
  { name: "Electrical", img: "/images/home/trade-electrical.webp" },
];

/** "$498,992" in English and Spanish, "498 992 $" in French. */
function dollars(n: number, lang: Locale): string {
  const s = formatNumber(Math.round(n), lang === "es" ? "en" : lang);
  return lang === "fr" ? `${s} $` : `$${s}`;
}

async function load(lang: Locale, t: V3Messages): Promise<{ data: V3Data; live: string[]; fallback: string[] }> {
  const live: string[] = [];
  const fallback: string[] = [];
  const data: V3Data = structuredClone(V3_FALLBACK);
  const trade = (name: string) => tradeName(name, lang);
  const region = (name: string) => regionName(name, lang);
  const mon = (d: string | null) => (d ? formatDate(d, lang, { month: "short" }) : "");
  const day = (d: string | null) => (d ? String(Number(d.slice(8, 10))) : "");
  const short = (d: string | null) => (d ? formatDate(d, lang, { month: "short", day: "numeric" }) : "");
  const place = (r: RfpListItem) => region(r.regionName ?? r.city ?? r.province ?? "");
  const tag = (r: RfpListItem) => [r.categories[0] ? trade(r.categories[0]) : "", place(r)].filter(Boolean).join(" · ");
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const closingCard = (r: RfpListItem): V3Closing => {
    const d = daysUntil(r.deadline) ?? 0;
    return {
      mon: mon(r.deadline),
      day: day(r.deadline),
      tag: tag(r),
      left: d <= 0 ? t.closing.today : d === 1 ? t.closing.tomorrow : fmt(t.closing.daysLeft, { n: num(d) }),
      title: r.title,
      href: `/rfps/${r.slug}`,
      soon: d <= 1,
    };
  };

  // Fallback copy in the visitor's language too.
  data.big.name = trade(data.big.name);
  data.tiles = data.tiles.map((x) => ({ ...x, name: trade(x.name) }));
  data.chips = data.chips.map((x) => ({ ...x, name: trade(x.name) }));
  data.tradeOptions = data.tradeOptions.map((o) => ({ ...o, label: trade(o.label) }));
  data.alertTrade = trade(data.alertTrade);
  if (lang !== "en") {
    data.winners.value = compactDollars(523e6, lang);
    data.winners.top = data.winners.top.map((x) => ({ ...x, value: compactDollars(x.weight * 1e6, lang) }));
  }

  const [rfpsR, catsR, regionsR, soldR, combosR] = await Promise.allSettled([
    listAllRfpsCached(),
    getCategories(),
    getRegions(),
    cachedLifetimeCount(),
    listQualifyingCombos(),
  ]);

  if (soldR.status === "fulfilled" && soldR.value != null) {
    data.foundingLeft = spotsLeft(soldR.value);
    live.push("founding");
  } else fallback.push("founding");

  const cats = catsR.status === "fulfilled" ? catsR.value : null;
  const regions = regionsR.status === "fulfilled" ? regionsR.value : null;
  if (cats?.length) {
    data.trades = cats.length;
    live.push("trades");
  } else fallback.push("trades");
  if (regions?.length) {
    data.regions = regions.length;
    live.push("regions");
  } else fallback.push("regions");

  // Homepage links to trade × city pages and fresh tenders, so Google discovers
  // them from the strongest page instead of only via the sitemap.
  const combos = combosR.status === "fulfilled" ? combosR.value : [];
  data.browse.combos = combos
    .filter((c) => c.open.length > 0)
    .sort((a, b) => b.open.length - a.open.length || a.category.name.localeCompare(b.category.name))
    .slice(0, 16)
    .map((c) => ({ href: `/trades/${c.category.slug}/${c.region.slug}`, label: `${trade(c.category.name)} · ${region(c.region.name)}`, n: c.open.length }));

  const rfps = rfpsR.status === "fulfilled" ? rfpsR.value : null;
  if (!rfps?.length) {
    fallback.push("board");
    return { data, live, fallback };
  }

  data.browse.newest = rfps
    .filter((r) => isIndexableRfp(r) && (daysUntil(r.deadline) ?? -1) >= 1 && !isFrench(r))
    // No posted date on list items; the latest deadlines are the freshest notices.
    .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? ""))
    .slice(0, 10)
    .map((r) => ({ href: `/rfps/${r.slug}`, title: r.title, city: r.city }));

  const stats = boardStats(rfps);
  data.open = stats.open;
  data.closing7 = stats.closingThisWeek;
  live.push("board");

  // Open counts per trade (by display name, as the board labels them).
  const openRfps = rfps.filter((r) => r.status === "open");
  const counts = new Map<string, number>();
  for (const r of openRfps) for (const c of r.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const slugOf = new Map((cats ?? []).map((c) => [c.name, c.slug]));
  const tradeHref = (name: string) => (slugOf.get(name) ? `/trades/${slugOf.get(name)}` : "/trades");
  data.big = { name: trade(BIG.name), n: counts.get(BIG.name) ?? 0, img: BIG.img, href: tradeHref(BIG.name) };
  data.tiles = TILES.map((x) => ({ ...x, name: trade(x.name), n: counts.get(x.name) ?? 0, href: tradeHref(x.name) }));
  const shown = new Set([BIG.name, ...TILES.map((x) => x.name)]);
  data.chips = [...counts]
    .filter(([name, n]) => !shown.has(name) && n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 9)
    .map(([name, n]) => ({ name: trade(name), n, href: tradeHref(name) }));
  if (cats?.length) {
    data.tradeOptions = [...cats]
      .sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.slug, label: trade(c.name) }));
  }
  if (regions?.length) {
    const has = new Set(regions.map((r) => r.slug));
    data.areaOptions = data.areaOptions.filter((o) => !o.region || has.has(o.region));
  }

  // Still biddable (closes tomorrow or later), soonest first, English ahead of
  // SEAO's French notices, spread across regions.
  const closingSoon = spread(
    openRfps
      .filter((r) => (daysUntil(r.deadline) ?? -1) >= 1)
      .sort((a, b) => Number(isFrench(a)) - Number(isFrench(b)) || (a.deadline ?? "").localeCompare(b.deadline ?? "")),
    (r) => r.regionName ?? "",
  );
  const ca = closingSoon.filter((r) => rfpMarket(r) === "CA");
  const us = closingSoon.filter((r) => rfpMarket(r) === "US");
  if (ca.length) data.closingCa = ca.slice(0, 4).map(closingCard);
  data.closingUs = us.slice(0, 4).map(closingCard);
  const tickerPool = closingSoon.filter((r) => !isFrench(r)).slice(0, 7);
  if (tickerPool.length) {
    data.ticker = tickerPool.map((r) => ({ tag: tag(r), title: r.title, when: fmt(t.closing.closes, { date: short(r.deadline) }), href: `/rfps/${r.slug}` }));
  }

  // Trade Pro example: the busiest trade's next three closers.
  const pool = closingSoon.filter((r) => !isFrench(r) && r.categories[0]);
  const byTrade = new Map<string, number>();
  for (const r of pool) byTrade.set(r.categories[0], (byTrade.get(r.categories[0]) ?? 0) + 1);
  const busiest = [...byTrade].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (busiest) {
    const rows = pool.filter((r) => r.categories[0] === busiest).slice(0, 3);
    if (rows.length) {
      data.alertTrade = trade(busiest);
      data.alerts = rows.map((r) => ({ where: `${trade(busiest)} · ${place(r)}`, title: r.title, href: `/rfps/${r.slug}` }));
    }
  }

  // Contract winners: the same numbers as /contract-winners.
  const winners = winnersFromRfps(rfps);
  if (winners.length) {
    const contracts = winners.reduce((s, w) => s + w.awards.length, 0);
    const value = winners.reduce((s, w) => s + w.totalValue, 0);
    const most = [...winners].sort((a, b) => b.awards.length - a.awards.length)[0];
    data.winners = {
      repeat: winners.length,
      contracts,
      value: compactDollars(value, lang),
      top: winners.slice(0, 8).map((w) => ({
        name: w.name,
        n: w.awards.length,
        value: compactDollars(w.totalValue, lang),
        weight: Math.max(1, w.totalValue / 1e6),
        href: `/contract-winners/${w.slug}`,
        most: w.slug === most.slug,
      })),
      most: { name: most.name, n: most.awards.length },
    };
    live.push("winners");
  } else fallback.push("winners");

  // Just awarded: most recent award notices with a winner and an amount, one per source.
  const awards = spread(
    rfps
      .filter((r) => {
        if (!isPastContract(r)) return false;
        const a = parseAward(r.summary);
        return Boolean(a.winner && a.amount);
      })
      .sort((a, b) => (b.deadline ?? "").localeCompare(a.deadline ?? "")),
    (r) => r.slug.match(/-(cba|tora|nsa|qca)-/)?.[1] ?? "",
  ).slice(0, 3);
  if (awards.length) {
    data.awards = awards.map((r) => {
      const a = parseAward(r.summary);
      return {
        trade: r.categories[0] ? trade(r.categories[0]) : "",
        value: dollars(a.amount ?? 0, lang),
        title: r.title,
        buyer: publicTenderSource(r.slug).badge.replace(/^Past public contract · /, ""),
        winner: a.winner ?? "",
        date: short(r.deadline),
        href: `/rfps/${r.slug}`,
      };
    });
    live.push("awards");
  } else fallback.push("awards");

  // Toast: next closer, another open tender, latest award.
  const toast: V3Data["toast"] = [];
  const first = ca[0] ?? closingSoon[0];
  if (first) {
    const d = daysUntil(first.deadline) ?? 0;
    toast.push({ tag: d <= 1 ? t.toastTags.closesTomorrow : fmt(t.toastTags.closesOn, { date: short(first.deadline) }), color: "#8A3F06", title: `${first.title} · ${place(first)}` });
  }
  const second = tickerPool.find((r) => r.slug !== first?.slug);
  if (second) toast.push({ tag: fmt(t.toastTags.openNow, { date: short(second.deadline) }), color: "#15803D", title: `${second.title} · ${place(second)}` });
  if (data.awards[0] && awards.length) {
    const w = data.awards[0];
    toast.push({ tag: fmt(t.toastTags.awarded, { date: w.date, value: w.value }), color: "#282B59", title: fmt(t.toastTags.wonBy, { title: w.title, winner: w.winner }) });
  }
  if (toast.length) data.toast = toast;

  return { data, live, fallback };
}

export default async function HomePage({ params }: { params: Promise<object> }) {
  const lang = await setLangFrom(params);
  const t = getT("homeV3");
  const { data, live, fallback } = await load(lang, t);
  return <HomeV3 data={data} t={t} lang={lang} dataSources={{ live, fallback }} />;
}
