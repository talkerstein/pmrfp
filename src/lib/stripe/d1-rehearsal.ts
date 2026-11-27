import type Stripe from "stripe";
import { D1ApiError, UUID } from "@/lib/d1/contracts";
import { gatewayEndpoint } from "@/lib/d1/transport";
import { FEATURED_PRICE, FEATURED_PRODUCT } from "@/lib/marketplace/feature";
import { FOUNDING, FOUNDING_PRODUCT } from "@/lib/founding/config";
import { INTEL_PRODUCT, intelPriceInfo } from "@/lib/intel/pricing";
import { intelStatusFromStripe } from "@/lib/entitlement/intel";
import { SPOTLIGHT_PRODUCT, spotlightPrice } from "@/lib/spotlight/config";
import { d1LegacySeoPrice, d1SubscriptionPlan } from "./d1-prices";

/** Sandbox Stripe events delivered through the fixture-only billing Worker. */
export async function rehearseD1TradeCheckout(
  stripe: Stripe,
  body: string,
  signature: string,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
) {
  return deliverD1Billing(stripe, body, signature, { env, fetcher, live: false });
}

export async function deliverD1Billing(
  stripe: Stripe, body: string, signature: string,
  { live, env = process.env, fetcher = fetch }: {
    live: boolean; env?: Record<string, string | undefined>; fetcher?: typeof fetch;
  },
) {
  const keyPattern = live ? /^(rk|sk)_live_/ : /^(rk|sk)_test_/;
  if (!keyPattern.test(env.STRIPE_SECRET_KEY ?? "") || !env.STRIPE_WEBHOOK_SECRET) {
    throw new D1ApiError(503, "billing_configuration_unavailable");
  }

  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET); }
  catch { throw new D1ApiError(400, "invalid_signature"); }
  if (event.livemode !== live) throw new D1ApiError(400, "incorrect_stripe_mode");

  if (live && event.type === "checkout.session.expired") {
    return writeBilling("/v1/billing/expired-checkout", { eventId: event.id }, env, fetcher);
  }

  const session = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded"
    ? event.data.object : null;
  if (live && event.type === "checkout.session.completed" && session?.payment_status === "unpaid") {
    return { received: true, applied: false, duplicate: false };
  }
  const oneTimeSession = session;
  if (live && oneTimeSession?.mode === "payment" && oneTimeSession.metadata?.product === SPOTLIGHT_PRODUCT) {
    const market = oneTimeSession.metadata.market;
    if ((market !== "CA" && market !== "US") || oneTimeSession.payment_status !== "paid" ||
        !/^cs_live_[A-Za-z0-9]{1,128}$/.test(oneTimeSession.id)) {
      throw new D1ApiError(503, "spotlight_checkout_unverified");
    }
    const { amount, currency } = spotlightPrice(market);
    const items = await stripe.checkout.sessions.listLineItems(oneTimeSession.id, { limit: 2 });
    const line = items.data[0];
    if (items.has_more || items.data.length !== 1 || line.quantity !== 1 || line.price?.currency !== currency ||
        line.price.unit_amount !== amount * 100 || line.amount_discount !== 0) {
      throw new D1ApiError(503, "spotlight_price_mismatch");
    }
    return writeBilling("/v1/billing/spotlight-checkout", { eventId: event.id, checkoutId: oneTimeSession.id }, env, fetcher, async receipt => {
      if (!receipt.applied) return;
      const { sendSpotlightCheckoutEmails } = await import("@/lib/spotlight/delivery");
      await sendSpotlightCheckoutEmails(oneTimeSession);
    });
  }
  if (live && oneTimeSession?.mode === "payment" && oneTimeSession.metadata?.product === FOUNDING_PRODUCT) {
    const { organization_id: organizationId, user_id: userId } = oneTimeSession.metadata;
    if (oneTimeSession.payment_status !== "paid" || !organizationId || !UUID.test(organizationId) ||
        !userId || !UUID.test(userId) || !/^cs_live_[A-Za-z0-9]{1,128}$/.test(oneTimeSession.id)) {
      throw new D1ApiError(503, "founding_checkout_unverified");
    }
    const items = await stripe.checkout.sessions.listLineItems(oneTimeSession.id, { limit: 2 });
    const line = items.data[0];
    const currency = line?.price?.currency;
    const amount = currency === "cad" ? FOUNDING.priceCad : currency === "usd" ? FOUNDING.priceUsd : null;
    if (items.has_more || items.data.length !== 1 || line.quantity !== 1 || !currency || !amount ||
        line.price?.unit_amount !== amount * 100 || line.amount_discount !== 0) {
      throw new D1ApiError(503, "founding_price_mismatch");
    }
    const customerId = typeof oneTimeSession.customer === "string" ? oneTimeSession.customer : oneTimeSession.customer?.id ?? null;
    return writeBilling("/v1/billing/founding-checkout", {
      eventId: event.id, checkoutId: oneTimeSession.id, organizationId, userId, customerId,
      amount, currency: currency.toUpperCase(),
    }, env, fetcher, async (receipt) => {
      if (receipt.duplicate || (!receipt.applied && receipt.secondPurchase !== true)) return;
      const { sendFoundingCheckoutUpdates } = await import("@/lib/founding/delivery");
      const previous = receipt.previousSubscription;
      await sendFoundingCheckoutUpdates(stripe, oneTimeSession, organizationId, {
        duplicate: receipt.secondPurchase === true,
        previousStripeSubscriptionId: typeof previous === "string" && /^sub_[A-Za-z0-9]{1,100}$/.test(previous) ? previous : null,
        oversold: receipt.oversold === true,
        sold: typeof receipt.sold === "number" && Number.isSafeInteger(receipt.sold) ? receipt.sold : null,
      });
    });
  }
  if (live && oneTimeSession?.mode === "payment" && oneTimeSession.metadata?.product === FEATURED_PRODUCT) {
    const { listing_id: listingId, user_id: userId } = oneTimeSession.metadata;
    if (!/^cs_live_[A-Za-z0-9]{1,128}$/.test(oneTimeSession.id) ||
        !listingId || !UUID.test(listingId) || !userId || !UUID.test(userId)) {
      throw new D1ApiError(503, "marketplace_checkout_unverified");
    }
    if (oneTimeSession.payment_status !== "paid") throw new D1ApiError(503, "marketplace_checkout_unverified");
    // Validate the original price independently of the payer's presentment currency.
    const items = await stripe.checkout.sessions.listLineItems(oneTimeSession.id, { limit: 2 });
    const line = items.data[0];
    const currency = line?.price?.currency;
    const amount = currency === "cad" ? FEATURED_PRICE.CAD : currency === "usd" ? FEATURED_PRICE.USD : null;
    if (items.has_more || items.data.length !== 1 || line.quantity !== 1 || !amount ||
        line.price?.unit_amount !== amount * 100 ||
        line.amount_discount !== 0) {
      throw new D1ApiError(503, "marketplace_price_mismatch");
    }
    return writeBilling("/v1/billing/marketplace-feature", {
      eventId: event.id, checkoutId: oneTimeSession.id, listingId, userId,
    }, env, fetcher);
  }
  let subscriptionId: string | null = null;
  if (session) {
    if (session.mode !== "subscription" || (session.payment_status !== "paid" &&
        !(live && session.metadata?.product === INTEL_PRODUCT && session.payment_status === "no_payment_required"))) {
      throw new D1ApiError(live ? 503 : 400, "unsupported_paid_checkout");
    }
    subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted") {
    subscriptionId = event.data.object.id;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const field = event.data.object.parent?.subscription_details?.subscription;
    subscriptionId = typeof field === "string" ? field : field?.id ?? null;
  } else {
    throw new D1ApiError(live ? 503 : 400, "unsupported_billing_event");
  }
  if (!subscriptionId) throw new D1ApiError(400, "invalid_subscription_event");

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const item = sub.items.data[0];
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const organizationId = sub.metadata?.organization_id ?? "";
  const userId = sub.metadata?.user_id ?? "";
  if (live && (sub.metadata?.product === INTEL_PRODUCT || session?.metadata?.product === INTEL_PRODUCT)) {
    const info = intelPriceInfo(item?.price.id, env);
    if (sub.id !== subscriptionId || !sub.livemode || sub.metadata?.product !== INTEL_PRODUCT || !info ||
        !UUID.test(organizationId) || !UUID.test(userId) || sub.items.data.length !== 1 || !item ||
        item.price.currency !== info.currency.toLowerCase() || item.price.recurring?.interval !== (info.interval === "annual" ? "year" : "month") ||
        !Number.isSafeInteger(item.current_period_end) || item.price.unit_amount == null ||
        (session && (session.metadata?.product !== INTEL_PRODUCT || session.metadata.organization_id !== organizationId ||
          session.metadata.user_id !== userId || session.metadata.interval !== info.interval ||
          (typeof session.customer === "string" ? session.customer : session.customer?.id) !== customerId ||
          !["active", "trialing"].includes(sub.status)))) {
      throw new D1ApiError(503, "intel_subscription_mismatch");
    }
    return writeBilling("/v1/billing/intel-subscription", {
      eventId: event.id, eventCreated: event.created, organizationId, userId, subscriptionId, customerId,
      priceId: item.price.id, periodEnd: new Date(item.current_period_end * 1000).toISOString(),
      status: intelStatusFromStripe(sub.status), interval: info.interval, currency: info.currency,
      cents: item.price.unit_amount, cancelAtPeriodEnd: sub.cancel_at_period_end,
    }, env, fetcher, session ? async (receipt) => {
      if (!receipt.applied || receipt.duplicate) return;
      const { sendAdminNewSale } = await import("@/lib/email/send");
      await sendAdminNewSale({
        company: session.customer_details?.name ?? null,
        email: session.customer_details?.email ?? "(no email on file)",
        plan: "Award Intelligence",
        interval: info.interval,
        amountFormatted: session.amount_total == null ? "—" : `$${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? info.currency).toUpperCase()}`,
      });
    } : undefined);
  }
  const plan = item && d1SubscriptionPlan(item.price.id, env);
  const legacySeo = !session && live && item && d1LegacySeoPrice(item.price.id, env);
  if (sub.id !== subscriptionId || sub.livemode !== live || !UUID.test(organizationId) || !UUID.test(userId) ||
      sub.items.data.length !== 1 || !item || (!plan && !legacySeo) || (!live && plan?.tier !== "pro") ||
      item.price.currency !== "cad" || !Number.isSafeInteger(item.current_period_end)) {
    throw new D1ApiError(live ? 503 : 400, "subscription_mismatch");
  }
  if (session) {
    const checkoutCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!plan || sub.status !== "active" || customerId !== checkoutCustomer || session.metadata?.plan !== plan.tier ||
        session.metadata?.organization_id !== organizationId || session.metadata?.user_id !== userId ||
        item.current_period_end * 1000 <= Date.now()) throw new D1ApiError(400, "subscription_mismatch");
  }

  return writeBilling(
    session ? "/v1/billing/paid-trade-checkout" :
      live ? "/v1/billing/subscription-state" : "/v1/billing/rehearsal/subscription-state",
    { eventId: event.id, organizationId, userId, subscriptionId, customerId,
      priceId: item.price.id, periodEnd: new Date(item.current_period_end * 1000).toISOString(),
      ...(!session && { observedEventTime: event.created, status: sub.status,
        ...(legacySeo && { unitAmount: item.price.unit_amount }),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        suspendOrganization: event.type === "customer.subscription.deleted" && sub.status === "canceled" }) },
    env, fetcher, live ? async (receipt) => {
      if (!receipt.applied || receipt.duplicate) return;
      const { sendSubscriptionCheckoutUpdates, syncSubscriptionContact } = await import("./subscription-delivery");
      if (session) {
        await sendSubscriptionCheckoutUpdates(session, sub);
      } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" ||
          event.type === "customer.subscription.deleted") {
        const org = receipt.organization as { email?: unknown; name?: unknown } | undefined;
        if (typeof org?.email === "string") {
          await syncSubscriptionContact(organizationId, sub.status, { email: org.email, name: typeof org.name === "string" ? org.name : null });
        }
      }
    } : undefined,
  );
}

async function writeBilling(
  path: string, payload: object, env: Record<string, string | undefined>, fetcher: typeof fetch,
  afterReceipt?: (receipt: Record<string, unknown>) => Promise<void>,
) {
  const secret = env.PMRFP_STRIPE_BILLING_GATEWAY_SECRET ?? "";
  const onVps = env.PMRFP_VPS_CUSTOMER_ENGINE === "d1";
  const url = onVps ? new URL(path, env.PMRFP_CUSTOMER_AUTH_ORIGIN) :
    gatewayEndpoint({ url: env.PMRFP_STRIPE_BILLING_GATEWAY_URL ?? "", secret }, path);
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", "x-pmrfp-stripe-gateway": secret },
    body: JSON.stringify(payload),
    redirect: "error" as const,
    cache: "no-store" as const,
    signal: AbortSignal.timeout(10000),
  };
  const response = onVps
    ? await (await import("../d1/vps-customer")).callVpsCustomer(new Request(url, init), env, fetcher)
    : await fetcher(url, init);
  if (!response.ok) throw new D1ApiError(503, "billing_write_failed");
  const receipt = await response.json();
  if (typeof receipt?.applied !== "boolean" || typeof receipt.duplicate !== "boolean") {
    throw new D1ApiError(503, "invalid_billing_receipt");
  }
  if (afterReceipt) await afterReceipt(receipt);
  return { received: true, applied: receipt.applied, duplicate: receipt.duplicate };
}
