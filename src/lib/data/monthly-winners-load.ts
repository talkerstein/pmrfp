import { cache } from "react";
import { listRfps } from "@/lib/data/rfps";
import { MONTH_RE, buildMonthlyReport, monthlyAwards, reportMonths } from "@/lib/data/monthly-winners";
import { compactDollars } from "@/lib/data/fomo";
import { formatDate, formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

export const REPORTS_PATH = "/reports/contract-winners";

/** Today in Toronto (where the month boundary is judged). */
export const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

/** Every award + the months that get a report, once per request (page, metadata, OG image). */
export const loadMonthly = cache(async () => {
  const awards = monthlyAwards(await listRfps().catch(() => []));
  return { awards, months: reportMonths(awards, torontoToday()) };
});

/** The report for a published month, or null (404). */
export const loadMonthReport = cache(async (month: string) => {
  if (!MONTH_RE.test(month)) return null;
  const { awards, months } = await loadMonthly();
  if (!months.some((m) => m.month === month)) return null;
  return buildMonthlyReport(awards, month);
});

export const monthLabel = (month: string, lang: Locale) => formatDate(`${month}-15T12:00:00Z`, lang, { month: "long", year: "numeric" });

const NBSP = " ";
/** "$1,591,087" (en/es), "1 591 087 $" (fr). */
export const money = (n: number, lang: Locale) =>
  lang === "fr" ? `${formatNumber(Math.round(n), lang)}${NBSP}$` : `$${formatNumber(Math.round(n), lang === "es" ? "es" : "en")}`;
export const shortMoney = (n: number, lang: Locale) => compactDollars(n, lang);
/** "12.5%" / "12,5 %". */
export const pct = (n: number, lang: Locale) => (lang === "fr" ? `${formatNumber(Math.abs(n), lang)}${NBSP}%` : `${formatNumber(Math.abs(n), lang)}%`);
