import Link from "@/i18n/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PRICING } from "@/lib/site";
import { signUpHrefForPlan } from "@/lib/billing/plan-intent";
import { getT } from "@/i18n/server";
import { fmt } from "@/i18n/format";

/** Shown to visitors / unpaid trades in place of full RFP details (§9.2). */
export function LockedContentPanel({ signedIn }: { signedIn?: boolean }) {
  const t = getT("shared").locked;
  // Only mention the monthly option when Stripe has it configured — otherwise
  // we'd promise a price the checkout API will refuse.
  const monthlyEnabled = Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY);
  return (
    <div className="relative overflow-hidden rounded-xl border border-teal-200 bg-teal-50/60 p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
        <Lock className="size-6" />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-foreground">
        {t.title}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {t.body}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={signedIn ? "/dashboard/billing?plan=pro&interval=annual" : signUpHrefForPlan("pro")}
          className={buttonVariants({ size: "lg" })}
        >
          {signedIn ? t.activate : t.join}
        </Link>
        <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "outline" })}>
          {t.pricing}
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {monthlyEnabled
          ? fmt(t.priceMonthly, { monthly: PRICING.proMonthly, annual: PRICING.proAnnual })
          : fmt(t.priceAnnual, { annual: PRICING.proAnnual })}
      </p>
    </div>
  );
}
