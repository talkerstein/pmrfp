/**
 * OPEN DATA, BATCH 1: every source this batch adds, with the licence credit
 * it needs, how it refreshes, and its size estimate (the 150 MB budget is
 * asserted over these estimates in test/unit/open-data.test.ts).
 *
 * Catalogue ids are from briefs/research/2026-10-22-open-data-catalogue.csv.
 * "licenceChecked: false" = the clause text was not read in the catalogue
 * brief (or the dataset's own licence field is blank): listed for counsel in
 * the PR. Every OGL excludes personal information; the one rule that keeps
 * individuals out is src/lib/open-data/business-name.mjs.
 *
 * Credits are shown on every page that surfaces the data (Data sources
 * block, src/components/public/data-sources-credit.tsx) and stored with each
 * award_history row (attribution column).
 */
import { OGL_CANADA as OGL_CANADA_ATTRIBUTION, OGL_TORONTO as TORONTO_ATTRIBUTION } from "./attribution";
import { ARCGIS_CITIES } from "./arcgis-permits";
import { CALGARY_ATTRIBUTION, CALGARY_LICENCE, CALGARY_SOURCE } from "./calgary";
import { FEDERAL_SOURCE } from "./federal-filter.mjs";
import type { SourceEstimate } from "./size-budget";
import { TORONTO_NC_SOURCE, TORONTO_OGL, TORONTO_PIPELINE_SOURCE } from "./toronto";
import { VANCOUVER_ATTRIBUTION, VANCOUVER_AWARDS_SOURCE, VANCOUVER_LICENCE, VANCOUVER_PERMITS_SOURCE } from "./vancouver";

export type OpenDataGroup = "weekly" | "monthly";

export interface OpenDataSource {
  key: string;
  /** Catalogue id (briefs/research/2026-10-22-open-data-catalogue.csv). */
  ref: string;
  label: string;
  what: string;
  licence: string;
  attribution: string;
  url: string;
  refresh: string;
  /** cron = a Vercel cron runs it; local = a script the owner runs on their machine. */
  how: "cron" | "local";
  group: OpenDataGroup | "award-history-weekly" | null;
  estimates: SourceEstimate[];
  licenceChecked: boolean;
  note?: string;
}

export const OPEN_DATA_SOURCES: OpenDataSource[] = [
  {
    key: VANCOUVER_AWARDS_SOURCE,
    ref: "BC-V01",
    label: "City of Vancouver: awarded contracts (with every bidder's amount)",
    what: "Winner, winning amount, number of bidders, category and date of City of Vancouver contracts.",
    licence: VANCOUVER_LICENCE,
    attribution: VANCOUVER_ATTRIBUTION,
    url: "https://opendata.vancouver.ca/explore/dataset/awarded-contracts/",
    refresh: "Mid-year (metadata modified 2026-07-23)",
    how: "local",
    group: null,
    estimates: [
      { key: VANCOUVER_AWARDS_SOURCE, table: "award_history", rows: 2_200 },
      { key: `${VANCOUVER_AWARDS_SOURCE}-bids`, table: "bid_results", rows: 6_414 },
    ],
    licenceChecked: false,
    note: "robots.txt on opendata.vancouver.ca bars bots from /api/ and /download, so the owner downloads the file in a browser; not fetched by code.",
  },
  {
    key: VANCOUVER_PERMITS_SOURCE,
    ref: "BC-V02",
    label: "City of Vancouver: issued building permits",
    what: "Building permits of the last 24 months worth $100,000 or more, with a business contractor (no address, no applicant).",
    licence: VANCOUVER_LICENCE,
    attribution: VANCOUVER_ATTRIBUTION,
    url: "https://opendata.vancouver.ca/explore/dataset/issued-building-permits/",
    refresh: "Daily at the City; loaded by hand",
    how: "local",
    group: null,
    estimates: [{ key: VANCOUVER_PERMITS_SOURCE, table: "permit_leads", rows: 4_000 }],
    licenceChecked: false,
    note: "Same robots.txt rule as the awards: browser download, local load.",
  },
  {
    key: TORONTO_NC_SOURCE,
    ref: "ON-T03",
    label: "City of Toronto: non-competitive contracts",
    what: "Sole-source awards, flagged non-competitive (history only; never in a price median).",
    licence: TORONTO_OGL,
    attribution: TORONTO_ATTRIBUTION,
    url: "https://open.toronto.ca/dataset/tobids-non-competitive-contracts/",
    refresh: "Daily at the City; weekly here",
    how: "cron",
    group: "award-history-weekly",
    estimates: [{ key: TORONTO_NC_SOURCE, table: "award_history", rows: 2_937 }],
    licenceChecked: false,
    note: "CKAN licence field says 'License not specified'; the portal licence is OGL-Toronto. Counsel to confirm.",
  },
  {
    key: TORONTO_PIPELINE_SOURCE,
    ref: "ON-T04",
    label: "City of Toronto: capital project pipeline (planned procurements)",
    what: "46 procurements the City plans to issue, with sourcing year, scope and estimated range.",
    licence: TORONTO_OGL,
    attribution: TORONTO_ATTRIBUTION,
    url: "https://open.toronto.ca/dataset/capital-project-pipeline/",
    refresh: "As available at the City; monthly here",
    how: "cron",
    group: "monthly",
    estimates: [{ key: TORONTO_PIPELINE_SOURCE, table: "planned_procurements", rows: 60 }],
    licenceChecked: false,
    note: "Same blank CKAN licence field as ON-T03.",
  },
  {
    key: CALGARY_SOURCE,
    ref: "AB-C01",
    label: "City of Calgary: HVAC, electrical and plumbing permits (aggregated)",
    what: "The 50 most active contractors per trade over 12 months (permit counts only). No permit rows are stored.",
    licence: CALGARY_LICENCE,
    attribution: CALGARY_ATTRIBUTION,
    url: "https://data.calgary.ca/",
    refresh: "Daily at the City; monthly here",
    how: "cron",
    group: "monthly",
    estimates: [{ key: CALGARY_SOURCE, table: "contractor_activity", rows: 150 }],
    licenceChecked: false,
    note: "Socrata licence field reads 'See Terms of Use' with no link; the portal publishes OGL-Calgary. Counsel to confirm.",
  },
  {
    key: FEDERAL_SOURCE,
    ref: "CA-F06",
    label: "Government of Canada: contracts over $10,000 (building and property work of $50,000+)",
    what: "Department, vendor (business only), value, date, number of bids and solicitation procedure.",
    licence: "Open Government Licence – Canada",
    attribution: OGL_CANADA_ATTRIBUTION,
    url: "https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b",
    refresh: "Nightly at the publisher; one-time local load here",
    how: "local",
    group: null,
    estimates: [{ key: FEDERAL_SOURCE, table: "award_history", rows: 35_000 }],
    licenceChecked: true,
    note: "Same source key and ids as the monthly cron in contract-history/sources/federal.ts, so the two never duplicate rows.",
  },
  ...ARCGIS_CITIES.filter((c) => c.enabled).map(
    (c): OpenDataSource => ({
      key: c.source,
      ref: "ARC-pilot",
      label: `${c.city}: building permits (${c.province})`,
      what: "Permits of the last 24 months worth $100,000 or more with a business contractor (no address, no applicant).",
      licence: c.licence,
      attribution: c.attribution,
      url: c.datasetUrl,
      refresh: "Daily at the city; weekly here",
      how: "cron",
      group: "weekly",
      estimates: [{ key: c.source, table: "permit_leads", rows: c.estimatedRows }],
      licenceChecked: c.licenceChecked,
    }),
  ),
];

export const sourceByKey = (key: string): OpenDataSource | undefined => OPEN_DATA_SOURCES.find((s) => s.key === key);

export const allEstimates = (): SourceEstimate[] => OPEN_DATA_SOURCES.flatMap((s) => s.estimates);

/** The credit line for a permit_leads source (the strip shows it under the list). */
export const attributionForSource = (key: string): string | null => sourceByKey(key)?.attribution ?? null;
