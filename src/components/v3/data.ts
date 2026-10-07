import "server-only";
import { cache } from "react";
import { listAllRfpsCached } from "@/lib/data/trade-city";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { boardStats, daysUntil, isPastContract } from "@/lib/data/fomo";
import { spotsLeft } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import { rfpMarket } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import { regionName, tradeName } from "@/i18n/terms";
import { fmt, formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import type { RfpListItem } from "@/lib/data/types";

/**
 * Live numbers for the v3 pages. Every value is null when its source can't be
 * read, and the UI hides what is null: nothing here is ever a made-up number.
 * cache() dedupes the reads between the (v3) layout and the page.
 */
export interface V3Board {
  open: number | null;
  closing7: number | null;
  trades: number | null;
  regions: number | null;
  foundingLeft: number | null;
  rfps: RfpListItem[];
}

export const loadV3Board = cache(async (): Promise<V3Board> => {
  const [rfpsR, catsR, regionsR, soldR] = await Promise.allSettled([listAllRfpsCached(), getCategories(), getRegions(), cachedLifetimeCount()]);
  const rfps = rfpsR.status === "fulfilled" ? rfpsR.value : [];
  const stats = rfps.length ? boardStats(rfps) : null;
  return {
    open: stats ? stats.open : null,
    closing7: stats ? stats.closingThisWeek : null,
    trades: catsR.status === "fulfilled" && catsR.value.length ? catsR.value.length : null,
    regions: regionsR.status === "fulfilled" && regionsR.value.length ? regionsR.value.length : null,
    foundingLeft: soldR.status === "fulfilled" && soldR.value != null ? spotsLeft(soldR.value) : null,
    rfps,
  };
});

export interface V3OpenCard {
  mon: string;
  day: string;
  left: string;
  tag: string;
  title: string;
  src: string | null;
  href: string;
}

/** SEAO (Quebec) notices are published in French. */
const isFrench = (r: { slug: string }) => /-qca?-/.test(r.slug);

/** The next three biddable tenders per market (CA / US), soonest first. */
export function openCards(
  rfps: RfpListItem[],
  lang: Locale,
  words: { today: string; tomorrow: string; daysLeft: string },
): { CA: V3OpenCard[]; US: V3OpenCard[] } {
  const num = (n: number) => (lang === "en" ? String(n) : formatNumber(n, lang));
  const pool = rfps
    .filter((r) => r.status === "open" && !isPastContract(r) && (daysUntil(r.deadline) ?? -1) >= 1)
    .sort((a, b) => Number(isFrench(a) && lang !== "fr") - Number(isFrench(b) && lang !== "fr") || (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const card = (r: RfpListItem): V3OpenCard => {
    const d = daysUntil(r.deadline) ?? 0;
    const place = regionName(r.regionName ?? r.city ?? r.province ?? "", lang);
    return {
      mon: r.deadline ? formatDate(r.deadline, lang, { month: "short" }) : "",
      day: r.deadline ? String(Number(r.deadline.slice(8, 10))) : "",
      left: d <= 0 ? words.today : d === 1 ? words.tomorrow : fmt(words.daysLeft, { n: num(d) }),
      tag: [r.categories[0] ? tradeName(r.categories[0], lang) : "", place].filter(Boolean).join(" · "),
      title: r.title,
      src: r.sourceType === "public_source" ? publicTenderSource(r.slug).badge.replace(/^Public tender · /, "") : null,
      href: `/rfps/${r.slug}`,
    };
  };
  return {
    CA: pool.filter((r) => rfpMarket(r) === "CA").slice(0, 3).map(card),
    US: pool.filter((r) => rfpMarket(r) === "US").slice(0, 3).map(card),
  };
}
