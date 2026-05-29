import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, isStripeConfigured, SITE_URL } from "@/lib/stripe/server";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!session.organization) {
    return NextResponse.json({ error: "Complete your company profile first." }, { status: 400 });
  }

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_TRADE_PRO_ANNUAL!, quantity: 1 }],
    customer_email: session.profile.email,
    success_url: `${SITE_URL}/dashboard?welcome=1`,
    cancel_url: `${SITE_URL}/pricing`,
    allow_promotion_codes: true,
    metadata: { organization_id: session.organization.id, user_id: session.userId },
    subscription_data: {
      metadata: { organization_id: session.organization.id, user_id: session.userId },
    },
  });

  return NextResponse.json({ url: checkout.url });
}
