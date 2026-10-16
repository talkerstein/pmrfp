/**
 * US-10 · USAspending.gov (U.S. federal contract awards, FPDS-derived). U.S.
 * federal government data: no copyright (17 U.S.C. 105). Keyless API;
 * api.usaspending.gov has no robots.txt (404), and only the documented API
 * is used (never www.usaspending.gov query-string pages, which its robots
 * disallow).
 *
 * One run = one award download job: POST /api/v2/download/awards/ with the
 * filters below and only the columns we read, poll /api/v2/download/status
 * every 10 s, then fetch the generated zip from files.usaspending.gov and
 * read its Contracts_PrimeAwardSummaries CSV. Polite by construction: one
 * job, one file, sequential.
 *
 * Filters: contract award types A–D (BPA calls, purchase orders, delivery
 * orders, definitive contracts), building NAICS 236 and 238 plus 561210
 * facilities support, 561720 janitorial, 561730 landscaping; awards of
 * US$25,000+; activity in the window. Gives: recipient, value, base award
 * date, period of performance start / current end (stated) / potential end
 * with all options, number of offers received, place-of-performance state.
 */
import { readCsv } from "../csv-stream";
import { politeBytes, politeFetch, politeJson } from "../fetch";
import { buyerKey, clip, emptyBatch, endDateFor, httpsOrNull, intOrNull, isoDay, money, provinceFor, skip, winnerFields, type AwardHistoryInput, type ParsedBatch } from "../model";
import { tradesEn } from "../trades";
import { unzipEntry, zipEntries } from "../zip";

export const USASPENDING_SOURCE = "us-usaspending";
export const USASPENDING_LICENCE = "U.S. federal government data (public domain, 17 U.S.C. 105)";
export const USASPENDING_ATTRIBUTION = "Source: USAspending.gov, U.S. Department of the Treasury (federal contract award data, public domain).";
const API = "https://api.usaspending.gov/api/v2";

export const USASPENDING_NAICS = ["2361", "2362", "2381", "2382", "2383", "2389", "561210", "561720", "561730"];
export const USASPENDING_MIN_AMOUNT = 25_000;

export const USASPENDING_COLUMNS = [
  "contract_award_unique_key",
  "award_id_piid",
  "current_total_value_of_award",
  "potential_total_value_of_award",
  "total_obligated_amount",
  "award_base_action_date",
  "period_of_performance_start_date",
  "period_of_performance_current_end_date",
  "period_of_performance_potential_end_date",
  "awarding_agency_name",
  "awarding_sub_agency_name",
  "awarding_office_name",
  "recipient_name",
  "primary_place_of_performance_country_code",
  "primary_place_of_performance_state_code",
  "primary_place_of_performance_city_name",
  "award_type_code",
  "prime_award_base_transaction_description",
  "naics_code",
  "naics_description",
  "number_of_offers_received",
  "extent_competed",
  "usaspending_permalink",
];

/** NAICS → PMRFP trade; the description refines the broad codes (238220 plumbing vs HVAC). */
const NAICS_TRADE: [RegExp, string | null][] = [
  [/^236/, "general-contracting"],
  [/^238110/, "concrete-and-asphalt"],
  [/^238140/, "masonry"],
  [/^238150/, "glass-and-windows"],
  [/^238160/, "roofing"],
  [/^238210/, "electrical"],
  [/^238220/, null],
  [/^238290/, null],
  [/^238320/, "painting"],
  [/^23833|^23834/, "flooring"],
  [/^238910/, null],
  [/^238990/, null],
  [/^238/, "general-contracting"],
  [/^561210/, "property-maintenance"],
  [/^561720/, "cleaning-janitorial"],
  [/^561730/, "landscaping"],
];

export function usaTrades(naics: string, description: string): string[] {
  const fromText = tradesEn(description);
  const hit = NAICS_TRADE.find(([p]) => p.test(naics));
  if (!hit) return [];
  if (hit[1] === null) {
    if (fromText.length) return fromText;
    if (/^238220/.test(naics)) return ["hvac", "plumbing"];
    if (/^238290/.test(naics)) return ["general-contracting"];
    if (/^238910/.test(naics)) return ["demolition"];
    return ["general-contracting"];
  }
  // Snow plowing is filed under landscaping; facilities support often names its trade.
  return [...new Set([hit[1], ...fromText])].slice(0, 3);
}

export function usaRow(r: Record<string, string>, opts: { since: string; asOf: string }): AwardHistoryInput | string {
  if (!/^[ABCD]$/.test((r.award_type_code ?? "").trim())) return "not-a-contract";
  const country = (r.primary_place_of_performance_country_code ?? "").trim();
  if (country && country !== "USA") return "outside-us";
  const awardDate = isoDay(r.award_base_action_date) ?? isoDay(r.period_of_performance_start_date);
  if (!awardDate) return "no-date";
  if (awardDate < opts.since) return "too-old";
  const description = r.prime_award_base_transaction_description ?? "";
  const trades = usaTrades((r.naics_code ?? "").trim(), description);
  if (!trades.length) return "not-building-work";
  const winner = winnerFields(r.recipient_name);
  if (!winner) return "no-recipient";
  const key = (r.contract_award_unique_key ?? "").trim();
  if (!key) return "no-key";
  const value = money(r.current_total_value_of_award) ?? money(r.total_obligated_amount);
  if (value !== null && value < USASPENDING_MIN_AMOUNT) return "under-minimum";
  const buyer = clip(r.awarding_sub_agency_name || r.awarding_agency_name, 200);
  const potential = isoDay(r.period_of_performance_potential_end_date);
  const end = endDateFor({ awardDate, stated: r.period_of_performance_current_end_date });
  const title = clip(description, 300) || clip(r.naics_description, 300) || `Contract ${r.award_id_piid}`;
  return {
    source: USASPENDING_SOURCE,
    source_key: key,
    board_ref: null,
    title: title!,
    description: clip([r.naics_code && `NAICS ${r.naics_code} ${r.naics_description ?? ""}`, r.extent_competed, r.awarding_office_name].filter(Boolean).join(" · "), 600),
    buyer,
    buyer_key: buyerKey(buyer),
    ...winner,
    value,
    currency: "USD",
    country: "US",
    province: provinceFor("US", r.primary_place_of_performance_state_code),
    city: clip(r.primary_place_of_performance_city_name, 80),
    award_date: awardDate,
    award_date_precision: "day",
    start_date: isoDay(r.period_of_performance_start_date),
    ...end,
    potential_end_date: potential && end.end_date && potential > end.end_date ? potential : null,
    number_of_bids: intOrNull(r.number_of_offers_received) || null,
    trade_slugs: trades,
    notice_url: httpsOrNull(r.usaspending_permalink),
    licence: USASPENDING_LICENCE,
    attribution: USASPENDING_ATTRIBUTION,
    as_of: opts.asOf,
  };
}

export function parseUsaCsv(text: string, opts: { since: string; asOf: string }): ParsedBatch {
  const batch = emptyBatch();
  const seen = new Map<string, AwardHistoryInput>();
  for (const r of readCsv(text)) {
    batch.read++;
    const out = usaRow(r, opts);
    if (typeof out === "string") skip(batch, out);
    else seen.set(out.source_key, out);
  }
  batch.awards = [...seen.values()];
  return batch;
}

export interface UsaDownload {
  file_name: string;
  file_url: string;
}

/** Start an award download job for activity between `from` and `to` (YYYY-MM-DD). */
export async function requestUsaDownload(from: string, to: string): Promise<UsaDownload> {
  const res = await politeFetch(`${API}/download/awards/`, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      filters: {
        award_type_codes: ["A", "B", "C", "D"],
        naics_codes: { require: USASPENDING_NAICS },
        award_amounts: [{ lower_bound: USASPENDING_MIN_AMOUNT }],
        time_period: [{ start_date: from, end_date: to }],
      },
      columns: USASPENDING_COLUMNS,
      file_format: "csv",
    }),
  });
  return (await res.json()) as UsaDownload;
}

/** Wait for the job (status every 10 s, up to `maxWaitMs`); null when it isn't ready yet. */
export async function waitUsaDownload(fileName: string, maxWaitMs = 200_000): Promise<string | null> {
  const until = Date.now() + maxWaitMs;
  for (;;) {
    const s = await politeJson<{ status?: string; file_url?: string; message?: string | null }>(`${API}/download/status?file_name=${encodeURIComponent(fileName)}`);
    if (s.status === "finished" && s.file_url) return s.file_url;
    if (s.status === "failed") throw new Error(`USAspending download failed: ${s.message ?? "unknown"}`);
    if (Date.now() + 10_000 > until) return null;
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

/** The prime award summaries CSV inside a generated download zip. */
export function usaCsvFromZip(zip: Uint8Array): string {
  const entry = zipEntries(zip).find((e) => /Contracts_PrimeAwardSummaries.*\.csv$/i.test(e.name));
  if (!entry) return "";
  return new TextDecoder("utf-8").decode(unzipEntry(zip, entry));
}

/**
 * One window of awards. Pass `file` (a file_name from an earlier run that
 * wasn't ready) to pick up a job instead of starting a new one.
 */
export async function collectUsaSpending(opts: { since: string; asOf: string; from: string; to: string; file?: string | null }): Promise<ParsedBatch & { file: string; pending: boolean }> {
  const job = opts.file ? { file_name: opts.file, file_url: "" } : await requestUsaDownload(opts.from, opts.to);
  const url = await waitUsaDownload(job.file_name);
  if (!url) return { ...emptyBatch(), file: job.file_name, pending: true };
  const csv = usaCsvFromZip(await politeBytes(url));
  return { ...parseUsaCsv(csv, opts), file: job.file_name, pending: false };
}
