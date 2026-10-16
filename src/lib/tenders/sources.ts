/**
 * Who issued a public tender (or past contract) and how to credit them —
 * derived from the slug suffix each importer writes, because the public
 * rfp_public view only exposes source_type, not the source URL or notes.
 * Safe to import from any component.
 */
import { US_STATE_SOURCES } from "./us-state-sources";
import { CANADA_LOCAL_SOURCES } from "./canada-local-sources";

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

// Slug suffix → source. Each importer builds `${slugify(title)}-<marker>-<ref>`,
// so the source is the importer marker nearest the END of the slug that is
// followed by a valid reference for that importer. A title word
// ("…-mont-joli-qc-cb-cw2466670") always sits left of the real marker, so it
// can never win (see publicTenderSource); list order doesn't matter.
//
// Reference formats seen across every public_source row (2026-10-12):
//   CanadaBuys (open/closed/awards)  cb-161-43955128 · ws5846022405-doc5846123481
//                                    · mx-443841876264 · cw2466670 (+ legacy pw-…)
//   Toronto (open/awards)            5830241025
//   Yukon (open/closed)              rfb-2026-9-5555 · rso-rfb-2026-9-5560
//   SEAO, Nova Scotia                buyer-assigned free text (ao-21243,
//                                    us-24-e5-1125-00, vic-rfp-04-02-26)
// A reference only has to be strict where it can itself contain another
// marker: an award or closed ref "cb-161-…" contains "-cb-", and a SEAO ref
// "us-24-…" contains "-us-". So open CanadaBuys ("cb") and SAM ("us") are
// anchored to their exact formats. The rest stay permissive on purpose: a row
// whose ref failed a too-strict pattern would fall back to "canadabuys" and be
// archived by the CanadaBuys run as "gone from the feed".
const CB_REF = String.raw`(?:cb-\d+-\d+|ws\d+-doc\d+|mx-\d+|cw\d+|pw-[a-z0-9-]+)`;
const CB_CLOSED_REF = String.raw`(?:cb-\d+-\d+|ws\d+-doc\d+|mx-\d+)`; // CLOSED_REF in canadabuys-closed.ts
const FREE_REF = "[a-z0-9-]+";
const suffix = (marker: string, ref: string) => new RegExp(`-${marker}-${ref}$`);

const SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  [suffix("cbc", CB_CLOSED_REF), { key: "canadabuys-closed", past: false, closedArchive: true, badge: "Closed public tender · Gov. of Canada", issuer: "the Government of Canada", portal: "CanadaBuys", bidLabel: "Open the notice on CanadaBuys", attribution: OGL_CANADA_ATTRIBUTION }],
  [suffix("ykc", FREE_REF), { key: "yukon-closed", past: false, closedArchive: true, badge: "Closed public tender · Yukon", issuer: "the Government of Yukon", portal: "Yukon's bids&tenders portal", bidLabel: "Open Yukon's portal", attribution: OGL_YUKON_ATTRIBUTION }],
  ...US_STATE_SOURCES,
  ...CANADA_LOCAL_SOURCES,
  [suffix("cba", FREE_REF), { key: "awards", past: true, badge: "Past public contract · Gov. of Canada", issuer: "the Government of Canada", portal: "CanadaBuys", bidLabel: "Bid on CanadaBuys", attribution: OGL_CANADA_ATTRIBUTION }],
  [suffix("qca", FREE_REF), { key: "seao", past: true, badge: "Past public contract · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [suffix("tora", FREE_REF), { key: "toronto-awards", past: true, badge: "Past public contract · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
  [suffix("nsa", FREE_REF), { key: "ns-awards", past: true, badge: "Past public contract · Nova Scotia", issuer: "a Nova Scotia public body", portal: "the Nova Scotia procurement portal", bidLabel: "Open the NS portal", attribution: OGL_NS_ATTRIBUTION }],
  [suffix("qc", FREE_REF), { key: "seao", past: false, badge: "Public tender · Quebec (SEAO)", issuer: "a Quebec public body", portal: "SEAO", bidLabel: "Bid on SEAO", attribution: SEAO_ATTRIBUTION }],
  [suffix("tor", FREE_REF), { key: "toronto", past: false, badge: "Public tender · City of Toronto", issuer: "the City of Toronto", portal: "the City of Toronto bid portal", bidLabel: "Bid on the City portal", attribution: OGL_TORONTO_ATTRIBUTION }],
  // SAM NoticeIds are 32 hex chars (a SEAO ref like "us-24-e5-1125-00" isn't one).
  [/-us-[a-f0-9]{32}$/, { key: "sam", past: false, badge: "Public tender · U.S. federal (SAM.gov)", issuer: "a U.S. federal agency", portal: "SAM.gov", bidLabel: "Bid on SAM.gov", attribution: SAM_ATTRIBUTION }],
  [/-nyc-\d{6,}$/, { key: "nyc", past: false, badge: "Public tender · City of New York", issuer: "the City of New York", portal: "The City Record / PASSPort", bidLabel: "Open the City Record notice", attribution: NYC_ATTRIBUTION }],
  [suffix("yk", FREE_REF), { key: "yukon", past: false, badge: "Public tender · Yukon", issuer: "the Government of Yukon", portal: "Yukon's bids&tenders portal", bidLabel: "Bid on Yukon's portal", attribution: OGL_YUKON_ATTRIBUTION }],
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

// Open CanadaBuys is the fallback, but it still needs an entry: that's what
// out-ranks a title word ("…-qc-cb-…") another marker would otherwise claim.
// `^.*(…)` is greedy, so each pattern captures its rightmost (shortest) match.
const ALL: [suffix: RegExp, source: PublicTenderSource][] = [...SOURCES, [suffix("cb", CB_REF), CANADABUYS]];
const MATCHERS = ALL.map(([re, src]): [rightmost: RegExp, source: PublicTenderSource] => [new RegExp(`^.*(${re.source})`), src]);

/** The source whose marker sits nearest the end of the slug (with a valid reference after it). */
export function publicTenderSource(slug: string): PublicTenderSource {
  let best = CANADABUYS;
  let bestAt = -1;
  for (const [re, src] of MATCHERS) {
    const m = re.exec(slug);
    if (!m) continue;
    const at = slug.length - m[1].length;
    if (at > bestAt) [best, bestAt] = [src, at];
  }
  return best;
}
