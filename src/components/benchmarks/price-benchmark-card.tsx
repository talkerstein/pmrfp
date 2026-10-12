import Link from "@/i18n/link";
import { ChartColumn, Lock, Trophy } from "lucide-react";
import type { BenchmarkView } from "@/lib/data/price-benchmarks";
import { shortPrice } from "@/lib/data/price-benchmarks-load";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/**
 * "What similar contracts sold for": one trade × province benchmark, linking
 * to its full page. Trade Pro sees the middle-half range, the median and the
 * most frequent winners; everyone else sees the count and whether a range
 * exists. The locked version is built from the teaser object, so the numbers
 * are never in the page for non-members.
 *
 * `upgradeHref` null = the viewer is unknown (a cached page): link to the
 * benchmark page instead of an upgrade, which gates there.
 */
export function PriceBenchmarkCard({
  view,
  href,
  upgradeHref,
}: {
  view: BenchmarkView;
  href: string;
  upgradeHref: string | null;
}) {
  const t = getT("benchmarks").card;
  const lang = getLang();
  const b = view.data;
  const n = (x: number) => formatNumber(x, lang);
  const sub = fmt(t.sub, { trade: tradeName(b.trade, lang), province: regionName(b.province, lang) });
  const stats = view.pro ? view.data.stats : null;

  return (
    <div className={`rounded-xl border p-5 ${stats ? "border-teal-400/50 bg-teal-50/40" : "border-border bg-card"}`} data-card="price-benchmark">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <ChartColumn className="size-4 text-teal-700" aria-hidden /> {t.title}
        {!view.pro && b.enough && <Lock className="ml-auto size-4 text-muted-foreground" aria-hidden />}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>

      {stats ? (
        <>
          <p className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-indigo">
            {fmt(t.range, { low: shortPrice(stats.p25, b.currency, lang), high: shortPrice(stats.p75, b.currency, lang) })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{fmt(t.rangeNote, { median: shortPrice(stats.median, b.currency, lang) })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plural(b.valued, t.count, { n: n(b.valued) })}</p>
        </>
      ) : b.enough ? (
        <>
          <div aria-hidden className="mt-3 flex select-none items-center gap-3 blur-[6px]">
            <span className="h-7 w-24 rounded-md bg-indigo/15" />
            <span className="text-muted-foreground">–</span>
            <span className="h-7 w-28 rounded-md bg-indigo/15" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{plural(b.valued, t.count, { n: n(b.valued) })}</strong>. {t.lockedRange}. {t.lockedBody}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{fmt(t.notEnough, { n: n(b.valued) })}</p>
      )}

      {view.pro && view.data.topWinners.length > 0 && (
        <div className="mt-4 border-t border-teal-400/30 pt-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-teal-700" aria-hidden /> {t.winners}
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {view.data.topWinners.slice(0, 3).map((w) => (
              <li key={w.name} className="flex items-baseline justify-between gap-3">
                {w.slug ? (
                  <Link href={`/contract-winners/${w.slug}`} className="min-w-0 truncate font-medium hover:text-teal-700 hover:underline">{w.name}</Link>
                ) : (
                  <span className="min-w-0 truncate font-medium">{w.name}</span>
                )}
                <span className="shrink-0 text-muted-foreground">{plural(w.awards, t.wins, { n: n(w.awards) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {!view.pro && b.enough && upgradeHref ? (
          <>
            <Link href={upgradeHref} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-indigo-700">
              {t.ctaLocked}
            </Link>
            <Link href={href} className="text-sm font-medium text-teal-700 hover:underline">{t.cta} →</Link>
          </>
        ) : (
          <Link href={href} className="text-sm font-medium text-teal-700 hover:underline">{t.cta} →</Link>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.footnote}</p>
    </div>
  );
}
