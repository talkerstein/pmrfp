import { getT } from "@/i18n/server";
import { formatNumber } from "@/i18n/format";
import { getLang } from "@/i18n/server";
import type { TrialUsage } from "@/lib/entitlement/banner";

/**
 * "Pro this month: alerts received N, bids saved N, responses sent N", for a
 * member with Trade Pro (a trial or paid). Counted from their own alert
 * emails (notifications), saved bids and responses. Drawn only when at least
 * one number is above zero: an empty ledger says nothing. Bids opened and
 * awards viewed are not counted anywhere that is tied to a member, so they
 * are not shown.
 */
export function ProLedgerCard({ usage }: { usage: TrialUsage }) {
  if (usage.alerts + usage.saved + usage.responses === 0) return null;
  const t = getT("trialFirst").ledger;
  const lang = getLang();
  const rows: [string, number][] = [
    [t.alerts, usage.alerts],
    [t.saved, usage.saved],
    [t.responses, usage.responses],
  ];
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6" data-section="pro-ledger">
      <h2 className="text-base font-semibold">{t.title}</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        {rows.map(([label, n]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{formatNumber(n, lang)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{t.note}</p>
    </section>
  );
}
