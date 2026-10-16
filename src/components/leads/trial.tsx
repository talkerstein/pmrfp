import Link from "@/i18n/link";
import { buttonVariants } from "@/components/ui/button";
import { startTrialAction } from "@/lib/entitlement/actions";
import type { TrialSource, TrialState } from "@/lib/entitlement/trial";
import { FOUNDING_PATH, foundingPrice, isSoldOut } from "@/lib/founding/config";
import { cachedLifetimeCount } from "@/lib/founding/server";
import type { CountryCode } from "@/lib/visitor-geo";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

/** One-click trial start: a plain form posting to the server action (no client JS). */
export function TrialStartForm({ source, label, variant = "default", lang }: { source: TrialSource; label: string; variant?: "default" | "outline"; lang: Locale }) {
  return (
    <form action={startTrialAction} className="inline">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="lang" value={lang} />
      <button type="submit" className={buttonVariants({ variant, size: "lg" })} data-action="start-trial">
        {label}
      </button>
    </form>
  );
}

/** "$250 CAD" / "250 $ CAD" / "$200 USD": the Founding 500 price in the visitor's one currency. */
export function foundingPriceLabel(country: CountryCode, lang: Locale): string {
  const { amount, currency } = foundingPrice(country);
  const cur = currency.toUpperCase();
  return lang === "fr" ? `${amount} $ ${cur === "USD" ? "US" : "CAD"}` : `$${amount} ${cur}`;
}

/** Can this company start a trial? Trade companies that don't pay and never had one. */
export function canStartTrial(p: { paid?: boolean; trial?: TrialState; organizationType?: string | null }): boolean {
  return p.organizationType === "trade_company" && !p.paid && (p.trial?.status ?? "none") === "none";
}

/**
 * Trial status for the dashboard: days left while it runs; after it ends,
 * a gentle note with the Founding 500 offer in the visitor's currency.
 * Nothing for paying members or companies that never started one.
 */
export async function TrialStatus({ trial, paid, country }: { trial?: TrialState; paid?: boolean; country: CountryCode }) {
  if (paid || !trial || trial.status === "none") return null;
  const t = getT("leads").trial;
  const lang = getLang();
  const date = trial.endsAt ? formatDate(trial.endsAt, lang) : "";
  if (trial.status === "active") {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-5" data-section="trial-active">
        <div>
          <p className="font-semibold text-foreground">{plural(trial.daysLeft, t.active)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{fmt(t.activeBody, { date })}</p>
        </div>
        <Link href="/dashboard/billing?plan=pro&interval=annual" className={buttonVariants({ variant: "outline" })}>
          {t.keep}
        </Link>
      </div>
    );
  }
  const sold = await cachedLifetimeCount().catch(() => null);
  const founding = sold == null || !isSoldOut(sold);
  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-5" data-section="trial-expired">
      <p className="font-semibold text-foreground">{fmt(t.expired, { date })}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.expiredBody}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {founding && (
          <>
            <span>{fmt(t.founding, { price: foundingPriceLabel(country, lang) })}</span>
            <Link href={FOUNDING_PATH} className="font-medium text-teal-700 hover:underline">{t.foundingCta} →</Link>
          </>
        )}
        <Link href="/pricing" className="text-muted-foreground hover:underline">{t.upgrade}</Link>
      </div>
    </div>
  );
}

const FLASH_KEYS = ["started", "used", "paid", "role", "org", "suspended", "signin", "unavailable"] as const;
type FlashKey = (typeof FLASH_KEYS)[number];

/** The one-line result after the trial button (?trial=started|used|…). */
export function TrialFlash({ value }: { value: string | undefined }) {
  if (!value || !FLASH_KEYS.includes(value as FlashKey)) return null;
  const t = getT("leads").trial.flash;
  const ok = value === "started";
  return (
    <p
      role="status"
      className={`mb-4 rounded-md px-3 py-2 text-sm ${ok ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}
    >
      {t[value as FlashKey]}
    </p>
  );
}
