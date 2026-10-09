/**
 * Source labels for U.S. state and local tender feeds (Florida VBS, LA
 * County, NC eVP, SCBO, LA City RAMP). Kept out of sources.ts so
 * feeds can be added without touching the shared list; sources.ts spreads
 * these in ahead of its own entries.
 */
import type { PublicTenderSource } from "./sources";

export const FL_VBS_ATTRIBUTION =
  "Source: Florida Vendor Bid System, MyFloridaMarketPlace — State of Florida public solicitation notice.";
export const DELAWARE_ATTRIBUTION =
  "Source: State of Delaware Open Data — Open Bids (data.delaware.gov), public solicitation notice.";
export const LA_COUNTY_ATTRIBUTION =
  "Source: Los Angeles County open solicitations list (camisvr.co.la.ca.us/LACoBids) — public solicitation notice.";

export const NC_EVP_ATTRIBUTION =
  "Source: North Carolina electronic Vendor Portal (eVP), NC Department of Administration — public solicitation notice.";
export const SCBO_ATTRIBUTION =
  "Source: South Carolina Business Opportunities (SCBO), SC Division of Procurement Services — public advertisement.";
export const LA_CITY_ATTRIBUTION =
  "Source: City of Los Angeles Open Data (data.lacity.org) — RAMP Open Bid Opportunities, CC0 1.0 public domain.";

// Suffixes end in the source's own id, so a title word can't match.
export const US_STATE_SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  [/-ncevp-[a-f0-9]{32}$/, { key: "nc-evp", past: false, badge: "Public tender · North Carolina", issuer: "a North Carolina public body", portal: "the NC eVP portal", bidLabel: "Open on NC eVP", attribution: NC_EVP_ATTRIBUTION }],
  [/-scbo-\d+$/, { key: "scbo", past: false, badge: "Public tender · South Carolina", issuer: "a South Carolina public body", portal: "SC Business Opportunities", bidLabel: "Open the SCBO ad", attribution: SCBO_ATTRIBUTION }],
  [/-lacr-\d+$/, { key: "la-city", past: false, badge: "Public tender · City of Los Angeles", issuer: "a City of Los Angeles agency", portal: "RAMP LA", bidLabel: "Open on RAMP LA", attribution: LA_CITY_ATTRIBUTION }],
  [/-flvbs-\d+$/, { key: "florida-vbs", past: false, badge: "Public tender · State of Florida", issuer: "a Florida state agency", portal: "the Florida Vendor Bid System", bidLabel: "Open on Florida VBS", attribution: FL_VBS_ATTRIBUTION }],
  [/-lacb-\d+$/, { key: "la-county", past: false, badge: "Public tender · Los Angeles County", issuer: "Los Angeles County", portal: "the LA County bid site", bidLabel: "Open on LA County bids", attribution: LA_COUNTY_ATTRIBUTION }],
  [/-debid-\d+$/, { key: "delaware", past: false, badge: "Public tender · State of Delaware", issuer: "a State of Delaware agency", portal: "the Delaware MyMarketplace bid site", bidLabel: "Open on Delaware MyMarketplace", attribution: DELAWARE_ATTRIBUTION }],
];
