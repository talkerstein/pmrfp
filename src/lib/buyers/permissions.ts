/**
 * Public-buyer permission registry: who said yes, no or "link only" to
 * PMRFP listing their tenders, and how we may get them. Pure (no imports
 * beyond types), so importers, pages, the admin screen and tests share it.
 *
 * Two layers:
 *  - PERMISSION_SEED (below): every reply logged in
 *    briefs/outreach/buyer-permissions.csv (yes / conditional) and
 *    briefs/outreach/do-not-list.csv (no), Canada only. It is the registry
 *    when the buyer_permissions table isn't there yet (migration
 *    20261021000010_buyer_sources.sql).
 *  - buyer_permissions rows (admin approvals at /admin/buyer-sources).
 *
 * Rules:
 *  - A "no" in the seed always wins: no database row or admin click can turn
 *    a logged refusal into an import. Changing it is a code change.
 *  - Otherwise a database row overrides the seed row for the same slug.
 *  - A city source imports only when its buyer's status is "yes" AND the
 *    method on file matches how the source reads (see city-sources).
 *  - Platform entries (BC Bid, NBON) never gate a buyer: they only name hosts
 *    PMRFP must never read automatically.
 *
 * U.S. permissions (e.g. COMMBUYS) are not in this registry: Canada only,
 * country-first.
 */

export const PERMISSION_STATUSES = ["yes", "link_only", "no", "pending"] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];

/** How the buyer agreed we get its tenders. */
export const PERMISSION_METHODS = ["read_public_page", "email_notices", "feed"] as const;
export type PermissionMethod = (typeof PERMISSION_METHODS)[number];

export interface BuyerPermission {
  /** Buyer slug (src/lib/buyers/directory.json) or a platform key. */
  buyerSlug: string;
  buyerName: string;
  /** Canadian province/territory code; null for a platform spanning many buyers. */
  provinceCode: string | null;
  country: "CA";
  /** "platform": a portal many buyers use; it only blocks hosts, never a buyer. */
  scope: "buyer" | "platform";
  /** Hosts PMRFP must never read automatically (platform entries). */
  hosts?: readonly string[];
  status: PermissionStatus;
  method: PermissionMethod | null;
  /** Date of the reply (YYYY-MM-DD). */
  grantedOn: string | null;
  /** Who replied (role inbox, or name + title as logged). */
  contact: string | null;
  /** Their words, as logged. */
  quote: string | null;
  notes?: string | null;
  /** Where the row came from. */
  origin: "seed" | "db";
}

type Seed = Omit<BuyerPermission, "country" | "origin">;

const SEED_ROWS: Seed[] = [
  // ---- yes (briefs/outreach/buyer-permissions.csv)
  {
    buyerSlug: "city-of-nanaimo",
    buyerName: "City of Nanaimo",
    provinceCode: "BC",
    scope: "buyer",
    status: "yes",
    // Yes to being listed, but no way in yet: the City's page has no list of
    // its own. Set when the City agrees to email notices or offers a feed.
    method: null,
    grantedOn: "2026-10-20",
    contact: "Amanda Weinmeyer, Purchasing Admin Clerk · procurement@nanaimo.ca",
    quote: "Thank you for your email. That would be acceptable. Please let me know if you require anything further.",
    notes:
      "Reply to our Oct 15 request to list public facilities and construction tenders (title, short summary, closing date, procurement contact, link back). " +
      "The City's bid page links out to nanaimo.bidsandtenders.ca, whose terms bar automated reads, so nothing is imported: link-out only until the City emails notices to info@pmrfp.com or offers a feed.",
  },
  // ---- conditional: link only, no automated reads
  {
    buyerSlug: "nbon",
    buyerName: "New Brunswick Opportunities Network (NBON), Service New Brunswick",
    provinceCode: "NB",
    scope: "platform",
    hosts: ["nbon-rpanb.gnb.ca"],
    status: "link_only",
    method: null,
    grantedOn: "2026-10-09",
    contact: "Natasha Currie · NBON@snb.ca",
    quote:
      "we would have no issues with you providing a link to our web-based e-tendering system, the New Brunswick Opportunities Network (NBON)",
    notes: "No API, export or licence offered; no bot or feed access granted. Link back to the official NBON posting only.",
  },
  // ---- no (briefs/outreach/do-not-list.csv)
  {
    buyerSlug: "town-of-cochrane",
    buyerName: "Town of Cochrane (AB)",
    provinceCode: "AB",
    scope: "buyer",
    status: "no",
    method: null,
    grantedOn: "2026-10-09",
    contact: "procurement@cochrane.ca",
    quote: null,
    notes: "Asked us not to post their opportunities. Not the Cochrane District Services Board (ON), a different buyer.",
  },
  {
    buyerSlug: "bc-bid",
    buyerName: "BC Bid (Province of British Columbia)",
    provinceCode: "BC",
    scope: "platform",
    hosts: ["bcbid.gov.bc.ca", "www.bcbid.gov.bc.ca"],
    status: "no",
    method: null,
    grantedOn: "2026-10-09",
    contact: "bcbid@gov.bc.ca",
    quote: null,
    notes: "No bot scraping of BC Bid; no API.",
  },
  {
    buyerSlug: "city-of-kawartha-lakes",
    buyerName: "City of Kawartha Lakes",
    provinceCode: "ON",
    scope: "buyer",
    status: "no",
    method: null,
    grantedOn: "2026-10-16",
    contact: "vendors@kawarthalakes.ca",
    quote: null,
    notes: "Declined: advertises on bids&tenders only.",
  },
  {
    buyerSlug: "town-of-newmarket",
    buyerName: "Town of Newmarket",
    provinceCode: "ON",
    scope: "buyer",
    status: "no",
    method: null,
    grantedOn: "2026-10-16",
    contact: "procurement@newmarket.ca",
    quote: null,
    notes: "Declined: not posting on additional sites.",
  },
  {
    buyerSlug: "edmonton-public-schools",
    buyerName: "Edmonton Public Schools",
    provinceCode: "AB",
    scope: "buyer",
    status: "no",
    method: null,
    grantedOn: "2026-10-16",
    contact: "pcs.general.information@epsb.ca",
    quote: null,
    notes: "Declined: no vendor solicitation by email or phone (postal only). Do not email again.",
  },
];

export const PERMISSION_SEED: readonly BuyerPermission[] = SEED_ROWS.map((r) => ({ ...r, country: "CA", origin: "seed" }));

export type PermissionRegistry = ReadonlyMap<string, BuyerPermission>;

/** The seed alone (no database yet, or tests). */
export function seedRegistry(): PermissionRegistry {
  return mergePermissions([]);
}

/** Seed + database rows. A seed "no" can never be overridden. */
export function mergePermissions(dbRows: readonly BuyerPermission[], seed: readonly BuyerPermission[] = PERMISSION_SEED): PermissionRegistry {
  const out = new Map<string, BuyerPermission>();
  for (const s of seed) out.set(s.buyerSlug, s);
  for (const r of dbRows) {
    const s = out.get(r.buyerSlug);
    if (s?.origin === "seed" && s.status === "no") continue;
    out.set(r.buyerSlug, { ...r, origin: "db" });
  }
  return out;
}

/** True when the seed logs a refusal for this slug (admin approval is refused too). */
export function seedRefused(buyerSlug: string, seed: readonly BuyerPermission[] = PERMISSION_SEED): boolean {
  return seed.some((s) => s.buyerSlug === buyerSlug && s.status === "no");
}

/** A buyer's permission (buyer scope only; platform entries never speak for a buyer). */
export function buyerPermission(registry: PermissionRegistry, buyerSlug: string): BuyerPermission | null {
  const p = registry.get(buyerSlug);
  return p && p.scope === "buyer" ? p : null;
}

/**
 * What a buyer page adds for this buyer: "listed" (said yes: the "Listed with
 * permission" card), "none" (said no: nothing beyond the plain links it
 * already shows), "invite" (everyone else: "List your tenders on PMRFP free").
 */
export function buyerPageCta(p: BuyerPermission | null): "listed" | "none" | "invite" {
  if (!p) return "invite";
  if (p.status === "yes") return "listed";
  if (p.status === "no") return "none";
  return "invite";
}

/** May PMRFP import this buyer's tenders by this method? Only an explicit "yes" with the same method. */
export function importAllowed(registry: PermissionRegistry, buyerSlug: string, method: PermissionMethod): boolean {
  const p = buyerPermission(registry, buyerSlug);
  return Boolean(p && p.status === "yes" && p.method === method);
}

/**
 * Commercial bid platforms (and portals that said no): PMRFP links to them,
 * never reads them automatically. A host or any subdomain of it matches
 * (nanaimo.bidsandtenders.ca → bidsandtenders.ca).
 */
export const NEVER_READ_HOSTS: readonly string[] = [
  "bidsandtenders.ca",
  "bidsandtenders.com",
  "bonfirehub.ca",
  "bonfirehub.com",
  "biddingo.com",
  "merx.com",
  "ariba.com",
  "jaggaer.com",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const hostMatches = (host: string, rule: string) => host === rule || host.endsWith(`.${rule}`);

/** Hosts no city source may fetch: the commercial platforms plus every platform entry that isn't a "yes". */
export function blockedHosts(registry: PermissionRegistry): string[] {
  const fromRegistry = [...registry.values()].filter((p) => p.scope === "platform" && p.status !== "yes").flatMap((p) => p.hosts ?? []);
  return [...new Set([...NEVER_READ_HOSTS, ...fromRegistry])];
}

/** True when an automated read of this URL is off limits (or the URL is not http/https). */
export function isBlockedUrl(url: string, registry: PermissionRegistry): boolean {
  const host = hostOf(url);
  if (!host || !/^https?:$/.test(new URL(url).protocol)) return true;
  return blockedHosts(registry).some((rule) => hostMatches(host, rule));
}

/** Plain-English status for admin screens. */
export const STATUS_LABEL: Record<PermissionStatus, string> = {
  yes: "Yes",
  link_only: "Link only",
  no: "No",
  pending: "Pending",
};

export const METHOD_LABEL: Record<PermissionMethod, string> = {
  read_public_page: "We read their public page daily",
  email_notices: "They email notices to info@pmrfp.com",
  feed: "Feed URL",
};
