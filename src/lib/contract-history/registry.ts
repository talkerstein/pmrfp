/**
 * Every award-history source: licence, how it is fetched (or why it is an
 * admin upload), and its run group. Evidence for each licence and robots
 * rule: briefs/research/project-data-sources/bid-results-sources.csv and the
 * source module's header (checked again 2026-10-16).
 *
 * Not imported, and why:
 *  - Vancouver Awarded Contracts (CA-11): robots.txt on opendata.vancouver.ca
 *    now disallows /api/ and /explore/dataset/*\/download for every bot but
 *    Googlebot. Needs the City's permission (or a published bulk file).
 *  - Chicago Contracts (US-05): no licence on the dataset, Data Portal Terms
 *    of Use not reviewed. Optional; skipped.
 *  - Hamilton / Bids&Tenders, MERX, BC Bid (captcha), SEAO notice pages:
 *    platform terms or no reuse licence; permission needed.
 */
import { collectFederal, FEDERAL_DATASET_URL, FEDERAL_LICENCE, FEDERAL_SOURCE } from "./sources/federal";
import { CANADABUYS_FILES, CANADABUYS_LICENCE, CANADABUYS_SOURCE } from "./sources/canadabuys";
import { collectSeao, SEAO_DATASET_PAGE, SEAO_LICENCE, SEAO_SOURCE } from "./sources/seao";
import { collectMontreal, collectOttawa, collectToronto, MONTREAL_ATTRIBUTION, MONTREAL_DATASETS, MONTREAL_LICENCE, MONTREAL_SOURCE, OTTAWA_ATTRIBUTION, OTTAWA_HUB, OTTAWA_LICENCE, OTTAWA_SOURCE, TORONTO_DUMP_URL, TORONTO_LICENCE, TORONTO_SOURCE } from "./sources/municipal";
import { OGL_CANADA_ATTRIBUTION, SEAO_ATTRIBUTION } from "@/lib/tenders/sources";
import { TORONTO_ATTRIBUTION } from "@/lib/data/toronto-awards";
import { collectUsaSpending, USASPENDING_ATTRIBUTION, USASPENDING_LICENCE, USASPENDING_SOURCE } from "./sources/usaspending";
import { collectTxdot, TXDOT_ATTRIBUTION, TXDOT_DATASET_URL, TXDOT_LICENCE, TXDOT_SOURCE } from "@/lib/bid-results/txdot";
import { addMonths } from "@/lib/intel/model";
import type { ParsedBatch } from "./model";

export type HistoryGroup = "weekly" | "monthly" | "federal";

export interface RunParams {
  today: string;
  since: string;
  /** SEAO: file names or YYYY-MM months to read instead of the newest weekly file. */
  files?: string[];
  weeks?: number;
  /** USAspending: activity window, and a pending job to pick up. */
  from?: string;
  to?: string;
  file?: string | null;
  /** SEAO: one /download/ link copied from the dataset page. */
  url?: string | null;
  /** Federal: stop after this many CSV records (tests, dry runs). */
  limit?: number;
}

export interface HistorySource {
  key: string;
  label: string;
  country: "CA" | "US";
  licence: string;
  /** The credit stored on its rows (award_history.attribution) and shown wherever they surface. */
  attribution: string;
  url: string;
  /** cron = fetched by /api/cron/award-history/<group>; upload = an admin uploads the file (robots.txt bars bots). */
  mode: "cron" | "upload";
  group: HistoryGroup | null;
  collect?: (p: RunParams) => Promise<ParsedBatch & { files?: string[]; file?: string; pending?: boolean; fileList?: string }>;
}

export const HISTORY_SOURCES: HistorySource[] = [
  {
    key: FEDERAL_SOURCE,
    label: "Government of Canada — contracts over $10,000 (Proactive Disclosure)",
    country: "CA",
    licence: FEDERAL_LICENCE,
    attribution: OGL_CANADA_ATTRIBUTION,
    url: FEDERAL_DATASET_URL,
    mode: "cron",
    group: "federal",
    collect: (p) => collectFederal({ since: p.since, asOf: p.today, limit: p.limit }),
  },
  {
    key: CANADABUYS_SOURCE,
    label: "CanadaBuys award notices (CSV)",
    country: "CA",
    licence: CANADABUYS_LICENCE,
    attribution: OGL_CANADA_ATTRIBUTION,
    url: CANADABUYS_FILES[0],
    mode: "upload",
    group: null,
  },
  {
    key: SEAO_SOURCE,
    label: "SEAO — Quebec public contracts (Données Québec)",
    country: "CA",
    licence: SEAO_LICENCE,
    attribution: SEAO_ATTRIBUTION,
    url: SEAO_DATASET_PAGE,
    mode: "cron",
    group: "weekly",
    collect: (p) => collectSeao({ since: p.since, asOf: p.today, files: p.files, weeks: p.weeks, url: p.url }),
  },
  {
    key: TORONTO_SOURCE,
    label: "City of Toronto — awarded contracts",
    country: "CA",
    licence: TORONTO_LICENCE,
    attribution: TORONTO_ATTRIBUTION,
    url: TORONTO_DUMP_URL,
    mode: "cron",
    group: "weekly",
    collect: (p) => collectToronto({ since: p.since, asOf: p.today }),
  },
  {
    key: MONTREAL_SOURCE,
    label: "Ville de Montréal — contracts",
    country: "CA",
    licence: MONTREAL_LICENCE,
    attribution: MONTREAL_ATTRIBUTION,
    url: MONTREAL_DATASETS[0],
    mode: "cron",
    group: "monthly",
    collect: (p) => collectMontreal({ since: p.since, asOf: p.today }),
  },
  {
    key: OTTAWA_SOURCE,
    label: "City of Ottawa — contracts over $25,000 (delegated authority)",
    country: "CA",
    licence: OTTAWA_LICENCE,
    attribution: OTTAWA_ATTRIBUTION,
    url: OTTAWA_HUB,
    mode: "cron",
    group: "monthly",
    collect: (p) => collectOttawa({ since: p.since, asOf: p.today }),
  },
  {
    key: USASPENDING_SOURCE,
    label: "USAspending — federal construction & facilities contracts",
    country: "US",
    licence: USASPENDING_LICENCE,
    attribution: USASPENDING_ATTRIBUTION,
    url: "https://api.usaspending.gov/",
    mode: "cron",
    group: "weekly",
    collect: (p) =>
      collectUsaSpending({
        since: p.since,
        asOf: p.today,
        // Weekly: awards with activity in the last 45 days (new awards and modifications).
        from: p.from ?? addMonths(p.today, -1).slice(0, 8) + "01",
        to: p.to ?? p.today,
        file: p.file,
      }),
  },
  {
    key: TXDOT_SOURCE,
    label: "TxDOT bid tabulations (maintenance & facilities lettings)",
    country: "US",
    licence: TXDOT_LICENCE,
    attribution: TXDOT_ATTRIBUTION,
    url: TXDOT_DATASET_URL,
    mode: "cron",
    group: "weekly",
    collect: (p) => collectTxdot({ since: p.since, asOf: p.today }),
  },
];

export function historySourcesFor(group: HistoryGroup | null, only?: string | null): HistorySource[] {
  if (only) return HISTORY_SOURCES.filter((s) => s.key === only && s.mode === "cron");
  return HISTORY_SOURCES.filter((s) => s.mode === "cron" && s.group === group);
}

export const isHistoryGroup = (g: string): g is HistoryGroup => g === "weekly" || g === "monthly" || g === "federal";
