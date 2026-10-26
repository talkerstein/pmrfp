/**
 * OPEN DATA: City of Toronto, two TOBids datasets (Toronto Open Data, CKAN).
 *
 *  ON-T03  TOBids non-competitive contracts (2,937 rows, refreshed daily)
 *          -> award_history, source "ca-toronto-noncompetitive", every row
 *          flagged non_competitive = true so it is HISTORY ONLY: it never
 *          feeds a price median or a "what similar work sold for" block.
 *  ON-T04  Capital Projects Pipeline (46 planned procurements, "as
 *          available") -> planned_procurements, shown as "Coming up" on the
 *          City of Toronto buyer page.
 *
 * Fetch: CKAN datastore_search on ckan0.cf.opendata.inter.prod-toronto.ca.
 * robots.txt there says "Allow: /api/" (and only bars the dataset pages and
 * /dataset/*\/resource/*\/download/*), so the API is the allowed route.
 *
 * LICENCE – FOR COUNSEL. The portal publishes everything under the Open
 * Government Licence – Toronto (https://open.toronto.ca/open-data-licence/),
 * which allows commercial use with attribution and excludes personal
 * information. But CKAN's own licence field for BOTH datasets reads
 * license_id "notspecified" / "License not specified" (package_show,
 * checked 2026-10-23). We credit the dataset as OGL-Toronto because the
 * portal-wide licence page governs, and counsel should confirm that a blank
 * dataset field does not leave these two datasets outside it.
 *
 * PERSONAL INFORMATION: supplier names pass businessOnly() (an individual is
 * counted, never named); the file's supplier address and wards columns are
 * not stored.
 */
import { OGL_TORONTO as TORONTO_ATTRIBUTION } from "./attribution";
import { buyerKey, clip, emptyBatch, isoDay, money, skip, type AwardHistoryInput, type ParsedBatch } from "@/lib/contract-history/model";
import { tradesFromName } from "@/lib/contract-history/trades";
import { openDataJson, RequestBudget } from "./fetch";
import { strictWinnerFields } from "./vancouver";

export const TORONTO_NC_SOURCE = "ca-toronto-noncompetitive";
export const TORONTO_PIPELINE_SOURCE = "toronto-capital-pipeline";
export const TORONTO_OGL = "Open Government Licence – Toronto";
export const TORONTO_NC_PACKAGE = "https://open.toronto.ca/dataset/tobids-non-competitive-contracts/";
export const TORONTO_PIPELINE_PACKAGE = "https://open.toronto.ca/dataset/capital-project-pipeline/";
const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
/** Datastore resource ids (stable; resolved from package_show on 2026-10-23). */
export const TORONTO_NC_RESOURCE = "a11b18b4-72e6-47e3-a4e9-05dcc8abd697";
export const TORONTO_PIPELINE_RESOURCE = "e33e036f-a898-4b90-b626-84abba557bbd";

type Rec = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Every record of a datastore resource (1,000 per request, one request a second). */
export async function datastoreAll(resourceId: string, budget = new RequestBudget(12)): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await openDataJson<{ success?: boolean; result?: { records?: Rec[]; total?: number } }>(
      `${CKAN}/datastore_search?resource_id=${resourceId}&limit=1000&offset=${offset}&sort=_id`,
      budget,
    );
    const recs = r.result?.records ?? [];
    out.push(...recs);
    if (recs.length < 1000 || out.length >= (r.result?.total ?? Infinity)) break;
  }
  return out;
}

/** Non-competitive contracts -> award rows flagged non_competitive. */
export function parseTorontoNonCompetitive(records: Rec[], opts: { asOf: string; since?: string }): ParsedBatch {
  const batch = emptyBatch();
  const seen = new Map<string, AwardHistoryInput>();
  for (const r of records) {
    batch.read++;
    const date = isoDay(r["Contract Date"]);
    if (!date) {
      skip(batch, "no-date");
      continue;
    }
    if (opts.since && date < opts.since) {
      skip(batch, "too-old");
      continue;
    }
    if (date > opts.asOf) {
      skip(batch, "future-date");
      continue;
    }
    const supplier = s(r["Supplier Name"]);
    const winner = strictWinnerFields(supplier);
    if (!winner) {
      skip(batch, "no-supplier");
      continue;
    }
    const reason = s(r["Reason"]);
    const division = s(r["Division"]);
    const amount = money(r["Contract Amount"]);
    const ws = s(r["Workspace Number"]) || s(r["_id"]);
    const key = `${ws}|${winner.winner_key ?? "individual"}|${amount ?? ""}`;
    const buyer = "City of Toronto";
    seen.set(key, {
      source: TORONTO_NC_SOURCE,
      source_key: key,
      board_ref: null,
      title: clip(`${division || "City of Toronto"}: non-competitive contract${reason ? ` (${reason})` : ""}`, 300)!,
      description: clip(`Non-competitive award. Reason: ${reason || "not stated"}. Division: ${division || "not stated"}.`, 400),
      buyer,
      buyer_key: buyerKey(buyer),
      ...winner,
      value: amount,
      currency: "CAD",
      country: "CA",
      province: "Ontario",
      city: "Toronto",
      award_date: date,
      award_date_precision: "day",
      start_date: null,
      end_date: null,
      end_date_source: null,
      potential_end_date: null,
      number_of_bids: null,
      // A hint from the supplier's name ("... Roofing", "... Electric"); the dataset carries no scope text.
      trade_slugs: tradesFromName(winner.winner_business_name),
      notice_url: TORONTO_NC_PACKAGE,
      licence: TORONTO_OGL,
      attribution: TORONTO_ATTRIBUTION,
      as_of: opts.asOf,
      non_competitive: true,
      procurement_method: clip(`non-competitive${reason ? ` (${reason})` : ""}`, 60),
    });
  }
  batch.awards = [...seen.values()];
  return batch;
}

export async function collectTorontoNonCompetitive(o: { asOf: string; since?: string; budget?: RequestBudget }): Promise<ParsedBatch> {
  return parseTorontoNonCompetitive(await datastoreAll(TORONTO_NC_RESOURCE, o.budget), o);
}

/** A planned procurement row (table planned_procurements). */
export interface PlannedProcurement {
  source: string;
  source_key: string;
  buyer_key: string;
  buyer_name: string;
  city: string;
  province: string;
  title: string;
  type_of_work: string | null;
  scope: string | null;
  division: string | null;
  sourcing_year: number | null;
  award_year: number | null;
  sourcing_type: string | null;
  estimated_range: string | null;
  term_months: number | null;
  licence: string;
  as_of: string;
}

const year = (v: unknown) => {
  const n = Number(s(v));
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
};

export function parseTorontoPipeline(records: Rec[], asOf: string): { read: number; rows: PlannedProcurement[]; skipped: Record<string, number> } {
  const rows: PlannedProcurement[] = [];
  const skipped: Record<string, number> = {};
  const bump = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1);
  for (const r of records) {
    const title = clip(s(r["Name and Construction Contract Number"]), 240);
    if (!title) {
      bump("no-title");
      continue;
    }
    const no = s(r["No."]) || s(r["_id"]);
    const term = Number(s(r["Estimated Contract Term (Months)"]));
    rows.push({
      source: TORONTO_PIPELINE_SOURCE,
      source_key: `${no}|${title.slice(0, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      buyer_key: buyerKey("City of Toronto")!,
      buyer_name: "City of Toronto",
      city: "Toronto",
      province: "Ontario",
      title,
      type_of_work: clip(s(r["Type of Work"]), 60),
      scope: clip(s(r["Scope of Work: Detailed Description"]), 500),
      division: clip(s(r["Delivery Division"]) || s(r["Project Owner (Division)"]), 100),
      sourcing_year: year(r["Target Sourcing Year"]),
      award_year: year(r["Target Award Year"]),
      sourcing_type: clip(s(r["Sourcing Type"]), 30),
      estimated_range: clip(s(r["Estimated Range"]), 40),
      term_months: Number.isInteger(term) && term > 0 && term < 600 ? term : null,
      licence: TORONTO_ATTRIBUTION,
      as_of: asOf,
    });
  }
  return { read: records.length, rows, skipped };
}

export async function collectTorontoPipeline(asOf: string, budget?: RequestBudget) {
  return parseTorontoPipeline(await datastoreAll(TORONTO_PIPELINE_RESOURCE, budget), asOf);
}
