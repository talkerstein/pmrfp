import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";

/**
 * POST (form on /intel): open the Stripe billing portal for the company's
 * Award Intelligence subscription (its own Stripe customer, read from
 * intel_access as the member). Admin grants have no Stripe customer.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const lang: Locale = isEnabledLocale(form?.get("lang")) ? (form!.get("lang") as Locale) : DEFAULT_LOCALE;
  const back = (reason: string) => NextResponse.redirect(new URL(localizePath(`/intel?checkout=${reason}`, lang), SITE_URL), 303);
  if (!process.env.STRIPE_SECRET_KEY) return back("portal");
  const session = await getSession();
  if (!session?.organization) return NextResponse.redirect(new URL(localizePath("/sign-in?next=/intel", lang), SITE_URL), 303);

  const { data } = await (await createClient())
    .from("intel_access")
    .select("stripe_customer_id")
    .eq("organization_id", session.organization.id)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (!data?.stripe_customer_id) return back("portal");
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${SITE_URL}${localizePath("/intel", lang)}`,
    });
    return NextResponse.redirect(portal.url, 303);
  } catch (err) {
    console.error("[intel portal] failed", err instanceof Error ? err.message : err);
    return back("portal");
  }
}
