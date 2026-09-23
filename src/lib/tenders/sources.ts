/**
 * Who issued a public tender (or past contract) and how to credit them —
 * derived from the slug suffix each importer writes, because the public
 * rfp_public view only exposes source_type, not the source URL or notes.
 * Safe to import from any component.
 */
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
}

// Slug suffix → source. Every suffix is distinct ("-tora-" never matches
// "-tor-<digits>"), so order is for readability only.
const SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  [/-cba-[a-z0-9-]+$/, { key: "awards", past: true, badge: "Past public contract · Gov. of Canada", issuer: "the Government of Canada", portal: "CanadaBuys", bidLabel: "Bid on CanadaBuys", attribution: OGL_CANADA_ATTRIBUTION }],
  [/-qca-[a-z0-9-]+$/, { key: "seao", past: true, badge: "Past public contract · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [/-tora-[a-z0-9-]+$/, { key: "toronto-awards", past: true, badge: "Past public contract · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
  [/-nsa-[a-z0-9-]+$/, { key: "ns-awards", past: true, badge: "Past public contract · Nova Scotia", issuer: "a Nova Scotia public body", portal: "the Nova Scotia procurement portal", bidLabel: "Open the NS portal", attribution: OGL_NS_ATTRIBUTION }],
  [/-qc-[a-z0-9-]+$/, { key: "seao", past: false, badge: "Public tender · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [/-tor-[a-z0-9-]+$/, { key: "toronto", past: false, badge: "Public tender · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
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
