import { NextResponse } from "next/server";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { FEATURED_DAYS, FEATURED_PRODUCT, featuredPrice, type Currency } from "@/lib/marketplace/rules";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * Starts a one-time Stripe Checkout to feature one marketplace listing for
 * FEATURED_DAYS days. Inline price_data (no pre-created price); the webhook
 * reads metadata.product + listing_id and sets featured_until.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "checkout");
  if (limited) return rateLimitResponse(limited);
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  if (!listingId) return NextResponse.json({ error: "notFound" }, { status: 400 });

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id,slug,title,user_id,status,currency")
    .eq("id", listingId)
    .maybeSingle<{ id: string; slug: string; title: string; user_id: string; status: string; currency: Currency }>();
  if (!listing || listing.user_id !== session.userId || listing.status !== "active") {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }

  const stripe = getStripe();
  const make = (currency: Currency) => {
    const price = featuredPrice(currency);
    return stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: session.profile.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: price.currency,
            unit_amount: price.amount * 100,
            product_data: {
              name: `Featured marketplace listing (${FEATURED_DAYS} days)`,
              description: `Pins "${listing.title.slice(0, 80)}" to the top of the PMRFP Marketplace for ${FEATURED_DAYS} days. No sale guarantee.`,
            },
          },
        },
      ],
      metadata: { product: FEATURED_PRODUCT, listing_id: listing.id, user_id: session.userId },
      payment_intent_data: { description: "PMRFP Marketplace featured listing", metadata: { product: FEATURED_PRODUCT, listing_id: listing.id } },
      success_url: `${SITE_URL}/dashboard/listings?featured=1`,
      cancel_url: `${SITE_URL}/dashboard/listings`,
    });
  };

  try {
    let cs;
    try {
      cs = await make(listing.currency);
    } catch (err) {
      // USD not enabled on the account: fall back to CAD rather than fail.
      if (listing.currency === "USD") cs = await make("CAD");
      else throw err;
    }
    await trackEvent(EVENT.CHECKOUT_STARTED, { plan: "marketplace_featured" });
    return NextResponse.json({ url: cs.url });
  } catch (err) {
    console.error("[marketplace featured checkout]", err);
    return NextResponse.json({ error: "checkout" }, { status: 500 });
  }
}
