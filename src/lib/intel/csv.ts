/**
 * CSV exports for every Award Intelligence view (Intel subscribers only; the
 * route checks). One country and one currency per file, named in the header.
 * BOM first so Excel keeps Quebec accents.
 */
import type { BuyerIndexRow, BuyerProfile, CompanyIndexRow, CompanyProfile, IntelAward, MarketIndexRow, MarketShare, RenewalItem } from "./model";
import { awardHref } from "./history";

const BOM = "﻿";

export const csvCell = (v: string | number | null | boolean | undefined) => {
  const s = v == null ? "" : String(v);
  // Also neutralise spreadsheet formulas (=, +, -, @ at the start of a text cell).
  const safe = typeof v === "string" && /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: (string | number | null | boolean | undefined)[][]): string {
  return BOM + [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

const INDIVIDUAL = "Individual (not named)";

function awardRows(awards: readonly IntelAward[], siteUrl: string) {
  const currency = awards[0]?.currency ?? "CAD";
  const header = ["award_date", "contract", "buyer", "winner", `value_${currency.toLowerCase()}`, "currency", "province_or_state", "city", "country", "trades", "pmrfp_url", "official_notice", "source_licence"];
  const rows = awards.map((a) => [a.date, a.title, a.buyer, a.winner ?? INDIVIDUAL, a.amount, a.currency, a.province, a.city, a.country, a.trades.join("; "), `${siteUrl}${awardHref(a)}`, a.noticeUrl, a.attribution]);
  return { header, rows };
}

export function companyCsv(p: CompanyProfile, siteUrl: string): string {
  const { header, rows } = awardRows(p.awards, siteUrl);
  return toCsv(header, rows);
}

export function buyerCsv(p: BuyerProfile, siteUrl: string): string {
  const { header, rows } = awardRows(p.awards, siteUrl);
  return toCsv(header, rows);
}

export function marketCsv(m: MarketShare, siteUrl: string): string {
  const cur = m.currency.toLowerCase();
  const header = ["rank", "company", "awards", "share_of_awards_pct", "awards_with_value", `value_${cur}`, "share_of_value_pct", "currency", "first_award_on_record", `new_in_${m.year}`, "trade", "province_or_state", "country", "pmrfp_profile"];
  const rows = m.winners.map((w, i) => [
    i + 1, w.name, w.awards, w.shareCount, w.valued, w.value, w.shareValue, m.currency, w.firstDate, w.firstDate.startsWith(m.year) ? "yes" : "", m.trade, m.province, m.country,
    w.slug ? `${siteUrl}/intel/companies/${w.slug}` : "",
  ]);
  if (m.individuals) rows.push(["", INDIVIDUAL, m.individuals, "", "", "", "", m.currency, "", "", m.trade, m.province, m.country, ""]);
  return toCsv(header, rows);
}

export const TERM_LABEL: Record<RenewalItem["term"]["source"], string> = {
  "stated-end-date": "Contract end date on record",
  "derived-end-date": "End date from the term stated in the contract",
  "stated-years": "Period stated in the notice",
  "stated-seasons": "Seasons stated in the notice",
  "stated-duration": "Term stated in the notice",
  typical: "Estimated from typical 3-year terms",
};

function statedTerm(term: RenewalItem["term"]): string {
  if (term.endDate && (term.source === "stated-end-date" || term.source === "derived-end-date")) return `ends ${term.endDate}`;
  if (term.source === "stated-years") return `${term.startYear}-${term.endYear}`;
  if (term.source === "stated-seasons") return `${term.seasons} seasons`;
  if (term.source === "stated-duration") return `${term.months} months`;
  return "";
}

export function renewalsCsv(items: readonly RenewalItem[], siteUrl: string): string {
  const currency = items[0]?.award.currency ?? "CAD";
  const header = ["est_rebid_window_start", "est_rebid_window_end", "expected_next_award", "status", "how_estimated", "stated_term", "option_years_stated", "trade", "contract", "buyer", "current_holder", "awarded_on", `value_${currency.toLowerCase()}`, "currency", "province_or_state", "city", "country", "pmrfp_url", "official_notice"];
  const rows = items.map((it) => [
    it.windowStart, it.windowEnd, it.expectedRebid, it.status, TERM_LABEL[it.term.source],
    statedTerm(it.term), it.term.optionMonths ? Math.round(it.term.optionMonths / 12) : "",
    it.trade, it.award.title, it.award.buyer, it.award.winner ?? INDIVIDUAL, it.award.date, it.award.amount, it.award.currency, it.award.province, it.award.city, it.award.country,
    `${siteUrl}${awardHref(it.award)}`, it.award.noticeUrl,
  ]);
  return toCsv(header, rows);
}

export function companiesCsv(rows: readonly CompanyIndexRow[], currency: string, siteUrl: string): string {
  return toCsv(
    ["company", "awards", "awards_with_value", `value_${currency.toLowerCase()}`, "currency", "buyers", "latest_award", "intel_profile"],
    rows.map((r) => [r.name, r.awards, r.valued, r.value, currency, r.buyers, r.lastDate, r.slug ? `${siteUrl}/intel/companies/${r.slug}` : ""]),
  );
}

export function buyersCsv(rows: readonly BuyerIndexRow[], currency: string, siteUrl: string): string {
  return toCsv(
    ["buyer", "awards", "awards_with_value", `spend_${currency.toLowerCase()}`, "currency", "suppliers", "latest_award", "intel_profile"],
    rows.map((r) => [r.name, r.awards, r.valued, r.value, currency, r.suppliers, r.lastDate, r.slug ? `${siteUrl}/intel/buyers/${r.slug}` : ""]),
  );
}

export function marketsCsv(rows: readonly MarketIndexRow[], country: string): string {
  return toCsv(["trade", "province_or_state", "country", "awards", "companies"], rows.map((r) => [r.trade, r.province, country, r.awards, r.winners]));
}
