import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, isStripeConfigured, SITE_URL } from "@/lib/stripe/server";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
  const plan =
    body?.plan === "featured" ? "featured" : body?.plan === "seo" ? "seo" : "pro";
  // Featured and SEO are annual-only. Pro supports both intervals.
  const interval: "monthly" | "annual" =
    plan === "pro" && body?.interval === "monthly" ? "monthly" : "annual";

  let price: string | undefined;
  if (plan === "featured") {
    price = process.env.STRIPE_PRICE_FEATURED_ANNUAL;
  } else if (plan === "seo") {
    // $99 directory-only tier — gated on the env var like every other price,
    // so it simply reports "not available" until the Stripe price exists.
    price = process.env.STRIPE_PRICE_SEO_ANNUAL;
  } else if (interval === "monthly") {
    price = process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY;
  } else {
    price = process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL;
  }
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
    success_url: `${SITE_URL}/dashboard?welcome=1`,
    cancel_url: `${SITE_URL}/pricing`,
    allow_promotion_codes: true,
    metadata,
    subscription_data: { metadata },
  });

  await trackEvent(EVENT.CHECKOUT_STARTED, { plan, interval });
  return NextResponse.json({ url: checkout.url });
}
