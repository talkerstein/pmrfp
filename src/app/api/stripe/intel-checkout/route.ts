import { NextResponse } from "next/server";
import { getSession } from "@/lib/access/access";
import { getStripe, SITE_URL } from "@/lib/stripe/server";
import { getVisitorCountry } from "@/lib/visitor-geo.server";
import { INTEL_PRODUCT, intelCheckoutEnabled, intelStripePrice, parseIntelInterval } from "@/lib/intel/pricing";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";

/**
 * POST (plain HTML form on /intel pages): start an Award Intelligence
 * subscription in Stripe Checkout, then 303 to Stripe. Same shape as
 * /api/stripe/checkout (subscription mode, org + user in metadata), plus
 * metadata.product = INTEL_PRODUCT so the webhook writes intel_access and
 * never the org's Trade Pro row. The price comes from the env var for the
 * company's own country (CAD for Canada, USD for the U.S.); nothing in the
 * form can change it. Any problem lands back on /intel?checkout=<reason>.
 */
const safeNext = (v: FormDataEntryValue | null | undefined) => {
  const s = typeof v === "string" ? v : "";
  return /^\/intel(\/[a-z0-9\-/]*)?(\?[a-z0-9=&%\-_.]*)?$/i.test(s) ? s : "/intel";
};

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const lang: Locale = isEnabledLocale(form?.get("lang")) ? (form!.get("lang") as Locale) : DEFAULT_LOCALE;
  const next = safeNext(form?.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(localizePath(path, lang), SITE_URL), 303);
  const back = (reason: string) => to(`/intel?checkout=${reason}`);

  const limited = await checkRateLimit(request, "checkout");
  if (limited) return rateLimitResponse(limited);
  if (!process.env.STRIPE_SECRET_KEY || !intelCheckoutEnabled()) return back("unavailable");

  const session = await getSession();
  if (!session) return to(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!session.organization) return back("org");
  if (session.hasIntelAccess) return to(next);

  const interval = parseIntelInterval(form?.get("interval"));
  const { country } = await getVisitorCountry({ session });
  const price = intelStripePrice(interval, country);
  if (!price) return back("unavailable");

  const metadata = {
    product: INTEL_PRODUCT,
    organization_id: session.organization.id,
    user_id: session.userId,
    interval,
    country,
  };
  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: session.profile.email,
      success_url: `${SITE_URL}${localizePath("/intel?checkout=success", lang)}`,
      cancel_url: `${SITE_URL}${localizePath(next, lang)}`,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
    });
    await trackEvent(EVENT.CHECKOUT_STARTED, { plan: "intel", interval });
    if (!checkout.url) return back("error");
    return NextResponse.redirect(checkout.url, 303);
  } catch (err) {
    console.error("[intel checkout] failed", err instanceof Error ? err.message : err);
    return back("error");
  }
}
