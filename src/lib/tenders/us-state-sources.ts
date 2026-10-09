/**
 * Source labels for U.S. state and local tender feeds (Florida VBS, LA
 * County). Kept out of sources.ts so feeds can be added without touching the
 * shared list; sources.ts spreads these in ahead of its own entries.
 */
import type { PublicTenderSource } from "./sources";

export const FL_VBS_ATTRIBUTION =
  "Source: Florida Vendor Bid System, MyFloridaMarketPlace — State of Florida public solicitation notice.";
export const DELAWARE_ATTRIBUTION =
  "Source: State of Delaware Open Data — Open Bids (data.delaware.gov), public solicitation notice.";
export const LA_COUNTY_ATTRIBUTION =
  "Source: Los Angeles County open solicitations list (camisvr.co.la.ca.us/LACoBids) — public solicitation notice.";

// Suffixes end in the source's numeric id, so a title word can't match.
export const US_STATE_SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  [/-flvbs-\d+$/, { key: "florida-vbs", past: false, badge: "Public tender · State of Florida", issuer: "a Florida state agency", portal: "the Florida Vendor Bid System", bidLabel: "Open on Florida VBS", attribution: FL_VBS_ATTRIBUTION }],
  [/-lacb-\d+$/, { key: "la-county", past: false, badge: "Public tender · Los Angeles County", issuer: "Los Angeles County", portal: "the LA County bid site", bidLabel: "Open on LA County bids", attribution: LA_COUNTY_ATTRIBUTION }],
  [/-debid-\d+$/, { key: "delaware", past: false, badge: "Public tender · State of Delaware", issuer: "a State of Delaware agency", portal: "the Delaware MyMarketplace bid site", bidLabel: "Open on Delaware MyMarketplace", attribution: DELAWARE_ATTRIBUTION }],
];
