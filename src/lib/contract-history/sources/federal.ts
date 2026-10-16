/**
 * CA-03 · Government of Canada Proactive Publication — Contracts over
 * $10,000 (open.canada.ca dataset d8f85d91-7dec-4fd1-8055-483b77225d8b,
 * Open Government Licence – Canada, quarterly, ~1.3M rows / 640 MB).
 *
 * Fetch: the dataset's official resource link on open.canada.ca
 * (/data/dataset/…/download/contracts.csv, allowed by robots.txt; crawl
 * delay 20 s) redirects to the Azure blob that holds the file. It answers a
 * named User-Agent (verified 2026-10-16), so this runs as a cron; it is
 * streamed and filtered on the fly, never held in memory.
 *
 * Kept: construction and building repair / maintenance / building services
 * (object codes for buildings, HVAC, building cleaning, waste disposal,
 * electrical distribution; "other business services" only when the text
 * says snow, lawn, grounds, pest or elevator work). Civil works (marine,
 * roads, runways, waterworks, engineering works) and goods are not.
 * Gives: vendor, value (incl. amendments), contract date, contract period
 * start and end-or-delivery date (stated), number of bids, department.
 * No place of work (only the vendor's postal prefix), so province is null.
 * A contract is restated each quarter it changes: the latest reporting
 * period wins.
 */
import { OGL_CANADA_ATTRIBUTION } from "@/lib/tenders/sources";
import { streamCsv } from "../csv-stream";
import { politeStream } from "../fetch";
import { clip, emptyBatch, endDateFor, intOrNull, isoDay, money, skip, winnerFields, buyerKey, type AwardHistoryInput, type ParsedBatch } from "../model";
import { tradesAny, tradesFromName } from "../trades";

export const FEDERAL_SOURCE = "ca-federal-contracts";
export const FEDERAL_CSV_URL =
  "https://open.canada.ca/data/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b/resource/fac950c0-00d5-4ec1-a4d3-9cbebf98a305/download/contracts.csv";
export const FEDERAL_DATASET_URL = "https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b";
export const FEDERAL_LICENCE = "Open Government Licence – Canada";

/** Object-code descriptions that are building work (any trade). */
const BUILDING_OBJECT =
  /\b(office|commercial|industrial|institutional|residential|other|educational|health|recreational|storage)\b[\w\s-]{0,20}\bbuildings?\b|schools and other educational buildings|laborator(y|ies)|real property services|construction services/i;
/** Object descriptions that name a trade directly. */
const OBJECT_TRADE: [RegExp, string][] = [
  [/building cleaning/i, "cleaning-janitorial"],
  [/waste disposal/i, "waste-removal"],
  [/heating, air-?conditioning|refrigeration equipment/i, "hvac"],
  [/electric lighting, distribution/i, "electrical"],
];
/** "Other business services" is a catch-all: only these words make it property work. */
const SERVICE_WORDS: [RegExp, string][] = [
  [/snow (removal|clearing|plow)|de-?icing|d[ée]neigement/i, "snow-removal"],
  [/\blawn|landscap|grounds? (maintenance|keeping)|mowing|grass cutting|tree (removal|pruning|trimming)/i, "landscaping"],
  [/pest control|extermina/i, "pest-control"],
  [/elevator|escalator/i, "elevator-services"],
  [/janitor|custodial|building cleaning/i, "cleaning-janitorial"],
];
const CIVIL = /marine|wharf|harbour|highway|roads?\b|streets|runway|airport|waterworks|sewage|engineering works|bridge|dam\b|canal|ships?|boats?|aircraft|vehicles?/i;
const BOILERPLATE = /^(this (contract|item|is a notice)|the amendment value|increase contract|n\/?a$)/i;

const objectDescription = (r: Record<string, string>) => (r.description_en ?? "").replace(/^\s*\d+\s+/, "").replace(/\s+/g, " ").trim();

/** Trades for one row, or [] to skip it. */
export function federalTrades(r: Record<string, string>): string[] {
  const type = (r.commodity_type ?? "").trim().toUpperCase();
  if (type === "G") return [];
  const obj = objectDescription(r);
  if (CIVIL.test(obj)) return [];
  const comments = BOILERPLATE.test((r.comments_en ?? "").trim()) ? "" : r.comments_en ?? "";
  const direct = OBJECT_TRADE.find(([p]) => p.test(obj))?.[1];
  if (direct) return [direct];
  if (/other business services/i.test(obj)) {
    const text = `${comments} ${r.vendor_name ?? ""}`;
    const hit = SERVICE_WORDS.find(([p]) => p.test(text))?.[1];
    return hit ? [hit] : [];
  }
  // Construction or repair of a building (construction of anything else is civil work).
  if (BUILDING_OBJECT.test(obj)) {
    const fromText = comments ? tradesAny(comments) : [];
    if (fromText.length) return fromText;
    const fromName = tradesFromName(r.vendor_name ?? null);
    return fromName.length ? fromName : ["general-contracting"];
  }
  return [];
}

/** "2024-2025-Q4" → sortable; blanks sort first. */
const period = (r: Record<string, string>) => (r.reporting_period ?? "").trim();

export function federalRow(r: Record<string, string>, opts: { since: string; asOf: string }): AwardHistoryInput | string {
  const awardDate = isoDay(r.contract_date);
  if (!awardDate) return "no-date";
  if (awardDate < opts.since) return "too-old";
  if (awardDate > opts.asOf) return "future-date";
  const trades = federalTrades(r);
  if (!trades.length) return "not-building-work";
  const winner = winnerFields(r.vendor_name);
  if (!winner) return "no-vendor";
  const org = (r.owner_org ?? "").trim();
  const id = (r.procurement_id ?? "").trim() || (r.reference_number ?? "").trim();
  if (!org || !id) return "no-key";
  const obj = objectDescription(r);
  const comments = BOILERPLATE.test((r.comments_en ?? "").trim()) ? null : clip(r.comments_en, 300);
  const title = clip(comments && comments.length >= 12 ? comments : obj, 300) ?? "Federal contract";
  const buyer = clip((r.owner_org_title ?? "").split("|")[0], 200);
  const value = money(r.contract_value) ?? money(r.original_value);
  const end = endDateFor({ awardDate, stated: r.delivery_date, text: comments });
  const bids = intOrNull(r.number_of_bids);
  const ref = (r.reference_number ?? "").trim();
  return {
    source: FEDERAL_SOURCE,
    source_key: `${org}|${id}`,
    board_ref: null,
    title,
    description: clip([obj, comments].filter(Boolean).join(" — "), 1000),
    buyer,
    buyer_key: buyerKey(buyer),
    ...winner,
    value,
    currency: "CAD",
    country: "CA",
    province: null,
    city: null,
    award_date: awardDate,
    award_date_precision: "day",
    start_date: isoDay(r.contract_period_start),
    ...end,
    potential_end_date: null,
    // 0 = a call-up or sole-source, not "nobody bid".
    number_of_bids: bids && bids > 0 ? bids : null,
    trade_slugs: trades,
    notice_url: ref ? `https://search.open.canada.ca/contracts/record/${encodeURIComponent(org)},${encodeURIComponent(ref)}` : FEDERAL_DATASET_URL,
    licence: FEDERAL_LICENCE,
    attribution: OGL_CANADA_ATTRIBUTION,
    as_of: opts.asOf,
  };
}

/** Parse the whole file (or the first `limit` records) from a byte stream. */
export async function parseFederalStream(body: ReadableStream<Uint8Array>, opts: { since: string; asOf: string; limit?: number }): Promise<ParsedBatch> {
  const batch = emptyBatch();
  const latest = new Map<string, { row: AwardHistoryInput; period: string }>();
  batch.read = await streamCsv(
    body,
    (r) => {
      const out = federalRow(r, opts);
      if (typeof out === "string") return skip(batch, out);
      const p = period(r);
      const prev = latest.get(out.source_key);
      if (!prev || p >= prev.period) latest.set(out.source_key, { row: out, period: p });
      else skip(batch, "older-restatement");
    },
    { limit: opts.limit },
  );
  batch.awards = [...latest.values()].map((x) => x.row);
  return batch;
}

export async function collectFederal(opts: { since: string; asOf: string; limit?: number }): Promise<ParsedBatch> {
  return parseFederalStream(await politeStream(FEDERAL_CSV_URL, { accept: "text/csv", timeoutMs: 280_000 }), opts);
}
