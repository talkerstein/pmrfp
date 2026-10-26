import Link from "@/i18n/link";
import { buttonVariants } from "@/components/ui/button";
import { TrialStartForm } from "@/components/leads/trial";
import type { GateOffer } from "@/lib/entitlement/gate";
import type { TrialSource } from "@/lib/entitlement/trial";
import { getLang, getT } from "@/i18n/server";

/**
 * The primary button of a Pro gate (lib/entitlement/gate decides which):
 *
 *   signed-in company that can still start its trial
 *       one-click form, "Start 14-day free trial (no card)", back to this page unlocked
 *   signed-out visitor / company not set up yet
 *       the same label as a link into sign-up (or onboarding) that resumes into the trial
 *   already used the trial, paying, held, trials off
 *       the page's normal paid button (`paidLabel`)
 *
 * plus the quiet "See plans" link. `className` styles the main button and
 * `plansClassName` the link, so the v3 pages keep their own look.
 */
export function ProGateCta({
  offer,
  source,
  returnTo,
  paidLabel,
  className,
  plansClassName = "text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground",
  showPlans = true,
  trialLabel,
  stacked = false,
}: {
  offer: GateOffer;
  source: TrialSource;
  returnTo?: string | null;
  paidLabel: string;
  className?: string;
  plansClassName?: string;
  showPlans?: boolean;
  /** Overrides the default "Start 14-day free trial (no card)" (e.g. a shorter v3 label). */
  trialLabel?: string;
  stacked?: boolean;
}) {
  const t = getT("trialFirst").cta;
  const lang = getLang();
  const btn = className ?? buttonVariants({ size: "lg" });
  const label = trialLabel ?? t.start;
  return (
    <span className={`inline-flex ${stacked ? "flex-col items-start" : "flex-wrap items-center"} gap-3`} data-gate={offer.mode}>
      {offer.mode === "trial" ? (
        <TrialStartForm source={source} label={label} lang={lang} returnTo={returnTo} className={btn} />
      ) : offer.mode === "paid" ? (
        <Link href={offer.href} className={btn} data-gate-cta="paid">
          {paidLabel}
        </Link>
      ) : (
        <Link href={offer.href} className={btn} data-gate-cta="trial-link" data-track="trial_cta_clicked" data-source={source}>
          {label}
        </Link>
      )}
      {showPlans && offer.mode !== "paid" && (
        <Link href={offer.plansHref} className={plansClassName} data-gate-cta="plans">
          {t.seePlans}
        </Link>
      )}
    </span>
  );
}
