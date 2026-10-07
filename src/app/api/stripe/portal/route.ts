import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured, SITE_URL } from "@/lib/stripe/server";
import { isLifetimeSubscriptionId } from "@/lib/founding/config";

export async function POST() {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.organization) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id,stripe_subscription_id")
    .eq("organization_id", session.organization.id)
    .maybeSingle<{ stripe_customer_id: string | null; stripe_subscription_id: string | null }>();

  if (isLifetimeSubscriptionId(sub?.stripe_subscription_id)) {
    return NextResponse.json(
      { error: "Your organization has lifetime Trade Pro (Founding member). There is no subscription to manage. For receipts or refunds, email info@pmrfp.com." },
      { status: 400 },
    );
  }

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet. Activate Trade Pro first." }, { status: 400 });
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${SITE_URL}/dashboard/billing`,
  });
  return NextResponse.json({ url: portal.url });
}
