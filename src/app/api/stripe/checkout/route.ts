import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, isStripeConfigured, realtorPriceId, SITE_URL } from "@/lib/stripe/server";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createTradeCheckout } from "@/lib/billing/checkout";
import { checkoutFailureMessage } from "@/lib/billing/checkout-flow";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "checkout");
  if (limited) return rateLimitResponse(limited);

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!session.organization) {
    return NextResponse.json({ error: "Complete your company profile first." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  // SEO Listing is retired: a stale "seo" plan (old link, cached page) is sold
  // Trade Pro instead, never the retired price. Existing SEO subscribers are
  // untouched: their Stripe subscription keeps renewing and isSeoPriceId()
  // still maps it to tier "seo" in the webhook sync (grandfathered).
  const plan =
    body?.plan === "featured"
      ? "featured"
      : body?.plan === "realtor"
        ? "realtor"
        : "pro";
  // Featured and Realtor Pro are annual-only. Pro supports monthly/annual.
  const interval: "monthly" | "annual" =
    plan !== "featured" && plan !== "realtor" && body?.interval === "monthly" ? "monthly" : "annual";

  if (plan !== "realtor") {
    // Trade Pro and Featured: shared with the /checkout page (lib/billing/checkout).
    const made = await createTradeCheckout(session, { plan, interval }, "api");
    if (!made.ok) {
      const { status, error } = checkoutFailureMessage(made.reason);
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ url: made.url });
  }

  // Realtor Pro: only for buyers (realtors, property managers): it's their trusted-trades page.
  if (session.organization.organization_type === "trade_company" || session.organization.organization_type === "supplier") {
    return NextResponse.json({ error: "Realtor Pro is for realtors and property managers." }, { status: 400 });
  }
  const price = (await realtorPriceId()) ?? undefined;
  if (!price) {
    return NextResponse.json({ error: "That plan isn't available yet." }, { status: 400 });
  }

  const metadata = {
    organization_id: session.organization.id,
    user_id: session.userId,
    plan,
    interval,
  };

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer_email: session.profile.email,
    success_url: `${SITE_URL}/pm-dashboard/saved-vendors?upgraded=1`,
    cancel_url: `${SITE_URL}/pm-dashboard/saved-vendors`,
    allow_promotion_codes: true,
    metadata,
    subscription_data: { metadata },
  });

  await trackEvent(EVENT.CHECKOUT_STARTED, { plan, interval }, { userId: session.userId, role: session.profile.primary_role });
  return NextResponse.json({ url: checkout.url });
}
