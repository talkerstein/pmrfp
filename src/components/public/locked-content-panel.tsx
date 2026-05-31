import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PRICING } from "@/lib/site";

/** Shown to visitors / unpaid trades in place of full RFP details (§9.2). */
export function LockedContentPanel({ signedIn }: { signedIn?: boolean }) {
  // Only mention the monthly option when Stripe has it configured — otherwise
  // we'd promise a price the checkout API will refuse.
  const monthlyEnabled = Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY);
  return (
    <div className="relative overflow-hidden rounded-xl border border-teal-200 bg-teal-50/60 p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700">
        <Lock className="size-6" />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-foreground">
        Subscribe to view the full opportunity
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Full scope, requirements, budget, submission instructions, documents, and contact details
        are available to PMRFP Trade Pro members.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href={signedIn ? "/dashboard/billing" : "/sign-up"} className={buttonVariants({ size: "lg" })}>
          {signedIn ? "Activate Trade Pro" : "Join as a Trade Company"}
        </Link>
        <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "outline" })}>
          See pricing
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {monthlyEnabled
          ? `From $${PRICING.proMonthly}/mo or $${PRICING.proAnnual}/yr · cancel any time`
          : `$${PRICING.proAnnual}/yr · cancel any time`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{PRICING.earlyBirdNote}</p>
    </div>
  );
}
