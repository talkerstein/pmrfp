/**
 * Loader half of the federal contracts one-time import: turns the compact
 * seed rows written by scripts/import-federal-contracts.mjs into
 * award_history rows (source "ca-federal-contracts", the same source and
 * "<owner_org>|<procurement_id>" ids as the monthly cron in
 * contract-history/sources/federal.ts, so loading the seed and running the
 * cron write the SAME rows).
 */
import { OGL_CANADA as OGL_CANADA_ATTRIBUTION } from "./attribution";
import { buyerKey, endDateFor, winnerFields, type AwardHistoryInput } from "@/lib/contract-history/model";
import { FEDERAL_DATASET_URL, FEDERAL_SOURCE, type FederalSeedRow } from "./federal-filter.mjs";

export const FEDERAL_LICENCE = "Open Government Licence – Canada";

export function federalSeedToAward(r: FederalSeedRow, asOf: string): AwardHistoryInput {
  const winner = (r.vendor ? winnerFields(r.vendor) : null) ?? { winner_business_name: null, winner_key: null, winner_is_individual: true };
  const end = endDateFor({ awardDate: r.award_date, stated: r.end_date, text: r.title });
  return {
    source: FEDERAL_SOURCE,
    source_key: r.source_key,
    board_ref: null,
    title: r.title,
    description: r.object && r.object !== r.title ? r.object : null,
    buyer: r.buyer,
    buyer_key: buyerKey(r.buyer),
    ...winner,
    value: r.value,
    currency: "CAD",
    country: "CA",
    province: null,
    city: null,
    award_date: r.award_date,
    award_date_precision: "day",
    start_date: r.start_date,
    ...end,
    potential_end_date: null,
    number_of_bids: r.number_of_bids,
    trade_slugs: r.trades,
    notice_url: r.reference ? `https://search.open.canada.ca/contracts/record/${encodeURIComponent(r.owner_org)},${encodeURIComponent(r.reference)}` : FEDERAL_DATASET_URL,
    licence: FEDERAL_LICENCE,
    attribution: OGL_CANADA_ATTRIBUTION,
    as_of: asOf,
    non_competitive: r.non_competitive,
    procurement_method: r.procurement_method,
  };
}
