/**
 * The "city flow": public buyers who said yes to PMRFP listing their
 * tenders, one config entry each. Pure data (types only imported), so the
 * source labels (sources.ts), pages and the cron share it.
 *
 * Adding the next city that says yes:
 *   1. Log the reply (briefs/outreach/buyer-permissions.csv) and make sure the
 *      buyer's permission is "yes" with the right method: approve its request
 *      at /admin/buyer-sources, or add it to PERMISSION_SEED
 *      (src/lib/buyers/permissions.ts).
 *   2. Check the bid page by hand: robots.txt allows it, the list is on the
 *      buyer's OWN site (not bids&tenders, Bonfire, MERX, Biddingo, BC Bid…),
 *      and note its shape (table, list, RSS).
 *   3. Add an entry below: a unique 3–6 letter marker, the buyer slug from
 *      src/lib/buyers/directory.json, and `list` with the generic parser that
 *      fits (html-table: header names; html-list: item pattern; rss). Only a
 *      page none of these fit needs a small parser of its own.
 *   4. Add the French and Spanish copy (`copy`), save the page as a fixture
 *      and add a parser test (test/unit/city-sources.test.ts).
 *   5. Run /api/cron/canada-local-tenders?dry=1 and check `citySources`.
 *
 * A buyer whose bids live on a commercial platform gets `list.kind:
 * "platform"`: nothing is read, and the buyer page shows a link-out card.
 */
import type { PublicTenderSource } from "./sources";
import type { PlatformKey } from "@/lib/buyers/model";
import type { PermissionMethod } from "@/lib/buyers/permissions";

/** A bid list as an HTML table: columns found by their header text. */
export interface HtmlTableList {
  kind: "html-table";
  url: string;
  /** The table to read (first match). Default: the first table whose headers name a title and a closing date. */
  table?: RegExp;
  columns: { title: RegExp; closing: RegExp; reference?: RegExp; posted?: RegExp; status?: RegExp };
}

/** A bid list as repeated blocks (li, div, article): one notice per `item` match. */
export interface HtmlItemList {
  kind: "html-list";
  url: string;
  /** Capture 1 = the part of the page holding the list. Default: <main>, else the whole page. */
  container?: RegExp;
  /** One notice per match; capture 1 (or the whole match) = its HTML. */
  item: RegExp;
  /** Capture 1 = the closing date text. Default: "Closing (date): …". */
  closing?: RegExp;
  reference?: RegExp;
  posted?: RegExp;
  status?: RegExp;
}

/** An official RSS feed of the bid list. */
export interface RssList {
  kind: "rss";
  url: string;
  /** Capture 1 = the closing date inside the item description. Default: "Closing (date): …". */
  closing?: RegExp;
  reference?: RegExp;
}

/** Bids hosted on a third-party platform PMRFP never reads: link out only. */
export interface PlatformHosted {
  kind: "platform";
  platform: PlatformKey;
  /** The buyer's own portal on that platform, as linked from its official page. */
  portalUrl: string;
}

export type CityList = HtmlTableList | HtmlItemList | RssList | PlatformHosted;

export interface CitySourceCopy {
  badge: string;
  issuer: string;
  portal: string;
  bidLabel: string;
  attribution: string;
}

export interface CitySourceConfig {
  /** Feed key (archiving is scoped per key). */
  key: string;
  /** Slug marker: rows are `<title>-<marker>-<12 hex>`. Unique, 3–6 lowercase letters. */
  marker: string;
  /** Buyer slug in src/lib/buyers/directory.json and the permission registry. */
  buyerSlug: string;
  /** "City of Nanaimo" (stored summaries start "Public tender from <buyer>"). */
  buyer: string;
  /** In a sentence: "the City of Nanaimo". */
  issuer: string;
  provinceCode: string;
  /** rfp_posts.province */
  province: string;
  /** regions.slug */
  regionSlug: string;
  /** The buyer's official bids page (the link back). */
  officialUrl: string;
  /** Hosts this source may read. Default: the list URL's host. */
  hosts?: readonly string[];
  /** Procurement contact as the buyer publishes it. */
  contact: { name: string | null; email: string | null; phone: string | null };
  list: CityList;
  minMatchesToArchive?: number;
  /** English labels (sources.ts) and their French and Spanish copy. */
  copy: { en: CitySourceCopy; fr: CitySourceCopy; es: CitySourceCopy };
  /** When the bid page was last checked by hand. */
  checkedOn: string;
  notes?: string;
}

export const NANAIMO: CitySourceConfig = {
  key: "nanaimo",
  marker: "nnmo",
  buyerSlug: "city-of-nanaimo",
  buyer: "City of Nanaimo",
  issuer: "the City of Nanaimo",
  provinceCode: "BC",
  province: "British Columbia",
  regionSlug: "british-columbia",
  officialUrl: "https://www.nanaimo.ca/doing-business/procurement-services/bid-opportunities",
  contact: { name: "City of Nanaimo Procurement", email: "procurement@nanaimo.ca", phone: "250-756-5319" },
  // Checked 2026-10-21: robots.txt allows the page, but the page lists no bids.
  // It links to nanaimo.bidsandtenders.ca, and bids&tenders' terms bar
  // automated reads, so PMRFP never reads it. Link-out only until the City
  // emails notices (info@pmrfp.com) or offers a feed of its own.
  list: { kind: "platform", platform: "bids-and-tenders", portalUrl: "https://nanaimo.bidsandtenders.ca/Module/Tenders/en" },
  copy: {
    en: {
      badge: "Listed with permission · City of Nanaimo",
      issuer: "the City of Nanaimo",
      portal: "the City of Nanaimo's official posting",
      bidLabel: "View and bid on the official posting",
      attribution: "Listed with permission from the City of Nanaimo. The City's official posting is the source of record.",
    },
    fr: {
      badge: "Publié avec autorisation · Ville de Nanaimo",
      issuer: "la Ville de Nanaimo",
      portal: "l'avis officiel de la Ville de Nanaimo",
      bidLabel: "Consulter l'avis officiel et soumissionner",
      attribution: "Publié avec l'autorisation de la Ville de Nanaimo. L'avis officiel de la Ville fait foi.",
    },
    es: {
      badge: "Publicado con permiso · Ciudad de Nanaimo",
      issuer: "la Ciudad de Nanaimo",
      portal: "la publicación oficial de la Ciudad de Nanaimo",
      bidLabel: "Ver la publicación oficial y presentar una oferta",
      attribution: "Publicado con permiso de la Ciudad de Nanaimo. La publicación oficial de la Ciudad es la fuente oficial.",
    },
  },
  checkedOn: "2026-10-21",
  notes: "Permission granted 2026-10-20 (procurement@nanaimo.ca). Bids are hosted on bids&tenders.",
};

/** Every city that said yes, in the order they run. */
export const CITY_SOURCES: readonly CitySourceConfig[] = [NANAIMO];

/** How a list is read, as a permission method (null: nothing is read). */
export function methodFor(list: CityList): PermissionMethod | null {
  if (list.kind === "platform") return null;
  return list.kind === "rss" ? "feed" : "read_public_page";
}

export function cityByKey(key: string, configs: readonly CitySourceConfig[] = CITY_SOURCES): CitySourceConfig | null {
  return configs.find((c) => c.key === key) ?? null;
}

export function cityByBuyer(buyerSlug: string, configs: readonly CitySourceConfig[] = CITY_SOURCES): CitySourceConfig | null {
  return configs.find((c) => c.buyerSlug === buyerSlug) ?? null;
}

/** The source label for a city's rows (sources.ts / canada-local-sources.ts). */
export function citySourceLabel(c: CitySourceConfig): PublicTenderSource {
  return {
    key: c.key,
    past: false,
    ...c.copy.en,
    permission: {
      buyerSlug: c.buyerSlug,
      issuer: c.issuer,
      officialUrl: c.officialUrl,
      contactEmail: c.contact.email,
      contactPhone: c.contact.phone,
    },
  };
}

/** Slug suffix → label, for every city (12-hex reference, so no other marker can hide in it). */
export const CITY_SOURCE_LABELS: [suffix: RegExp, source: PublicTenderSource][] = CITY_SOURCES.map((c) => [
  new RegExp(`-${c.marker}-[a-f0-9]{12}$`),
  citySourceLabel(c),
]);

/** French or Spanish labels keyed by source key (board.detail.sources). */
export function cityCopy(lang: "fr" | "es"): Record<string, { issuer: string; portal: string; bidLabel: string; attribution: string }> {
  return Object.fromEntries(
    CITY_SOURCES.map((c) => {
      const { issuer, portal, bidLabel, attribution } = c.copy[lang];
      return [c.key, { issuer, portal, bidLabel, attribution }];
    }),
  );
}

/** Credits for lib/data-credits: the English attribution with its translations. */
export function cityCredits(): { en: string; fr: string; es: string }[] {
  return CITY_SOURCES.map((c) => ({ en: c.copy.en.attribution, fr: c.copy.fr.attribution, es: c.copy.es.attribution }));
}
