/**
 * The province page's browser list (/buyers/<province>): the row shape and
 * the search, with no imports, so the client component stays small. The
 * server half is ./province.ts.
 */

/** Groups in page order. */
export const PROVINCE_GROUPS = [
  "cities",
  "towns",
  "townships",
  "villages",
  "counties",
  "provincial",
  "school",
  "postSecondary",
  "health",
  "housing",
  "conservation",
  "agencies",
] as const;
export type ProvinceGroup = (typeof PROVINCE_GROUPS)[number];

/** One row of the browser list: short keys, it ships with the page. */
export interface CompactBuyer {
  /** Name in the page's language ("Town of Cobourg"). */
  n: string;
  /** Page slug: the row links to /buyers/<province>/<s>. */
  s: string;
  g: ProvinceGroup;
  /** 2021 Census population (municipalities). */
  p?: number;
  /** A verified public buyer manages the page. */
  v?: 1;
  /** The buyer said yes to listing its tenders on PMRFP. */
  l?: 1;
  /** Open bids on PMRFP (capped at the page's own list, 12). */
  o?: number;
}

/** Lowercase, accents and punctuation folded: "Saint-Félicien" → "saint felicien". */
export function searchKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The rows a search shows: every word of the query in the name (accents ignored), optionally only buyers with open bids. */
export function filterBuyers(items: readonly CompactBuyer[], q: string, openOnly = false): CompactBuyer[] {
  const words = searchKey(q).split(" ").filter(Boolean);
  return items.filter((i) => {
    if (openOnly && !i.o) return false;
    if (!words.length) return true;
    const k = searchKey(i.n);
    return words.every((w) => k.includes(w));
  });
}
