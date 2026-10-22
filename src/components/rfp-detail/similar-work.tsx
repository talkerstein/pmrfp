import type { ReactNode } from "react";
import { Lock, TrendingUp, Trophy } from "lucide-react";
import Link from "@/i18n/link";
import { Block } from "./blocks";
import type { SimilarWorkView } from "@/lib/rfp-detail/similar-work";
import { MIN_AWARDS } from "@/lib/data/award-intel";
import { moneyShort } from "@/lib/rfp-detail/format";
import { tradeWords } from "@/lib/gc/packages";
import { getLang, getT } from "@/i18n/server";
import { fmt, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/**
 * "What similar work sold for" (depth plan, Step 2, block 3).
 *
 * FREE, for everyone: the median past award for this trade in this place and
 * how many awards it rests on (or just the count when there are too few
 * priced awards). TRADE PRO: the middle-half price band and the companies
 * that win this work most often. A viewer without Pro gets a locked teaser
 * built from the free object, which has no band and no names, so they are
 * not in the page. `cta` is the "Try Trade Pro free for 14 days" control.
 */
export function SimilarWorkCard({
  view,
  benchmark,
  cta,
}: {
  view: SimilarWorkView;
  /** Link to the full trade × province price benchmark, when there is one. */
  benchmark?: { href: string; province: string } | null;
  cta: ReactNode;
}) {
  const t = getT("rfpDepth").similar;
  const lang = getLang();
  const d = view.data;
  // Mid-sentence trade name: Spanish keeps acronyms ("HVAC (climatización)"); English/French lower-case.
  const trade = lang === "es" ? tradeWords(tradeName(d.trade, lang)) : tradeName(d.trade, lang).toLowerCase();
  const scope = d.scope === "the U.S." ? t.usScope : regionName(d.scope, lang);
  const med = d.median !== null ? moneyShort(d.median, d.currency, lang) : null;

  return (
    <Block id="similar-work" tone={view.pro ? "teal" : "plain"} icon={<TrendingUp className="size-4 text-teal-700" aria-hidden />} title={t.title} sub={fmt(t.sub, { trade, scope })}>
      {med !== null ? (
        <>
          <p className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-indigo" data-value="median">{fmt(t.median, { median: med })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{plural(d.valued, t.basedOn)}</p>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-value="count-only">
          {fmt(t.countOnly, { awards: plural(d.awards, t.awards), scope, valued: d.valued, min: MIN_AWARDS })}
        </p>
      )}

      {view.pro && view.data.low !== null && view.data.high !== null && (
        <div className="mt-4 border-t border-teal-400/30 pt-3" data-value="band">
          <p className="text-sm font-medium">
            {fmt(view.data.middleHalf ? t.band : t.range, {
              low: moneyShort(view.data.low, view.data.currency, lang),
              high: moneyShort(view.data.high, view.data.currency, lang),
            })}
          </p>
          {view.data.winners.length > 0 && (
            <>
              <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4 text-teal-700" aria-hidden /> {t.winners}
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm" data-value="winners">
                {view.data.winners.map((w) => (
                  <li key={w.name} className="flex items-baseline justify-between gap-3">
                    {w.slug ? (
                      <Link href={`/contract-winners/${w.slug}`} className="min-w-0 truncate font-medium hover:text-teal-700 hover:underline">{w.name}</Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium">{w.name}</span>
                    )}
                    <span className="shrink-0 text-muted-foreground">{plural(w.wins, t.wins)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!view.pro && med !== null && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4" data-gate="similar-work">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="size-4 text-teal-700" aria-hidden /> {t.lockedTitle}
          </p>
          <div aria-hidden className="mt-3 flex select-none items-center gap-3 blur-[6px]">
            <span className="h-6 w-24 rounded-md bg-indigo/15" />
            <span className="text-muted-foreground">–</span>
            <span className="h-6 w-28 rounded-md bg-indigo/15" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{fmt(t.lockedBody, { scope })}</p>
          {cta}
        </div>
      )}

      {benchmark && (
        <p className="mt-4 text-sm">
          <Link href={benchmark.href} className="font-medium text-teal-700 hover:underline">
            {fmt(t.benchmark, { trade: tradeName(d.trade, lang), province: regionName(benchmark.province, lang) })} →
          </Link>
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.footnote}</p>
    </Block>
  );
}
