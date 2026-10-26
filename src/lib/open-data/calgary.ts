/**
 * OPEN DATA: Calgary trade-permit activity (AB-C01). Open Government
 * Licence – City of Calgary; Socrata datasets on data.calgary.ca.
 *
 * NO ROWS ARE STORED. The three datasets hold ~750,000 inspection rows
 * (HVAC 125K, electrical 466K, plumbing 156K; one permit has several
 * inspection rows). Socrata does the counting on its side: one SoQL
 * group-by request per trade returns only the top contractors, so a run
 * downloads ~120 small objects per trade and stores 50 per trade (150 rows,
 * ~40 KB) in contractor_activity, refreshed monthly.
 *
 *   $select = contractor, count(distinct permitnum) AS permits
 *   $where  = <issued date field> >= <12 months ago>
 *   $group  = contractor   $order = permits DESC   $limit = 120
 *
 * The three datasets name their issue-date column differently
 * (permitissueddate for HVAC, issueddate for electrical and plumbing).
 *
 * DECLARED VALUE IS NOT AVAILABLE: these inspection datasets carry no
 * project cost, so only the number of permits is aggregated (the brief asked
 * for total declared value too; that would need the separate Building
 * Permits dataset, which does not hold trade permits).
 *
 * PERSONAL INFORMATION: contractor names pass businessOnly() (a sole
 * proprietor's own name is dropped; the shortlist is filled from the next
 * names down), so "most active contractors" lists businesses only. Blank
 * contractors (homeowner permits) are dropped.
 */
import { OGL_CALGARY } from "./attribution";
import { businessKey, businessOnly } from "./business-name.mjs";
import { openDataJson, RequestBudget } from "./fetch";
import { permitWindowStart } from "./permits";

export const CALGARY_SOURCE = "calgary-trade-permits";
export const CALGARY_ATTRIBUTION = OGL_CALGARY;
export const CALGARY_LICENCE = "Open Government Licence – City of Calgary";
export const CALGARY_TOP_N = 50;
export const CALGARY_ASK = 120;
export const CALGARY_WINDOW_MONTHS = 12;

export interface CalgaryTrade {
  /** PMRFP trade slug. */
  trade: string;
  label: string;
  dataset: string;
  dateField: string;
  page: string;
}

export const CALGARY_TRADES: CalgaryTrade[] = [
  { trade: "hvac", label: "HVAC", dataset: "cdrc-r4u8", dateField: "permitissueddate", page: "https://data.calgary.ca/d/cdrc-r4u8" },
  { trade: "electrical", label: "Electrical", dataset: "vxgy-id5s", dateField: "issueddate", page: "https://data.calgary.ca/d/vxgy-id5s" },
  { trade: "plumbing", label: "Plumbing", dataset: "5pvv-k7hn", dateField: "issueddate", page: "https://data.calgary.ca/d/5pvv-k7hn" },
];

/** A contractor_activity row. */
export interface ContractorActivity {
  source: string;
  city: string;
  province: string;
  trade_slug: string;
  rank: number;
  contractor: string;
  contractor_key: string;
  permits: number;
  /** Always null here: the trade-permit datasets carry no project cost. */
  declared_value_cad: number | null;
  window_start: string;
  window_end: string;
  as_of: string;
}

export function calgaryUrl(t: CalgaryTrade, today: string): string {
  const q = new URLSearchParams({
    $select: "contractor, count(distinct permitnum) AS permits",
    $where: `${t.dateField} >= '${permitWindowStart(today, CALGARY_WINDOW_MONTHS)}'`,
    $group: "contractor",
    $order: "permits DESC",
    $limit: String(CALGARY_ASK),
  });
  return `https://data.calgary.ca/resource/${t.dataset}.json?${q}`;
}

/** The top businesses, in order, with individuals and blanks removed. */
export function parseCalgaryTop(rows: { contractor?: string; permits?: string | number }[], t: CalgaryTrade, today: string): { read: number; rows: ContractorActivity[]; dropped: number } {
  const out: ContractorActivity[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const r of rows) {
    const name = businessOnly(r.contractor);
    const permits = Number(r.permits);
    if (!name || !Number.isFinite(permits) || permits < 1) {
      dropped++;
      continue;
    }
    const key = businessKey(name);
    if (seen.has(key)) continue; // "ABC PLUMBING" and "ABC Plumbing Ltd" spell one firm
    seen.add(key);
    out.push({
      source: CALGARY_SOURCE,
      city: "Calgary",
      province: "Alberta",
      trade_slug: t.trade,
      rank: out.length + 1,
      contractor: name,
      contractor_key: key,
      permits: Math.round(permits),
      declared_value_cad: null,
      window_start: permitWindowStart(today, CALGARY_WINDOW_MONTHS),
      window_end: today,
      as_of: today,
    });
    if (out.length >= CALGARY_TOP_N) break;
  }
  return { read: rows.length, rows: out, dropped };
}

export async function collectCalgary(today: string): Promise<{ read: number; rows: ContractorActivity[]; dropped: number; requests: number }> {
  const budget = new RequestBudget(8);
  const all: ContractorActivity[] = [];
  let read = 0;
  let dropped = 0;
  for (const t of CALGARY_TRADES) {
    const res = await openDataJson<{ contractor?: string; permits?: string }[]>(calgaryUrl(t, today), budget);
    if (!Array.isArray(res)) throw new Error(`calgary ${t.dataset}: unexpected response`);
    const p = parseCalgaryTop(res, t, today);
    read += p.read;
    dropped += p.dropped;
    all.push(...p.rows);
  }
  return { read, rows: all, dropped, requests: budget.used };
}
