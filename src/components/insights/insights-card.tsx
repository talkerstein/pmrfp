import Link from "@/i18n/link";
import { Lock } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { RenderedInsight } from "@/lib/insights/copy";
import { insightsUi } from "@/lib/insights/ui-copy";
import type { Persona } from "@/lib/insights/types";

/**
 * "Insights for you" on the trade dashboard. Receives insights ALREADY
 * gated and rendered on the server (lib/insights/gating → copy): a locked
 * one is a teaser object with no gated numbers in it, so nothing hidden
 * ever reaches the HTML.
 */
export function InsightsCard({
  insights,
  persona,
  lang,
  isPro,
  marketHref,
}: {
  insights: RenderedInsight[];
  persona: Persona;
  lang: Locale;
  isPro: boolean;
  marketHref?: string | null;
}) {
  const t = insightsUi(lang).card;
  const open = insights.filter((i) => !i.locked);
  const locked = insights.filter((i) => i.locked);
  const shownLocked = locked.slice(0, isPro ? 2 : 3);
  const hidden = locked.length - shownLocked.length;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-section="insights">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.sub[persona]}</p>
        </div>
        {marketHref && (
          <Link href={marketHref} className="text-sm font-medium text-teal-700 hover:underline">
            {t.market} →
          </Link>
        )}
      </div>

      {insights.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground" data-empty="insights">{t.empty}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {open.map((i) => (
            <li key={i.id} className="rounded-md border border-border p-4" data-insight={i.kind}>
              <p className="font-semibold text-foreground">{i.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
              {i.items.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {i.items.map((it) => (
                    <li key={`${it.href}${it.label}`}>
                      {it.href ? (
                        <Link href={it.href} className="font-medium text-foreground hover:underline">{it.label}</Link>
                      ) : (
                        <span className="font-medium text-foreground">{it.label}</span>
                      )}
                      {it.meta && <span className="text-muted-foreground"> · {it.meta}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {i.basis && <span className="text-muted-foreground">{i.basis}</span>}
                {i.links.map((l) => (
                  <Link key={l.href} href={l.href} className="font-medium text-teal-700 hover:underline">{l.label} →</Link>
                ))}
              </div>
            </li>
          ))}
          {shownLocked.map((i) => (
            <li key={i.id} className="rounded-md border border-dashed border-border bg-muted/30 p-4" data-insight-locked={i.kind}>
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {i.title}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{t.locked[i.unlock ?? "pro"]}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
              {i.links[0] && (
                <Link href={i.links[0].href} className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline">{i.links[0].label} →</Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && <p className="mt-3 text-xs text-muted-foreground">{t.more(hidden)}</p>}
      {!isPro && open.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t.freeNote}</p>}
      <p className="mt-3 text-xs text-muted-foreground">{t.method}</p>
    </section>
  );
}
