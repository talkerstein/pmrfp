/**
 * US-01 · TxDOT Bid Tabulations (data.texas.gov dataset de7b-7dna, Socrata).
 * Every bidder on every letting, ranked, with bid totals; a rolling 24 months
 * only, so the weekly import keeps what it has read (rows are never deleted)
 * and history accumulates past the window.
 *
 * Licence: none stated on the dataset; the Texas Open Data Portal terms
 * apply (not confirmed). Treated as Texas public information with
 * attribution to TxDOT, and stored at the coarsest useful grain: one row per
 * project and bidder (rank + bid total). The item-level unit-price table is
 * never copied. robots.txt on data.texas.gov: Crawl-delay 1; the SoQL
 * /resource/ API is not disallowed.
 *
 * Scope: TxDOT is mostly road work, which PMRFP doesn't cover. Kept are
 * maintenance lettings for property-type services (mowing and grounds,
 * janitorial at rest areas and offices, litter and sweeping, tree work,
 * snow and ice) and building lettings (safety rest areas, facilities).
 *
 * The dataset says the totals are bids as read and do not mean a contract
 * was or will be awarded, so the low bidder is "apparent low", never
 * "winner", and the panel labels every row unofficial with its as-of date.
 */
import { politeJson } from "@/lib/contract-history/fetch";
import { businessNameOrNull, clip, emptyBatch, isoDay, money, nameKey, skip, winnerFields, buyerKey, type AwardHistoryInput, type BidResultInput, type ParsedBatch } from "@/lib/contract-history/model";
import { addMonths } from "@/lib/intel/model";

export const TXDOT_SOURCE = "us-txdot-bids";
export const TXDOT_DATASET_URL = "https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna";
export const TXDOT_LICENCE = "Texas Open Data Portal (TxDOT); no licence stated on the dataset — public information, attributed";
export const TXDOT_ATTRIBUTION = "Source: Texas Department of Transportation, Bid Tabulations (data.texas.gov). Bid totals as read; not a statement that a contract was awarded.";
const RESOURCE = "https://data.texas.gov/resource/de7b-7dna.json";

/** short_description / classification → PMRFP trade. Order matters (first match wins). */
const TXDOT_TRADES: [RegExp, string][] = [
  [/snow|ice control|winter weather/i, "snow-removal"],
  [/janitorial/i, "cleaning-janitorial"],
  [/mowing|grounds|landscap|tree (trimming|removal)|brush|vegetation|picnic area/i, "landscaping"],
  [/litter|sweeping|debris removal/i, "waste-removal"],
  [/safety rest area|building|facility|facilities|rest area/i, "general-contracting"],
  [/illumination maintenance|lighting/i, "electrical"],
];
const NOT_PROPERTY = /hot mix|asphalt|seal coat|overlay|pavement|bridge|culvert|guard fence|cable barrier|striping|markings?|signal|sign replacement|base repair|flexible base|aggregate|emulsion|cutback|lime|rock|riprap|limestone|crack seal|attenuator|ditch|erosion|traffic control|material|herbicide|hydraulic cement|concrete|roadway|drainage/i;

export function txdotTrade(shortDescription: string, classification: string): string | null {
  const text = `${shortDescription} ${classification}`;
  const hit = TXDOT_TRADES.find(([p]) => p.test(text));
  if (!hit) return null;
  if (hit[1] !== "general-contracting" && NOT_PROPERTY.test(shortDescription) && !/janitorial|mowing|snow/i.test(shortDescription)) return null;
  return hit[1];
}

export interface TxdotBidRow {
  project_id?: string;
  project_name?: string;
  county?: string;
  district?: string;
  let_date?: string;
  classification?: string;
  short_description?: string;
  working_days?: string;
  vendor_name?: string;
  rank?: string;
  total?: string;
}

/** The SoQL query: one row per project and bidder (never item-level), for the lettings in scope. */
export function txdotQuery(offset: number, sinceLetDate: string): string {
  const select = [
    "project_id",
    "max(project_name) as project_name",
    "max(county) as county",
    "max(district_division) as district",
    "max(project_actual_let_date) as let_date",
    "max(project_classification) as classification",
    "max(short_description) as short_description",
    "max(maximum_number_of_working) as working_days",
    "vendor_name",
    "max(bid_rank_sequence_number) as rank",
    "max(bid_total_amount) as total",
  ].join(",");
  const where = `(project_type='Maintenance' OR project_classification in('Safety Rest Area','Landscape & Scenic Enhancement','Military Bases and Federal Campus','Border Crossing Facility')) AND project_actual_let_date >= '${sinceLetDate}T00:00:00'`;
  const p = new URLSearchParams({ $select: select, $where: where, $group: "project_id,vendor_name", $order: "project_id,vendor_name", $limit: "10000", $offset: String(offset) });
  return `${RESOURCE}?${p.toString()}`;
}

/** Projects (award_history rows, the apparent low bidder as holder) and their ranked bidders. */
export function parseTxdot(rows: TxdotBidRow[], opts: { asOf: string; since: string }): ParsedBatch {
  const batch = emptyBatch();
  const byProject = new Map<string, TxdotBidRow[]>();
  for (const r of rows) {
    batch.read++;
    if (!r.project_id || !r.vendor_name) {
      skip(batch, "incomplete");
      continue;
    }
    const list = byProject.get(r.project_id) ?? [];
    list.push(r);
    byProject.set(r.project_id, list);
  }
  for (const [projectId, bidders] of byProject) {
    const first = bidders[0];
    const letDate = isoDay(first.let_date);
    if (!letDate || letDate < opts.since) {
      skip(batch, "too-old");
      continue;
    }
    const trade = txdotTrade(first.short_description ?? "", first.classification ?? "");
    if (!trade) {
      skip(batch, "not-property-work");
      continue;
    }
    const ranked = bidders
      .map((b) => ({ b, rank: Number(b.rank) || Infinity, total: money(b.total) }))
      .sort((x, y) => x.rank - y.rank || (x.total ?? Infinity) - (y.total ?? Infinity));
    const low = ranked[0];
    const winner = winnerFields(low.b.vendor_name);
    if (!winner) {
      skip(batch, "no-bidder");
      continue;
    }
    const days = Number(first.working_days);
    // Working days → calendar months (5 working days a week); a stated duration, so "derived".
    const months = Number.isFinite(days) && days > 0 ? Math.max(1, Math.round((days * 7) / 5 / 30.4)) : null;
    const buyer = clip(`Texas Department of Transportation${first.district ? ` — ${first.district} District` : ""}`, 200);
    const award: AwardHistoryInput = {
      source: TXDOT_SOURCE,
      source_key: projectId,
      board_ref: null,
      title: clip(`${first.short_description ?? "Maintenance"} — ${first.project_name ?? first.county ?? ""}`, 300) ?? projectId,
      description: clip([first.classification, first.county && `${first.county} County`, months && `${days} working days`].filter(Boolean).join(" · "), 400),
      buyer,
      buyer_key: buyerKey(buyer),
      ...winner,
      value: low.total,
      currency: "USD",
      country: "US",
      province: "Texas",
      city: null,
      award_date: letDate,
      award_date_precision: "day",
      start_date: null,
      end_date: months ? addMonths(letDate, months) : null,
      end_date_source: months ? "derived_from_title" : null,
      potential_end_date: null,
      number_of_bids: ranked.length,
      trade_slugs: [trade],
      notice_url: TXDOT_DATASET_URL,
      licence: TXDOT_LICENCE,
      attribution: TXDOT_ATTRIBUTION,
      as_of: opts.asOf,
    };
    batch.awards.push(award);
    const used = new Set<string>();
    let individuals = 0;
    ranked.forEach(({ b, rank, total }, i) => {
      const name = businessNameOrNull(b.vendor_name);
      let key = name ? nameKey(name) : `individual:${++individuals}`;
      if (!key || used.has(key)) key = `${key || "bidder"}:${i + 1}`;
      used.add(key);
      const bid: BidResultInput = {
        award_source: TXDOT_SOURCE,
        award_source_key: projectId,
        bidder_business_name: name,
        bidder_key: key,
        bidder_is_individual: !name,
        bid_amount: total,
        currency: "USD",
        rank: Number.isFinite(rank) ? rank : i + 1,
        status_label: i === 0 ? "apparent_low" : "submitted",
        as_of: opts.asOf,
        source: TXDOT_SOURCE,
      };
      batch.bids.push(bid);
    });
  }
  return batch;
}

/** Read the rolling window (10,000 grouped rows per request, 1 s apart). */
export async function collectTxdot(opts: { asOf: string; since: string }): Promise<ParsedBatch> {
  const rows: TxdotBidRow[] = [];
  // The dataset only holds 24 months; asking from `since` is cheap either way.
  const from = opts.since > addMonths(opts.asOf, -25) ? opts.since : addMonths(opts.asOf, -25);
  for (let offset = 0; offset < 200_000; offset += 10_000) {
    const page = await politeJson<TxdotBidRow[]>(txdotQuery(offset, from));
    rows.push(...page);
    if (page.length < 10_000) break;
  }
  return parseTxdot(rows, opts);
}
