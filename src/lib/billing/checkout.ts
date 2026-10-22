import { getStripe, isStripeConfigured, SITE_URL } from "@/lib/stripe/server";
import { EVENT, trackEvent } from "@/lib/analytics";
import type { SessionContext } from "@/lib/access/access";
import type { CheckoutAsk, CheckoutFailure } from "@/lib/billing/checkout-flow";

/**
 * Creates the Stripe Checkout page for Trade Pro or Featured, for a signed-in
 * member with a company. Shared by the POST route behind the billing buttons
 * and by the /checkout page (an upgrade link in one move).
 *
 * `checkout_started` is recorded when Stripe has made the page, `checkout_failed`
 * (with the reason) when it could not be made: a failure used to leave no
 * trace at all, which is how three upgrade clicks produced no checkout and
 * no explanation.
 */
export async function createTradeCheckout(
  session: SessionContext | null,
  ask: CheckoutAsk,
  where: "api" | "link",
): Promise<{ ok: true; url: string } | { ok: false; reason: CheckoutFailure }> {
  const { plan, interval } = ask;
  const fail = async (reason: CheckoutFailure) => {
    await trackEvent(EVENT.CHECKOUT_FAILED, { plan, interval, reason, where }, session ? { userId: session.userId, role: session.profile.primary_role } : {});
    return { ok: false as const, reason };
  };

  if (!isStripeConfigured()) return fail("not_configured");
  if (!session) return fail("no_session");
  if (!session.organization) return fail("no_company");

  // Featured is annual-only. Pro supports monthly/annual.
  const price =
    plan === "featured"
      ? process.env.STRIPE_PRICE_FEATURED_ANNUAL
      : interval === "monthly"
        ? process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY
        : process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL;
  if (!price) return fail("plan_unavailable");

  const metadata = {
    organization_id: session.organization.id,
    user_id: session.userId,
    plan,
    interval: plan === "featured" ? "annual" : interval,
  };

  let url: string | null = null;
  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: session.profile.email,
      success_url: `${SITE_URL}/dashboard?welcome=1`,
      cancel_url: `${SITE_URL}/pricing`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
    });
    url = checkout.url;
  } catch (e) {
    console.error("[checkout]", e instanceof Error ? e.message : e);
    return fail("stripe_error");
  }
  if (!url) return fail("stripe_error");

  await trackEvent(EVENT.CHECKOUT_STARTED, { plan, interval: metadata.interval, where }, { userId: session.userId, role: session.profile.primary_role });
  return { ok: true, url };
}
