import Link from "@/i18n/link";
import { Lock, Target } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { regionName } from "@/i18n/terms";
import { fmtFor } from "@/lib/insights/copy";
import { insightsUi } from "@/lib/insights/ui-copy";
import type { PositioningView } from "@/lib/insights/positioning";

/**
 * "Bid positioning" on an open listing. Gets a PositioningView already cut
 * down on the server for this viewer (lib/insights/positioning
 * positioningView): free = counts, Trade Pro = the price band, Award
 * Intelligence = the buyer's usual winners. Locked parts are rendered from
 * counts only, so the gated values are never in the HTML.
 */
export function BidPositioningCard({ view, lang, upgradeHref, cta }: { view: PositioningView; lang: Locale; upgradeHref: string; cta?: React.ReactNode }) {
  const t = insightsUi(lang).pos;
  const c = fmtFor(lang);
  const money = (x: number) => c.money(x, view.currency);

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-card="bid-positioning">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Target className="size-4 text-teal-700" aria-hidden /> {t.title}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      <div className="mt-4 space-y-4 text-sm">
        {view.band ? (
          <div data-pos="band">
            <p className="font-medium text-foreground">{t.band(c.trade({ slug: view.band.tradeSlug, name: view.band.trade }), regionName(view.band.province, lang))}</p>
            <p className="mt-1">
              <span className="text-muted-foreground">{t.bandRange}: </span>
              <strong>{money(view.band.p25)} – {money(view.band.p75)}</strong>
              <span className="text-muted-foreground"> · {t.bandMedian}: </span>
              <strong>{money(view.band.median)}</strong>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.bandFrom(view.band.n)} · <Link href={view.band.href} className="text-teal-700 hover:underline">{t.full} →</Link>
            </p>
          </div>
        ) : view.locks.band ? (
          <div data-pos="band-locked">
            <p className="flex items-center gap-2 text-muted-foreground"><Lock className="size-3.5" aria-hidden />{t.bandLocked(view.bandCount)}</p>
            {cta ? <div className="mt-2">{cta}</div> : <Link href={upgradeHref} className="mt-1 inline-block text-xs font-medium text-teal-700 hover:underline">{t.unlockPro} →</Link>}
          </div>
        ) : view.bandCount > 0 ? (
          <p className="text-muted-foreground" data-pos="band-thin">{t.bandThin(view.bandCount, view.bandMin)}</p>
        ) : null}

        {view.buyerName && (
          <div data-pos="buyer">
            <p className="font-medium text-foreground">{t.buyer}</p>
            <p className="mt-1 text-muted-foreground">{t.buyerAwards(view.buyerName, view.buyerAwards, view.buyerInTrade)}</p>
            {view.incumbents ? (
              view.incumbents.length ? (
                <div className="mt-1">
                  <span className="text-muted-foreground">{t.incumbents}: </span>
                  {view.incumbents.map((w, i) => (
                    <span key={w.name}>
                      {i > 0 && ", "}
                      {w.href ? <Link href={w.href} className="font-medium hover:underline">{w.name}</Link> : <strong>{w.name}</strong>}
                      <span className="text-muted-foreground"> ({t.wins(w.wins)})</span>
                    </span>
                  ))}
                  {view.buyerHref && (
                    <Link href={view.buyerHref} className="ml-2 text-xs text-teal-700 hover:underline">{t.profile} →</Link>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{t.noIncumbents}</p>
              )
            ) : view.locks.incumbents ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {t.incumbentsLocked}{" "}
                <Link href="/intel" className="font-medium text-teal-700 hover:underline">{t.unlockIntel} →</Link>
              </p>
            ) : null}
          </div>
        )}

        <div data-pos="bids">
          <p className="font-medium text-foreground">{t.bids}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.bidsUnknown}</p>
        </div>
      </div>
    </div>
  );
}
