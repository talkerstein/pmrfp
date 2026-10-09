/** Share card per monthly report: the three headline numbers. */
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/template";
import { loadMonthReport, monthLabel, shortMoney } from "@/lib/data/monthly-winners-load";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { fmt, formatNumber } from "@/i18n/format";

export const runtime = "nodejs";
export const revalidate = 86400;
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;

export default async function OG({ params }: { params: Promise<{ lang: string; month: string }> }) {
  const { lang: raw, month } = await params;
  const lang: Locale = hasLocale(raw) ? raw : "en";
  const t = getDictionary(lang).reports.og;
  const r = await loadMonthReport(month);
  if (!r) return renderOgImage({ eyebrow: "PMRFP", title: t.title, caption: "pmrfp.com" });
  return renderOgImage({
    eyebrow: fmt(t.eyebrow, { month: monthLabel(month, lang) }),
    title: t.title,
    subline: fmt(t.subline, {
      n: formatNumber(r.totals.awards, lang),
      value: shortMoney(r.totals.value, lang),
      winners: formatNumber(r.totals.winners, lang),
    }),
    caption: "pmrfp.com",
  });
}
