import type { RfpListItem } from "@/lib/data/types";
import { publicTenderSource } from "@/lib/tenders/sources";

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

export function closingLabel(days: number | null): string | null {
  if (days === null || days < 0 || days > 7) return null;
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
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

/** "$204M", "$1.2M", "$840K" — for headline totals. */
export function compactDollars(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
