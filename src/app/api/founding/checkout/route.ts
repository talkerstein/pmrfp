import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { EVENT, trackEvent } from "@/lib/analytics";
import { FOUNDING_PATH, FOUNDING_PRODUCT, checkoutRefusal, foundingPrice, parseMarket, type FoundingMarket } from "@/lib/founding/config";
import { countLifetimeOrgs, isOrgLifetime } from "@/lib/founding/server";

/**
 * Starts the one-time Founding 500 checkout (lifetime Trade Pro). Requires a
 * signed-in trade/supplier org; refuses when the org is already lifetime or
 * the 500 cap is reached (fresh, uncached count).
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "checkout");
  if (limited) return rateLimitResponse(limited);
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Payments aren't available right now. Please email info@pmrfp.com." }, { status: 503 });
  }

  const session = await getSession();
  const body = await request.json().catch(() => ({}));
  const market: FoundingMarket = parseMarket(body?.market);

  let sold: number;
  try {
    sold = await countLifetimeOrgs();
  } catch {
    // Fail closed: never sell past the cap because the count couldn't be read.
    return NextResponse.json({ error: "Couldn't check availability. Please try again shortly." }, { status: 503 });
  }
  const refusal = checkoutRefusal({
    signedIn: Boolean(session),
    organizationType: session?.organization?.organization_type,
    alreadyLifetime: session?.organization ? await isOrgLifetime(session.organization.id) : false,
    sold,
  });
  if (refusal) {
    const signUp = `/sign-up?role=trade&next=${encodeURIComponent(FOUNDING_PATH)}`;
    const map = {
      signin: { status: 401, error: "Sign up or sign in as a trade first.", redirect: signUp },
      org: { status: 400, error: "Complete your company profile first.", redirect: `/onboarding?next=${encodeURIComponent(FOUNDING_PATH)}` },
      role: { status: 400, error: "The Founding 500 offer is for trade and supplier accounts." },
      already: { status: 409, error: "Your organization is already a Founding member." },
      soldout: { status: 410, error: "All 500 Founding spots are taken." },
    } as const;
    const r = map[refusal];
    return NextResponse.json({ error: r.error, reason: refusal, redirect: "redirect" in r ? r.redirect : undefined }, { status: r.status });
  }

  const org = session!.organization!;
  const metadata = { product: FOUNDING_PRODUCT, organization_id: org.id, user_id: session!.userId, market };
  const stripe = getStripe();
  const make = (m: FoundingMarket) => {
    const { amount, currency } = foundingPrice(m);
    return stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: session!.profile.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount * 100,
            product_data: {
              name: "PMRFP Founding 500: lifetime Trade Pro",
              description:
                "One payment, Trade Pro for one organization for as long as PMRFP operates Trade Pro. 30-day refund window. Terms: pmrfp.com/terms#founding-500",
            },
          },
        },
      ],
      metadata: { ...metadata, market: m },
      payment_intent_data: { description: "PMRFP Founding 500 lifetime Trade Pro", metadata: { ...metadata, market: m } },
      success_url: `${SITE_URL}/dashboard/billing?founding=1`,
      cancel_url: `${SITE_URL}${FOUNDING_PATH}`,
    });
  };

  try {
    let cs;
    try {
      cs = await make(market);
    } catch (err) {
      // A U.S. buyer can still pay in CAD if USD isn't enabled on the account.
      if (market === "US") cs = await make("CA");
      else throw err;
    }
    await trackEvent(EVENT.CHECKOUT_STARTED, { plan: "founding_lifetime", market });
    return NextResponse.json({ url: cs.url });
  } catch (err) {
    console.error("[founding checkout]", err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again or email info@pmrfp.com." }, { status: 500 });
  }
}
