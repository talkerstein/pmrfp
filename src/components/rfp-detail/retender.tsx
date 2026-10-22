import type { ReactNode } from "react";
import { Lock, Repeat } from "lucide-react";
import Link from "@/i18n/link";
import { Block } from "./blocks";
import type { RetenderView } from "@/lib/rfp-detail/retender";
import { gapLabel, money } from "@/lib/rfp-detail/format";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";

/**
 * "Looks like a re-tender" (depth plan, Step 2, block 4). Always worded as
 * "looks similar to", never as fact. TRADE PRO: the previous contract, who
 * won it, when and for how much, and the timing. EVERYONE ELSE: only that a
 * similar earlier contract exists (the free object has no winner, amount,
 * date or link), plus the 14-day trial control.
 */
export function RetenderCard({ view, cta }: { view: RetenderView; cta: ReactNode }) {
  const t = getT("rfpDepth").retender;
  const lang = getLang();

  if (!view.pro) {
    return (
      <Block id="retender" icon={<Repeat className="size-4 text-teal-700" aria-hidden />} title={t.title}>
        <p className="mt-3 flex gap-2 text-sm leading-relaxed" data-gate="retender">
          <Lock className="mt-0.5 size-4 shrink-0 text-teal-700" aria-hidden />
          <span>{view.data.count > 1 ? fmt(t.freeMany, { n: view.data.count }) : t.freeBody}</span>
        </p>
        {cta}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.caveat}</p>
      </Block>
    );
  }

  const { best, cycleMonths } = view.data;
  const date = formatDate(best.date, lang, { month: "long", day: "numeric", year: "numeric" });
  const amount = best.amount !== null ? money(best.amount, best.currency, lang) : null;
  const line = best.winner
    ? amount
      ? fmt(t.awardedToFor, { winner: best.winner, date, amount })
      : fmt(t.awardedTo, { winner: best.winner, date })
    : amount
      ? fmt(t.awardedNoWinnerFor, { date, amount })
      : fmt(t.awardedNoWinner, { date });
  return (
    <Block id="retender" tone="teal" icon={<Repeat className="size-4 text-teal-700" aria-hidden />} title={t.title}>
      <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">{t.previous}</p>
      <p className="mt-1 text-sm font-medium">{best.title}</p>
      <p className="mt-1 text-sm" data-value="previous-award">{line}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {fmt(t.timing, { gap: gapLabel(best.monthsBefore, t) })}
        {cycleMonths !== null ? ` ${fmt(t.cycle, { gap: gapLabel(cycleMonths, t) })}` : ""}
      </p>
      <p className="mt-3 text-sm">
        <Link href={`/rfps/${best.slug}`} className="font-medium text-teal-700 hover:underline">{t.seeAward} →</Link>
      </p>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t.caveat}</p>
    </Block>
  );
}
