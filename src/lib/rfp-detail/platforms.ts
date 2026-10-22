/**
 * "How to bid on this platform" (depth plan, Step 2, block 8): a short guide
 * to the tendering platform a listing's official link goes to.
 *
 * Only platforms whose facts and links were read on the platform's own
 * public pages (or the owning government's) on 2026-10-22. The words are in
 * i18n/messages/rfpDepth.ts under `platform.guides`; every sentence there
 * says only what those pages said, and the block is headed "as of Oct 2026".
 * A platform we could not verify (Biddingo, the Nova Scotia portal, the
 * Ontario Tenders Portal) has no entry, and its listings get no guide.
 *
 * The guide never implies PMRFP hosts anything: documents, addenda and bid
 * submission are on the platform, and the block says so.
 */
import { cityByKey } from "@/lib/tenders/city-sources";
import type { PlatformKey } from "@/lib/buyers/model";

export const PLATFORMS_AS_OF = "2026-10-22";

export type GuidePlatform = "canadabuys" | "seao" | "bids-and-tenders" | "merx" | "bonfire" | "bc-bid" | "apc" | "sasktenders" | "sam";

export interface PlatformLinks {
  /** The platform's own home page. */
  home: string;
  /** Its registration or supplier-help page (on its own domain, or the government's that owns it). */
  help: string;
  /** The help page is in English only. */
  helpLang: "en";
}

export const PLATFORM_LINKS: Record<GuidePlatform, PlatformLinks> = {
  canadabuys: { home: "https://canadabuys.canada.ca/en", help: "https://canadabuys.canada.ca/en/register-your-business", helpLang: "en" },
  seao: { home: "https://seao.gouv.qc.ca/", help: "https://www.quebec.ca/gouvernement/faire-affaire-gouvernement/outils/systeme-electronique-appel-offre", helpLang: "en" },
  "bids-and-tenders": { home: "https://www.bidsandtenders.com/", help: "https://bidsandtenders.com/suppliers-plans/", helpLang: "en" },
  merx: { home: "https://www.merx.com/", help: "https://www.merx.com/public/faq", helpLang: "en" },
  bonfire: { home: "https://supplier.eunasolutions.com", help: "https://procurement-help.eunasolutions.com/hc/en-us/articles/48656722406291-Is-there-a-cost-associated-with-registering-an-account", helpLang: "en" },
  "bc-bid": { home: "https://www.bcbid.gov.bc.ca/", help: "https://www2.gov.bc.ca/gov/content?id=9E58A8C856E94B6B8EB7FED6AEEDD20A", helpLang: "en" },
  apc: { home: "https://purchasing.alberta.ca/", help: "https://www.alberta.ca/get-started-as-a-supplier", helpLang: "en" },
  sasktenders: { home: "https://sasktenders.ca/", help: "https://sasktenders.ca/About", helpLang: "en" },
  sam: { home: "https://sam.gov/", help: "https://sam.gov/entity-registration", helpLang: "en" },
};

export const GUIDE_PLATFORMS = Object.keys(PLATFORM_LINKS) as GuidePlatform[];

/** Official-link hosts, by platform. A host matches itself and any subdomain (nanaimo.bidsandtenders.ca). */
const HOSTS: [GuidePlatform, string[]][] = [
  ["canadabuys", ["canadabuys.canada.ca"]],
  ["seao", ["seao.gouv.qc.ca"]],
  ["bids-and-tenders", ["bidsandtenders.ca", "bidsandtenders.com"]],
  ["merx", ["merx.com"]],
  ["bonfire", ["bonfirehub.ca", "bonfirehub.com", "gobonfire.com", "eunasolutions.com"]],
  ["bc-bid", ["bcbid.gov.bc.ca"]],
  ["apc", ["purchasing.alberta.ca"]],
  ["sasktenders", ["sasktenders.ca"]],
  ["sam", ["sam.gov"]],
];

/** Importer feed key → the platform its official links point to. */
const SOURCE_PLATFORM: Record<string, GuidePlatform> = {
  canadabuys: "canadabuys",
  "canadabuys-closed": "canadabuys",
  seao: "seao",
  sasktenders: "sasktenders",
  sam: "sam",
};

/** The buyer directory's platform names that have a verified guide. */
const DIRECTORY_PLATFORM: Partial<Record<PlatformKey, GuidePlatform>> = {
  "bids-and-tenders": "bids-and-tenders",
  merx: "merx",
  bonfire: "bonfire",
  "bc-bid": "bc-bid",
  apc: "apc",
  sasktenders: "sasktenders",
};

/** The guide platform whose site this URL is on, or null. */
export function platformFromUrl(url: string | null | undefined): GuidePlatform | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, hosts] of HOSTS) if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return key;
  return null;
}

/**
 * Which platform's guide fits this listing: where its official link goes
 * (host), else the platform the importer feed belongs to, else the platform
 * a "listed with permission" city posts on, else the only platform the buyer
 * directory lists for the buyer. Null when none of these is a platform we
 * have verified.
 */
export function platformForListing(a: {
  officialUrl?: string | null;
  sourceKey?: string | null;
  buyerPlatforms?: readonly PlatformKey[] | null;
}): GuidePlatform | null {
  const byUrl = platformFromUrl(a.officialUrl);
  if (byUrl) return byUrl;
  if (a.sourceKey) {
    if (SOURCE_PLATFORM[a.sourceKey]) return SOURCE_PLATFORM[a.sourceKey];
    const city = cityByKey(a.sourceKey);
    if (city?.list.kind === "platform") return DIRECTORY_PLATFORM[city.list.platform as PlatformKey] ?? null;
  }
  const verified = [...new Set((a.buyerPlatforms ?? []).map((p) => DIRECTORY_PLATFORM[p]).filter((p): p is GuidePlatform => Boolean(p)))];
  return verified.length === 1 ? verified[0] : null;
}
