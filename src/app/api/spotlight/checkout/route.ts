import { NextResponse } from "next/server";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { SPOTLIGHT_PRODUCT, spotlightPrice, type SpotlightMarket } from "@/lib/spotlight/config";
import { EVENT, trackEvent } from "@/lib/analytics";

/**
 * Starts a Stripe Checkout for one Project Spotlight. No account needed and no
 * pre-created Stripe price: the amount is set here, in the buyer's currency.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "checkout");
  if (limited) return rateLimitResponse(limited);
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payments aren't available right now. Please email info@pmrfp.com." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const market: SpotlightMarket = body?.market === "US" ? "US" : "CA";
  const stripe = getStripe();

  const make = (m: SpotlightMarket) => {
    const { amount, currency } = spotlightPrice(m);
    return stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount * 100,
            product_data: {
              name: "Project Spotlight (one article)",
              description:
                "One reviewed article about a finished project, published permanently on PMRFP and labelled as a sponsored Spotlight. No ranking, traffic or AI-citation guarantees. Full refund if we can't publish it.",
            },
          },
        },
      ],
      custom_fields: [{ key: "company", label: { type: "custom", custom: "Company name" }, type: "text", text: { maximum_length: 120 } }],
      metadata: { product: SPOTLIGHT_PRODUCT, market: m },
      payment_intent_data: { description: "PMRFP Project Spotlight", metadata: { product: SPOTLIGHT_PRODUCT } },
      success_url: `${SITE_URL}/spotlight/submit?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/spotlight`,
    });
  };

  try {
    let session;
    try {
      session = await make(market);
    } catch (err) {
      // A U.S. buyer should still be able to pay if USD isn't enabled on the account.
      if (market === "US") session = await make("CA");
      else throw err;
    }
    await trackEvent(EVENT.CHECKOUT_STARTED, { plan: "spotlight", market });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[spotlight checkout]", err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again or email info@pmrfp.com." }, { status: 500 });
  }
}
