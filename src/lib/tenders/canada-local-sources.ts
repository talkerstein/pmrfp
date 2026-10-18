/**
 * Source labels for Canadian buyer-website tender feeds (Ontario Northland,
 * District of Saanich, Fraser Valley Regional District, City of Portage la
 * Prairie, SaskTenders). Kept
 * out of sources.ts, like us-state-sources.ts; sources.ts spreads these in.
 *
 * Every slug ends `-<marker>-<ref>` where ref is either the 12-hex urlRef()
 * of the official notice URL or (SaskTenders) the competition GUID without
 * dashes — hex only, so no other importer's marker can hide inside it.
 */
import type { PublicTenderSource } from "./sources";

export const ONTARIO_NORTHLAND_ATTRIBUTION =
  "Source: Ontario Northland Transportation Commission (ontarionorthland.ca) — public procurement notice.";
export const SAANICH_ATTRIBUTION =
  "Source: District of Saanich bid opportunities (saanich.ca) — public procurement notice.";
export const FVRD_ATTRIBUTION =
  "Source: Fraser Valley Regional District tenders & RFPs (fvrd.ca) — public procurement notice.";
export const PORTAGE_ATTRIBUTION =
  "Source: City of Portage la Prairie tenders and proposals (city-plap.com) — public tender notice.";
export const GUELPH_ERAMOSA_ATTRIBUTION =
  "Source: Township of Guelph/Eramosa bids and tenders (get.on.ca) — public tender notice.";
export const SASKTENDERS_ATTRIBUTION =
  "Source: SaskTenders (sasktenders.ca), Government of Saskatchewan — public competition notice.";

export const CANADA_LOCAL_SOURCES: [suffix: RegExp, source: PublicTenderSource][] = [
  [/-ontn-[a-f0-9]{12}$/, { key: "ontario-northland", past: false, badge: "Public tender · Ontario Northland", issuer: "Ontario Northland", portal: "the Ontario Northland website", bidLabel: "Open the Ontario Northland notice", attribution: ONTARIO_NORTHLAND_ATTRIBUTION }],
  [/-saan-[a-f0-9]{12}$/, { key: "saanich", past: false, badge: "Public tender · District of Saanich", issuer: "the District of Saanich", portal: "the District of Saanich website", bidLabel: "Open the Saanich notice", attribution: SAANICH_ATTRIBUTION }],
  [/-fvrd-[a-f0-9]{12}$/, { key: "fvrd", past: false, badge: "Public tender · Fraser Valley Regional District", issuer: "the Fraser Valley Regional District", portal: "the FVRD website", bidLabel: "Open the FVRD notice", attribution: FVRD_ATTRIBUTION }],
  [/-plap-[a-f0-9]{12}$/, { key: "portage-la-prairie", past: false, badge: "Public tender · City of Portage la Prairie", issuer: "the City of Portage la Prairie", portal: "the City of Portage la Prairie website", bidLabel: "Open the City notice", attribution: PORTAGE_ATTRIBUTION }],
  [/-gete-[a-f0-9]{12}$/, { key: "guelph-eramosa", past: false, badge: "Public tender · Township of Guelph/Eramosa", issuer: "the Township of Guelph/Eramosa", portal: "the Township of Guelph/Eramosa website", bidLabel: "Open the Township's bids page", attribution: GUELPH_ERAMOSA_ATTRIBUTION }],
  [/-sktn-[a-f0-9]{32}$/, { key: "sasktenders", past: false, badge: "Public tender · Saskatchewan", issuer: "a Saskatchewan public body", portal: "SaskTenders", bidLabel: "Open on SaskTenders", attribution: SASKTENDERS_ATTRIBUTION }],
];
