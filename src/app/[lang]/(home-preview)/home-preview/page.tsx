import type { Metadata } from "next";
import { setLangFrom } from "@/i18n/server";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { winnersFromRfps } from "@/lib/data/winners";
import { boardStats, compactDollars, daysUntil, isPastContract, parseAward } from "@/lib/data/fomo";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import type { RfpListItem } from "@/lib/data/types";
import { HomeV3, type V3Closing, type V3Data } from "@/components/home-v3/home-v3";
import { V3_FALLBACK } from "@/components/home-v3/fallback";

/**
 * Preview of the Claude Design homepage (handoff 2026-10-07). Lives in its own
 * route group so the marketing layout's SiteHeader/SiteFooter don't wrap it:
 * the design ships its own announcement bar, header and footer. Not indexed,
 * not in the sitemap or nav.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: { absolute: "PMRFP homepage preview" },
  robots: { index: false, follow: false },
};

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

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monDay(d: string | null): { mon: string; day: string } {
  if (!d) return { mon: "", day: "" };
  const [, m, day] = d.slice(0, 10).split("-");
  return { mon: MON[Number(m) - 1] ?? "", day: String(Number(day)) };
}
const short = (d: string | null) => {
  const x = monDay(d);
  return `${x.mon} ${x.day}`.trim();
};
const place = (r: RfpListItem) => r.regionName ?? r.city ?? r.province ?? "";
const tag = (r: RfpListItem) => [r.categories[0], place(r)].filter(Boolean).join(" · ");

function closingCard(r: RfpListItem): V3Closing {
  const d = daysUntil(r.deadline) ?? 0;
  const { mon, day } = monDay(r.deadline);
  return {
    mon,
    day,
    tag: tag(r),
    left: d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days left`,
    title: r.title,
    href: `/rfps/${r.slug}`,
    soon: d <= 1,
  };
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

async function load(): Promise<{ data: V3Data; live: string[]; fallback: string[] }> {
  const live: string[] = [];
  const fallback: string[] = [];
  const data: V3Data = structuredClone(V3_FALLBACK);

  const [rfpsR, catsR, regionsR, soldR] = await Promise.allSettled([
    listAllRfpsCached(),
    getCategories(),
    getRegions(),
    cachedLifetimeCount(),
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

  const rfps = rfpsR.status === "fulfilled" ? rfpsR.value : null;
  if (!rfps?.length) {
    fallback.push("board");
    return { data, live, fallback };
  }

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
  data.big = { name: BIG.name, n: counts.get(BIG.name) ?? 0, img: BIG.img, href: tradeHref(BIG.name) };
  data.tiles = TILES.map((t) => ({ ...t, n: counts.get(t.name) ?? 0, href: tradeHref(t.name) }));
  const shown = new Set([BIG.name, ...TILES.map((t) => t.name)]);
  data.chips = [...counts]
    .filter(([name, n]) => !shown.has(name) && n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 9)
    .map(([name, n]) => ({ name, n, href: tradeHref(name) }));
  if (cats?.length) {
    data.tradeOptions = [...cats]
      .sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.slug, label: c.name }));
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
    data.ticker = tickerPool.map((r) => ({ tag: tag(r), title: r.title, when: `closes ${short(r.deadline)}`, href: `/rfps/${r.slug}` }));
  }

  // Trade Pro example: the busiest trade's next three closers.
  const pool = closingSoon.filter((r) => !isFrench(r) && r.categories[0]);
  const byTrade = new Map<string, number>();
  for (const r of pool) byTrade.set(r.categories[0], (byTrade.get(r.categories[0]) ?? 0) + 1);
  const busiest = [...byTrade].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (busiest) {
    const rows = pool.filter((r) => r.categories[0] === busiest).slice(0, 3);
    if (rows.length) {
      data.alertTrade = busiest;
      data.alerts = rows.map((r) => ({ where: `${busiest} · ${place(r)}`, title: r.title, href: `/rfps/${r.slug}` }));
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
      value: compactDollars(value),
      top: winners.slice(0, 8).map((w) => ({
        name: w.name,
        n: w.awards.length,
        value: compactDollars(w.totalValue),
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
        trade: r.categories[0] ?? "",
        value: `$${Math.round(a.amount ?? 0).toLocaleString("en-US")}`,
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
    toast.push({ tag: d <= 1 ? "Closes tomorrow" : `Closes ${short(first.deadline)}`, color: "#8A3F06", title: `${first.title} · ${place(first)}` });
  }
  const second = tickerPool.find((r) => r.slug !== first?.slug);
  if (second) toast.push({ tag: `Open now · closes ${short(second.deadline)}`, color: "#15803D", title: `${second.title} · ${place(second)}` });
  if (data.awards[0] && awards.length) {
    const w = data.awards[0];
    toast.push({ tag: `Awarded ${w.date} · ${w.value}`, color: "#282B59", title: `${w.title} · won by ${w.winner}` });
  }
  if (toast.length) data.toast = toast;

  return { data, live, fallback };
}

export default async function HomePreviewPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const { data, live, fallback } = await load();
  return <HomeV3 data={data} dataSources={{ live, fallback }} />;
}
