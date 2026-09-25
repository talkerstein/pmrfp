import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, isStripeConfigured, realtorPriceId, SITE_URL } from "@/lib/stripe/server";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

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
    body?.plan === "featured"
      ? "featured"
      : body?.plan === "seo"
        ? "seo"
        : body?.plan === "realtor"
          ? "realtor"
          : "pro";
  // Featured and Realtor Pro are annual-only. Pro and SEO support monthly/annual.
  const interval: "monthly" | "annual" =
    plan !== "featured" && plan !== "realtor" && body?.interval === "monthly" ? "monthly" : "annual";

  let price: string | undefined;
  if (plan === "realtor") {
    // Only for buyers (realtors, property managers): it's their trusted-trades page.
    if (session.organization.organization_type === "trade_company" || session.organization.organization_type === "supplier") {
      return NextResponse.json({ error: "Realtor Pro is for realtors and property managers." }, { status: 400 });
    }
    price = (await realtorPriceId()) ?? undefined;
  } else if (plan === "featured") {
    price = process.env.STRIPE_PRICE_FEATURED_ANNUAL;
  } else if (plan === "seo") {
    // Directory-only tier — gated on the env var like every other price, so
    // it simply reports "not available" until the Stripe price exists.
    price =
      interval === "monthly"
        ? process.env.STRIPE_PRICE_SEO_MONTHLY
        : process.env.STRIPE_PRICE_SEO_ANNUAL;
  } else if (interval === "monthly") {
    price = process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY;
  } else {
    price = process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL;
  }
  if (!price) {
    return NextResponse.json({ error: "That plan isn't available yet." }, { status: 400 });
  }

  // The SEO tier is directory-only, and that is enforced by subscriptions.tier
  // (migration 20260819000001). If the column doesn't exist yet, every
  // subscription is treated as Pro-equivalent — so selling SEO now would hand
  // a $12/mo buyer the $249 RFP product. Refuse until the migration lands.
  if (plan === "seo") {
    const probe = isServiceConfigured()
      ? await createServiceClient().from("subscriptions").select("tier").limit(1)
      : { error: new Error("service client not configured") };
    if (probe.error) {
      return NextResponse.json({ error: "That plan isn't available yet." }, { status: 400 });
    }
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
    success_url: plan === "realtor" ? `${SITE_URL}/pm-dashboard/saved-vendors?upgraded=1` : `${SITE_URL}/dashboard?welcome=1`,
    cancel_url: plan === "realtor" ? `${SITE_URL}/pm-dashboard/saved-vendors` : `${SITE_URL}/pricing`,
    allow_promotion_codes: true,
    metadata,
    subscription_data: { metadata },
  });

  await trackEvent(EVENT.CHECKOUT_STARTED, { plan, interval });
  return NextResponse.json({ url: checkout.url });
}
