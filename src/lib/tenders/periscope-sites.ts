/**
 * Periscope S2G / BuySpeed ("/bso/") bid boards PMRFP can read. One importer
 * (./periscope) serves every site here; a site only runs when `enabled`.
 *
 * Pure config — safe to import from components (sources.ts reads it for the
 * listing badge and attribution).
 *
 * Enable a site only after its buyer has said in writing that we may reuse the
 * public bid list (log it in briefs/outreach/buyer-permissions.csv), and after
 * re-checking its robots.txt.
 */
import type { PublicTenderSource } from "./sources";

export interface PeriscopeSite {
  /** Importer feed key — archiving is scoped per key. */
  key: string;
  /** Slug marker: `${slugify(title)}-${marker}-${bidSequence}`. Unique per site. */
  marker: string;
  /** Origin of the public board, no trailing slash. */
  base: string;
  /** U.S. state name, as rfp_posts.province. */
  state: string;
  /** regions.slug for the state. */
  regionSlug: string;
  /** Portal name as buyers and bidders know it. */
  portal: string;
  /** "the Commonwealth of Massachusetts" — who runs the board. */
  owner: string;
  attribution: string;
  /** Only enabled sites are fetched. */
  enabled: boolean;
}

export const COMMBUYS_ATTRIBUTION = "Source: COMMBUYS (Commonwealth of Massachusetts) — public bid notice";

export const PERISCOPE_SITES: PeriscopeSite[] = [
  {
    // Permission: MA Operational Services Division, 2026-10-09 (CASE:77888) —
    // "You do not need our permission to use publicly available data".
    // robots.txt (served from periscopeholdings.com) only disallows /craft.
    key: "commbuys",
    marker: "commbuys",
    base: "https://www.commbuys.com",
    state: "Massachusetts",
    regionSlug: "us-massachusetts",
    portal: "COMMBUYS",
    owner: "the Commonwealth of Massachusetts",
    attribution: COMMBUYS_ATTRIBUTION,
    enabled: true,
  },
  // Same Periscope platform, NOT enabled: none of these buyers has granted
  // permission yet. Each needs a written OK, a robots.txt re-check, a live dry
  // run, fr/es copy in i18n/messages/board.ts, and then `enabled: true`.
  {
    key: "oregonbuys",
    marker: "orbuys",
    base: "https://oregonbuys.gov",
    state: "Oregon",
    regionSlug: "us-oregon",
    portal: "OregonBuys",
    owner: "the State of Oregon",
    attribution: "Source: OregonBuys (State of Oregon) — public bid notice",
    enabled: false,
  },
  {
    key: "nevadaepro",
    marker: "nvepro",
    base: "https://nevadaepro.com",
    state: "Nevada",
    regionSlug: "us-nevada",
    portal: "Nevada ePro",
    owner: "the State of Nevada",
    attribution: "Source: Nevada ePro (State of Nevada) — public bid notice",
    enabled: false,
  },
  {
    key: "bidbuy-il",
    marker: "ilbidbuy",
    base: "https://www.bidbuy.illinois.gov",
    state: "Illinois",
    regionSlug: "us-illinois",
    portal: "BidBuy",
    owner: "the State of Illinois",
    attribution: "Source: BidBuy (State of Illinois) — public bid notice",
    enabled: false,
  },
  {
    key: "njstart",
    marker: "njstart",
    base: "https://www.njstart.gov",
    state: "New Jersey",
    regionSlug: "us-new-jersey",
    portal: "NJSTART",
    owner: "the State of New Jersey",
    attribution: "Source: NJSTART (State of New Jersey) — public bid notice",
    enabled: false,
  },
  {
    key: "arbuy",
    marker: "arbuy",
    base: "https://arbuy.arkansas.gov",
    state: "Arkansas",
    regionSlug: "us-arkansas",
    portal: "ARBuy",
    owner: "the State of Arkansas",
    attribution: "Source: ARBuy (State of Arkansas) — public bid notice",
    enabled: false,
  },
];

export const ENABLED_PERISCOPE_SITES = PERISCOPE_SITES.filter((s) => s.enabled);

/**
 * Slug suffix → source label, for every site (enabled or not, so rows keep
 * their label if a site is paused). The reference is the bid number's final
 * all-digit sequence ("BD-27-1167-PUR02-PUR01-134522" → 134522): digits only,
 * so no other importer's marker can hide inside it and out-rank this one.
 */
export const PERISCOPE_SOURCES: [suffix: RegExp, source: PublicTenderSource][] = PERISCOPE_SITES.map((s) => [
  new RegExp(`-${s.marker}-\\d+$`),
  {
    key: s.key,
    past: false,
    badge: `Public tender · ${s.state}`,
    issuer: `a ${s.state} public body`,
    portal: s.portal,
    bidLabel: `Open on ${s.portal}`,
    attribution: s.attribution,
  },
]);
