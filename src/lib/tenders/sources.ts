/**
 * Who issued a public tender (or past contract) and how to credit them —
 * derived from the slug suffix each importer writes, because the public
 * rfp_public view only exposes source_type, not the source URL or notes.
 * Safe to import from any component.
 */
import { US_STATE_SOURCES } from "./us-state-sources";

export const OGL_CANADA_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Canada.";
export const OGL_TORONTO_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Toronto.";
export const SEAO_ATTRIBUTION =
  "Source: Système électronique d'appel d'offres (SEAO), Secrétariat du Conseil du trésor du Québec — Données Québec, CC BY 4.0.";
export const OGL_NS_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Nova Scotia.";
export const OGL_YUKON_ATTRIBUTION =
  "Contains information licensed under the Open Government Licence – Yukon.";

export const SAM_ATTRIBUTION =
  "Source: SAM.gov Contract Opportunities, U.S. General Services Administration (U.S. federal government data, public domain).";

export const NYC_ATTRIBUTION =
  "Source: The City Record, City of New York — NYC Open Data (Current Solicitations).";

export interface PublicTenderSource {
  /** Importer feed key — archiving is scoped per key. */
  key: string;
  /** Already awarded — a past public contract, not a biddable tender. */
  past: boolean;
  /** Short badge text for cards. */
  badge: string;
  /** "Issued by …" */
  issuer: string;
  /** Where bids actually go. */
  portal: string;
  /** Member CTA on open tenders. */
  bidLabel: string;
  attribution: string;
  /**
   * Real tender that has CLOSED, imported from the buyer's historical open
   * data (never shown as open, never alerted, excluded from open counts —
   * its deadline is the real closing date, always in the past).
   */
  closedArchive?: boolean;
}

// Slug suffix → source. Every suffix is distinct ("-tora-" never matches
// "-tor-<digits>"), so order is for readability only.
const SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  // Closed archives first: their suffix ends in a strict reference format, and
  // a looser open-feed pattern ("-qc-…") must never claim them.
  [/-cbc-(?:cb-\d+-\d+|ws\d+-doc\d+|mx-\d+)$/, { key: "canadabuys-closed", past: false, closedArchive: true, badge: "Closed public tender · Gov. of Canada", issuer: "the Government of Canada", portal: "CanadaBuys", bidLabel: "Open the notice on CanadaBuys", attribution: OGL_CANADA_ATTRIBUTION }],
  [/-ykc-[a-z0-9-]+$/, { key: "yukon-closed", past: false, closedArchive: true, badge: "Closed public tender · Yukon", issuer: "the Government of Yukon", portal: "Yukon's bids&tenders portal", bidLabel: "Open Yukon's portal", attribution: OGL_YUKON_ATTRIBUTION }],
  ...US_STATE_SOURCES,
  [/-cba-[a-z0-9-]+$/, { key: "awards", past: true, badge: "Past public contract · Gov. of Canada", issuer: "the Government of Canada", portal: "CanadaBuys", bidLabel: "Bid on CanadaBuys", attribution: OGL_CANADA_ATTRIBUTION }],
  [/-qca-[a-z0-9-]+$/, { key: "seao", past: true, badge: "Past public contract · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [/-tora-[a-z0-9-]+$/, { key: "toronto-awards", past: true, badge: "Past public contract · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
  [/-nsa-[a-z0-9-]+$/, { key: "ns-awards", past: true, badge: "Past public contract · Nova Scotia", issuer: "a Nova Scotia public body", portal: "the Nova Scotia procurement portal", bidLabel: "Open the NS portal", attribution: OGL_NS_ATTRIBUTION }],
  [/-qc-[a-z0-9-]+$/, { key: "seao", past: false, badge: "Public tender · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [/-tor-[a-z0-9-]+$/, { key: "toronto", past: false, badge: "Public tender · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
  // SAM NoticeIds are 32 hex chars — anchored so a CanadaBuys title with "-us-" in it never matches.
  [/-us-[a-f0-9]{32}$/, { key: "sam", past: false, badge: "Public tender · U.S. federal (SAM.gov)", issuer: "a U.S. federal agency", portal: "SAM.gov", bidLabel: "Bid on SAM.gov", attribution: SAM_ATTRIBUTION }],
  [/-nyc-\d{6,}$/, { key: "nyc", past: false, badge: "Public tender · City of New York", issuer: "the City of New York", portal: "The City Record / PASSPort", bidLabel: "Open the City Record notice", attribution: NYC_ATTRIBUTION }],
  [/-yk-[a-z0-9-]+$/, { key: "yukon", past: false, badge: "Public tender · Yukon", issuer: "the Government of Yukon", portal: "Yukon's bids&tenders portal", bidLabel: "Bid on Yukon's portal", attribution: OGL_YUKON_ATTRIBUTION }],
];

const CANADABUYS: PublicTenderSource = {
  key: "canadabuys",
  past: false,
  badge: "Public tender · Gov. of Canada",
  issuer: "the Government of Canada",
  portal: "CanadaBuys",
  bidLabel: "Bid on CanadaBuys",
  attribution: OGL_CANADA_ATTRIBUTION,
};

export function publicTenderSource(slug: string): PublicTenderSource {
  return SOURCES.find(([suffix]) => suffix.test(slug))?.[1] ?? CANADABUYS;
}
