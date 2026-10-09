import type { RfpListItem } from "@/lib/data/types";
import { inCountry, type CountryCode } from "@/lib/visitor-geo";
import { publicTenderSource } from "@/lib/tenders/sources";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import sharedClient from "@/i18n/messages/sharedClient";

/**
 * Urgency from REAL data only — countdowns from actual closing dates, dollar
 * totals from actual award notices. Nothing here invents a number: if the
 * data isn't there, the caller shows nothing.
 */

export function isPastContract(r: Pick<RfpListItem, "slug" | "sourceType">): boolean {
  return r.sourceType === "public_source" && publicTenderSource(r.slug).past;
}

/** Winner + value from an award summary ("Awarded … to X (City) — $1,234 CAD."). */
export function parseAward(summary: string | null): { winner: string | null; amount: number | null; value: string | null } {
  const m = summary?.match(/^Awarded [^.]*? to (.+?) — (\$[\d,]+ CAD|value not disclosed)\./);
  if (!m) return { winner: null, amount: null, value: null };
  const winner = m[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
  const amount = m[2].startsWith("$") ? Number(m[2].replace(/[^\d]/g, "")) : null;
  return { winner, amount, value: amount ? m[2] : null };
}

/** Whole days from today (Eastern time — where most bidders are) to a
 *  YYYY-MM-DD deadline; negative = past. UTC would say "closes today" for
 *  tomorrow's deadlines every evening after 8 pm Toronto time. */
export function daysUntil(deadline: string | null, now = new Date()): number | null {
  if (!deadline) return null;
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(now);
  const today = Date.parse(todayLocal);
  return Math.round((Date.parse(deadline.slice(0, 10)) - today) / 86_400_000);
}

/** "Closes today" / "Closes tomorrow" / "Closes in 3 days"; null outside the last week. */
export function closingLabel(days: number | null, lang: Locale = "en"): string | null {
  if (days === null || days < 0 || days > 7) return null;
  const t = ((sharedClient as Partial<Record<Locale, typeof sharedClient.en>>)[lang] ?? sharedClient.en).labels;
  if (days === 0) return t.closesToday;
  if (days === 1) return t.closesTomorrow;
  return fmt(t.closesInDays, { n: days });
}

export interface BoardStats {
  open: number;
  closingThisWeek: number;
  pastContracts: number;
  awardedValue: number;
}

export function boardStats(rfps: RfpListItem[]): BoardStats {
  let open = 0, closingThisWeek = 0, pastContracts = 0, awardedValue = 0;
  for (const r of rfps) {
    if (r.status === "open") {
      open++;
      const d = daysUntil(r.deadline);
      if (d !== null && d >= 0 && d <= 7) closingThisWeek++;
    } else if (isPastContract(r)) {
      pastContracts++;
      awardedValue += parseAward(r.summary).amount ?? 0;
    }
  }
  return { open, closingThisWeek, pastContracts, awardedValue };
}

/**
 * Country-first headline numbers: the board's stats for Canada and for the
 * U.S. separately. Never add them together on a page; show the visitor's.
 */
export function boardStatsByCountry(rfps: RfpListItem[]): Record<CountryCode, BoardStats> {
  return { CA: boardStats(inCountry(rfps, "CA")), US: boardStats(inCountry(rfps, "US")) };
}

/**
 * "$204M", "$1.2M", "$840K" — for headline totals. French: "204 M$", "1,2 M$", "840 k$".
 * Spanish (U.S.): "$204 M", "$1.2 M", "$840 mil"; billions stay in millions ("$1,400 M")
 * because "billón" means a million million in Spanish.
 */
export function compactDollars(n: number, lang: Locale = "en"): string {
  if (lang === "es") {
    const nbsp = " "; // keeps "$1.2 M" on one line
    if (n >= 1e9) return `$${(Math.round(n / 1e8) * 100).toLocaleString("en-US")}${nbsp}M`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}${nbsp}M`;
    if (n >= 1e3) return `$${Math.round(n / 1e3)}${nbsp}mil`;
    return `$${Math.round(n)}`;
  }
  if (lang === "fr") {
    const num = (v: number, digits: number) => v.toFixed(digits).replace(/\.0$/, "").replace(".", ",");
    const nbsp = "\u00a0"; // keeps "1,2 M$" on one line
    if (n >= 1e9) return `${num(n / 1e9, 1)}${nbsp}G$`;
    if (n >= 1e6) return `${num(n / 1e6, n >= 1e8 ? 0 : 1)}${nbsp}M$`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}${nbsp}k$`;
    return `${Math.round(n)}${nbsp}$`;
  }
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
