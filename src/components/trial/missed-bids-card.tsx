import Link from "@/i18n/link";
import { Mail } from "lucide-react";
import { TrackOnMount } from "@/components/track";
import { ProGateCta } from "@/components/trial/pro-gate-cta";
import type { GateOffer } from "@/lib/entitlement/gate";
import type { MissedBids } from "@/lib/entitlement/missed-bids";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, formatNumber, plural } from "@/i18n/format";

/**
 * "Bids you may have missed" on a free member's dashboard. Every number is
 * counted from the same match the Monday roundup uses (lib/entitlement/
 * missed-bids): bids in their trades and region, posted in the last 7 days.
 * Up to three titles with their closing dates are free; the buyer, the price
 * band and the previous winner stay behind the trial button. The caller
 * passes null when nothing matched, and then nothing is drawn.
 */
export function MissedBidsCard({ missed, offer }: { missed: MissedBids | null; offer: GateOffer }) {
  if (!missed) return null;
  const t = getT("trialFirst").missed;
  const lang = getLang();
  const closed = missed.closedCount > 0 ? fmt(t.closed, { m: formatNumber(missed.closedCount, lang) }) : "";
  return (
    <section className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-6" data-section="missed-bids">
      <TrackOnMount event="missed_bids_card_viewed" props={{ n: missed.openCount, closed: missed.closedCount }} />
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Mail className="size-4 text-teal-700" aria-hidden /> {t.title}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {plural(missed.openCount, t.body, { n: formatNumber(missed.openCount, lang), closed })}
      </p>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card text-sm">
        {missed.shown.map((b) => (
          <li key={b.slug} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <Link href={`/rfps/${b.slug}`} className="font-medium text-foreground hover:underline">
              {b.title}
            </Link>
            <span className="text-xs text-muted-foreground">{b.deadline ? fmt(t.closes, { date: formatDate(b.deadline, lang) }) : t.noDeadline}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">{t.locked}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <ProGateCta offer={offer} source="missed_bids" returnTo="/dashboard" paidLabel={getT("trialFirst").cta.seePlans} />
        <Link href="/rfps" className="text-sm font-medium text-teal-700 hover:underline">
          {t.all} →
        </Link>
      </div>
    </section>
  );
}
