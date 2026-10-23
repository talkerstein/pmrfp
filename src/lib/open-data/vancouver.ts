/**
 * OPEN DATA: City of Vancouver awarded contracts (BC-V01) and issued
 * building permits (BC-V02). Open Government Licence – Vancouver.
 *
 * LOCAL FILES ONLY, NEVER FETCHED BY CODE. opendata.vancouver.ca's
 * robots.txt (checked 2026-10-23) disallows /api/ and
 * /explore/dataset/*\/download for every robot except Googlebot, so no
 * script, cron or server action here calls that host. The owner downloads
 * each dataset by hand in a browser (Export tab → CSV or JSON, which is a
 * person, not a robot) and loads the file with
 *   node scripts/run-open-data.mjs vancouver-awards  <file>
 *   node scripts/run-open-data.mjs vancouver-permits <file>
 * If the City grants permission to use the API, only a fetcher needs adding;
 * these parsers already take the API's JSON ({results:[…]}) as well as the
 * CSV export (";"-delimited, snake_case headers).
 *
 * FIELD NAMES come from the catalogue brief (briefs/research/2026-10-22-
 * open-data-catalogue.csv): awards bid_number, bid_type, bid_description,
 * award_date, vendor_name, bid_amount, awarded; permits permitnumber,
 * issuedate, projectvalue, typeofwork, propertyuse, buildingcontractor.
 * The lookup is case/underscore-insensitive and accepts a few aliases, and
 * a missing required column fails loudly with the columns that were found
 * (the fixtures in test/unit/fixtures/open-data are shaped from the
 * catalogue, not from a live read, because the API is off limits).
 *
 * PERSONAL INFORMATION: vendor and contractor names pass businessOnly();
 * an individual bidder is counted ("an individual bid") and never named.
 * The permit's applicant and street address are never read.
 */
import { parseCsvText } from "./csv-rows.mjs";
import { OGL_VANCOUVER } from "./attribution";
import { businessOnly } from "./business-name.mjs";
import { buyerKey, clip, emptyBatch, isoDay, money, skip, winnerFields, type AwardHistoryInput, type BidResultInput, type BidStatus, type ParsedBatch } from "@/lib/contract-history/model";
import { tradesAny } from "@/lib/contract-history/trades";
import { foldPermits, workType, type PermitBatch, type RawPermit } from "./permits";

export const VANCOUVER_AWARDS_SOURCE = "ca-vancouver-awards";
export const VANCOUVER_PERMITS_SOURCE = "permits-lead-vancouver";
export const VANCOUVER_LICENCE = "Open Government Licence – Vancouver";
export const VANCOUVER_ATTRIBUTION = OGL_VANCOUVER;
export const VANCOUVER_AWARDS_PAGE = "https://opendata.vancouver.ca/explore/dataset/awarded-contracts/";
export const VANCOUVER_PERMITS_PAGE = "https://opendata.vancouver.ca/explore/dataset/issued-building-permits/";

type Rec = Record<string, unknown>;

/** Records from an API JSON body ({results:[…]} or {records:[{fields}]}) or a CSV export (";" or ","). */
export async function vancouverRecords(text: string): Promise<Rec[]> {
  const body = text.replace(/^﻿/, "").trimStart();
  if (body.startsWith("{") || body.startsWith("[")) {
    const j = JSON.parse(body) as unknown;
    const list = Array.isArray(j) ? j : ((j as { results?: unknown[]; records?: { fields?: unknown }[] }).results ?? (j as { records?: { fields?: unknown }[] }).records?.map((r) => r.fields) ?? []);
    return list.filter((x): x is Rec => typeof x === "object" && x !== null);
  }
  const first = body.split(/\r?\n/, 1)[0] ?? "";
  return parseCsvText(body, { delimiter: first.split(";").length > first.split(",").length ? ";" : "," });
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Read a field by any of its names; "" when absent. */
export function field(r: Rec, ...names: string[]): string {
  const idx = new Map(Object.keys(r).map((k) => [norm(k), k]));
  for (const n of names) {
    const k = idx.get(norm(n));
    if (k !== undefined && r[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim();
  }
  return "";
}

export function requireColumns(records: Rec[], required: Record<string, string[]>): void {
  if (!records.length) throw new Error("no records in the file");
  const have = new Set(Object.keys(records[0]).map(norm));
  const missing = Object.entries(required).filter(([, aliases]) => !aliases.some((a) => have.has(norm(a)))).map(([name]) => name);
  if (missing.length) throw new Error(`missing column(s) ${missing.join(", ")}; the file has: ${Object.keys(records[0]).join(", ")}`);
}

const truthy = (v: string) => /^(true|yes|y|1|awarded)$/i.test(v.trim());

/** A bidder's strict business-only winner fields: individuals and unrecognised names are counted, never named. */
export function strictWinnerFields(raw: string | null | undefined) {
  const name = businessOnly(raw);
  if (!name) return String(raw ?? "").trim() ? { winner_business_name: null, winner_key: null, winner_is_individual: true } : null;
  return winnerFields(name);
}

export const AWARD_FIELDS = {
  bid: ["bid_number", "bidnumber", "bid_no", "solicitation_number"],
  date: ["award_date", "awarddate", "date_awarded"],
  vendor: ["vendor_name", "vendorname", "bidder", "supplier", "vendor"],
  amount: ["bid_amount", "bidamount", "amount", "total_bid"],
  awarded: ["awarded", "is_awarded", "award_status", "successful"],
};

/**
 * One award per solicitation (bid_number): the awarded bidder is the winner,
 * the winning bid is the value, the bidder count is number_of_bids, and every
 * bidder (business) goes to bid_results with its amount.
 */
export function parseVancouverAwards(records: Rec[], opts: { asOf: string; since?: string }): ParsedBatch {
  requireColumns(records, { bid_number: AWARD_FIELDS.bid, award_date: AWARD_FIELDS.date, vendor_name: AWARD_FIELDS.vendor });
  const batch = emptyBatch();
  const groups = new Map<string, Rec[]>();
  for (const r of records) {
    batch.read++;
    const bid = field(r, ...AWARD_FIELDS.bid);
    if (!bid) {
      skip(batch, "no-bid-number");
      continue;
    }
    (groups.get(bid) ?? groups.set(bid, []).get(bid)!).push(r);
  }
  for (const [bid, rows] of groups) {
    const winners = rows.filter((r) => truthy(field(r, ...AWARD_FIELDS.awarded)));
    if (!winners.length) {
      skip(batch, "not-awarded");
      continue;
    }
    // Several awarded rows = a multi-vendor award: one award per awarded vendor.
    for (const w of winners) {
      const date = isoDay(field(w, ...AWARD_FIELDS.date));
      if (!date) {
        skip(batch, "no-date");
        continue;
      }
      if (opts.since && date < opts.since) {
        skip(batch, "too-old");
        continue;
      }
      const winner = strictWinnerFields(field(w, ...AWARD_FIELDS.vendor));
      if (!winner) {
        skip(batch, "no-vendor");
        continue;
      }
      const desc = field(w, "bid_description", "description", "title") || `Vancouver bid ${bid}`;
      const type = field(w, "bid_type", "type", "category");
      const text = `${desc} ${type}`;
      const key = `${bid}|${winner.winner_key ?? `individual:${norm(field(w, ...AWARD_FIELDS.vendor)).slice(0, 24)}`}`;
      const bidders = new Set(rows.map((r) => norm(field(r, ...AWARD_FIELDS.vendor))).filter(Boolean));
      const buyer = "City of Vancouver";
      batch.awards.push({
        source: VANCOUVER_AWARDS_SOURCE,
        source_key: key,
        board_ref: null,
        title: clip(desc, 300) ?? `Vancouver bid ${bid}`,
        description: clip([type, `Bid ${bid}`].filter(Boolean).join(" · "), 400),
        buyer,
        buyer_key: buyerKey(buyer),
        ...winner,
        value: money(field(w, ...AWARD_FIELDS.amount)),
        currency: "CAD",
        country: "CA",
        province: "British Columbia",
        city: "Vancouver",
        award_date: date,
        award_date_precision: "day",
        start_date: null,
        end_date: null,
        end_date_source: null,
        potential_end_date: null,
        number_of_bids: bidders.size >= 1 ? bidders.size : null,
        trade_slugs: tradesAny(text),
        notice_url: VANCOUVER_AWARDS_PAGE,
        licence: VANCOUVER_LICENCE,
        attribution: VANCOUVER_ATTRIBUTION,
        as_of: opts.asOf,
      } satisfies AwardHistoryInput);
      // Everyone who bid, with amounts (an individual keeps rank and amount, no name).
      const priced = rows
        .map((r) => ({ r, amount: money(field(r, ...AWARD_FIELDS.amount)) }))
        .sort((a, b) => (a.amount ?? Infinity) - (b.amount ?? Infinity));
      priced.forEach(({ r, amount }, i) => {
        const f = strictWinnerFields(field(r, ...AWARD_FIELDS.vendor));
        if (!f) return;
        const isWinner = truthy(field(r, ...AWARD_FIELDS.awarded));
        const status: BidStatus = isWinner ? "awarded" : "not_awarded";
        batch.bids.push({
          award_source: VANCOUVER_AWARDS_SOURCE,
          award_source_key: key,
          bidder_business_name: f.winner_business_name,
          bidder_key: f.winner_key ?? `individual:${i + 1}`,
          bidder_is_individual: f.winner_is_individual,
          bid_amount: amount,
          currency: "CAD",
          rank: i + 1,
          status_label: status,
          as_of: opts.asOf,
          source: VANCOUVER_AWARDS_SOURCE,
        } satisfies BidResultInput);
      });
    }
  }
  return batch;
}

export const PERMIT_FIELDS = {
  id: ["permitnumber", "permit_number", "permitno"],
  issued: ["issuedate", "issue_date", "issueddate"],
  value: ["projectvalue", "project_value", "value"],
  contractor: ["buildingcontractor", "building_contractor", "contractor"],
};

/** Vancouver issued building permits -> permit leads (24 months, >= $100K, business contractor). The applicant and address are never read. */
export function parseVancouverPermits(records: Rec[], today: string): PermitBatch {
  requireColumns(records, { permitnumber: PERMIT_FIELDS.id, issuedate: PERMIT_FIELDS.issued, projectvalue: PERMIT_FIELDS.value, buildingcontractor: PERMIT_FIELDS.contractor });
  const raws: RawPermit[] = records.map((r) => ({
    source: VANCOUVER_PERMITS_SOURCE,
    id: field(r, ...PERMIT_FIELDS.id),
    city: "Vancouver",
    province: "British Columbia",
    issued: field(r, ...PERMIT_FIELDS.issued),
    value: field(r, ...PERMIT_FIELDS.value),
    contractor: field(r, ...PERMIT_FIELDS.contractor),
    workType: workType(field(r, "typeofwork", "type_of_work"), field(r, "propertyuse", "property_use")),
  }));
  return foldPermits(raws, today);
}
