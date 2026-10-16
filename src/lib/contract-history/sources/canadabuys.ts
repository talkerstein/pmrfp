/**
 * CA-04 · CanadaBuys award notices (open data CSV, Open Government Licence –
 * Canada): federal awards with supplier, total value, contract start and END
 * date ("contractEndDate": the last date the awarded contract is valid),
 * amendments. Files: the all-notices file (2022-08 →, refreshed daily), one
 * per fiscal year, and the 2012–2022 legacy file — the backfill.
 *
 * ADMIN UPLOAD ONLY. The files are on canadabuys.canada.ca, whose robots.txt
 * (checked 2026-10-16) is "User-agent: * / Disallow: /" (only Googlebot and
 * bingbot are allowed). So no PMRFP bot fetches them: an admin downloads a
 * file in a browser and uploads it at /admin/award-history; the browser
 * splits it into record-aligned pieces and this parser runs per piece.
 *
 * Kept: services and construction (procurementCategory SRV / CNST) whose
 * title is building-trade work (the board's English rules and exclusions),
 * delivered in Canada and paid in CAD. One row per award notice and
 * supplier; the highest amendment number wins.
 */
import { OGL_CANADA_ATTRIBUTION } from "@/lib/tenders/sources";
import { awardNoticeUrl } from "@/lib/tenders/awards";
import { regionForTender } from "@/lib/tenders/canadabuys";
import { slugify } from "@/lib/tenders/shared";
import { readCsv } from "../csv-stream";
import { buyerKey, clip, emptyBatch, endDateFor, isoDay, money, skip, winnerFields, type AwardHistoryInput, type ParsedBatch } from "../model";
import { tradesEn } from "../trades";

export const CANADABUYS_SOURCE = "ca-canadabuys-awards";
export const CANADABUYS_LICENCE = "Open Government Licence – Canada";
/** The files an admin downloads by hand (open.canada.ca dataset a1acb126-9ce8-40a9-b889-5da2b1dd20cb). */
export const CANADABUYS_FILES = [
  "https://canadabuys.canada.ca/opendata/pub/awardNoticeComplete-avisAttributionComplet.csv",
  "https://canadabuys.canada.ca/opendata/pub/2012-2022-awardNoticeHistorical-avisAttributionHistorique.csv",
];
export const CANADABUYS_HEADER = "contractAwardDate-dateAttributionContrat";

const COL = {
  title: "title-titre-eng",
  ref: "referenceNumber-numeroReference",
  awarded: "contractAwardDate-dateAttributionContrat",
  amount: "contractAmount-montantContrat",
  total: "totalContractValue-valeurTotaleContrat",
  currency: "contractCurrency-contratMonnaie",
  category: "procurementCategory-categorieApprovisionnement",
  supplier: "supplierLegalName-nomLegalFournisseur-eng",
  supplierOperating: "supplierOperatingName-nomCommercialFournisseur-eng",
  entity: "contractingEntityName-nomEntitContractante-eng",
  description: "awardDescription-descriptionAttribution-eng",
  amendment: "amendmentNumber-numeroModification",
  start: "contractStartDate-contratDateDebut",
  end: "contractEndDate-dateFinContrat",
  delivery: "regionsOfDelivery-regionsLivraison-eng",
} as const;

export function canadabuysRow(r: Record<string, string>, opts: { since: string; asOf: string }): AwardHistoryInput | string {
  if (!/SRV|CNST/.test(r[COL.category] ?? "")) return "not-services-or-construction";
  const awardDate = isoDay(r[COL.awarded]);
  if (!awardDate) return "no-date";
  if (awardDate < opts.since) return "too-old";
  if (awardDate > opts.asOf) return "future-date";
  if ((r[COL.currency] || "CAD").trim() !== "CAD") return "currency";
  const title = clip(r[COL.title], 300);
  const ref = (r[COL.ref] ?? "").trim();
  if (!title || !ref) return "no-title";
  const trades = tradesEn(title);
  if (!trades.length) return "not-building-work";
  const winner = winnerFields(r[COL.supplier] || r[COL.supplierOperating]);
  if (!winner) return "no-supplier";
  const region = regionForTender(r);
  const buyer = clip(r[COL.entity], 200);
  const description = clip(r[COL.description], 1000);
  const end = endDateFor({ awardDate, stated: r[COL.end], text: `${title} ${description ?? ""}` });
  return {
    source: CANADABUYS_SOURCE,
    source_key: `${ref}|${winner.winner_key ?? "individual"}`,
    board_ref: `cba-${slugify(ref)}`,
    title,
    description,
    buyer,
    buyer_key: buyerKey(buyer),
    ...winner,
    value: Math.max(money(r[COL.amount]) ?? 0, money(r[COL.total]) ?? 0) || null,
    currency: "CAD",
    country: "CA",
    province: region.province,
    city: null,
    award_date: awardDate,
    award_date_precision: "day",
    start_date: isoDay(r[COL.start]),
    ...end,
    potential_end_date: null,
    number_of_bids: null,
    trade_slugs: trades,
    notice_url: awardNoticeUrl(slugify(ref)),
    licence: CANADABUYS_LICENCE,
    attribution: OGL_CANADA_ATTRIBUTION,
    as_of: opts.asOf,
  };
}

/** Parse one uploaded piece (header + whole records). Highest amendment per notice + supplier wins. */
export function parseCanadabuysCsv(text: string, opts: { since: string; asOf: string }): ParsedBatch {
  const batch = emptyBatch();
  const best = new Map<string, { row: AwardHistoryInput; amendment: string }>();
  for (const r of readCsv(text)) {
    batch.read++;
    const out = canadabuysRow(r, opts);
    if (typeof out === "string") {
      skip(batch, out);
      continue;
    }
    const amendment = (r[COL.amendment] ?? "000").padStart(3, "0");
    const prev = best.get(out.source_key);
    if (!prev || amendment >= prev.amendment) best.set(out.source_key, { row: out, amendment });
  }
  batch.awards = [...best.values()].map((x) => x.row);
  return batch;
}
