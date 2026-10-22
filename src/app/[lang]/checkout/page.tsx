import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/access/access";
import { setLangFrom } from "@/i18n/server";
import { localizePath } from "@/i18n/config";
import { createTradeCheckout } from "@/lib/billing/checkout";
import { decideCheckout, parseCheckoutAsk } from "@/lib/billing/checkout-flow";
import { isStripeConfigured } from "@/lib/stripe/server";

// A redirect, never a page: nothing here is worth indexing.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Every "Upgrade" link points here (/checkout?plan=pro&interval=annual).
 * Signed out: sign-up for that plan (it comes back here after the emailed
 * link). Not onboarded: onboarding, then here. Ready: straight to Stripe.
 * See lib/billing/checkout-flow for the rules.
 */
export default async function CheckoutPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
  params: Promise<object>;
}) {
  const lang = await setLangFrom(params);
  const sp = await searchParams;
  const ask = parseCheckoutAsk(sp.plan, sp.interval);
  const session = await getSession().catch(() => null);

  const decision = decideCheckout(ask, {
    signedIn: Boolean(session),
    onboarded: Boolean(session?.profile.onboarding_completed),
    role: session?.profile.primary_role ?? null,
    hasOrganization: Boolean(session?.organization),
    paid: Boolean(session?.paid),
    stripeConfigured: isStripeConfigured(),
  });
  if (decision.go === "redirect") redirect(localizePath(decision.to, lang));

  const made = await createTradeCheckout(session, ask!, "link");
  if (!made.ok) {
    // Say so on the billing page instead of dropping them on a blank error.
    redirect(localizePath(`/dashboard/billing?plan=${ask!.plan}&interval=${ask!.interval}&checkout=failed`, lang));
  }
  redirect(made.url);
}
