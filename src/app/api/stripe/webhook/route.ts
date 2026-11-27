import { D1ApiError } from "@/lib/d1/contracts";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { deliverD1Billing } from "@/lib/stripe/d1-rehearsal";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscriptionFromStripe } from "@/lib/stripe/server";
import { sendSubscriptionCheckoutUpdates, syncSubscriptionContact } from "@/lib/stripe/subscription-delivery";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminNewSale } from "@/lib/email/send";
import { SPOTLIGHT_PRODUCT } from "@/lib/spotlight/config";
import { sendSpotlightCheckoutEmails } from "@/lib/spotlight/delivery";
import { FEATURED_PRODUCT, nextFeaturedUntil } from "@/lib/marketplace/rules";
import { verifyStripeEvent } from "@/lib/stripe/verify-event";
import { sendFoundingCheckoutUpdates } from "@/lib/founding/delivery";
import { sendAdminFoundingAlert } from "@/lib/email/send";
import { FOUNDING_PRODUCT } from "@/lib/founding/config";
import { grantLifetime, isOrgLifetime } from "@/lib/founding/server";
import { SPONSOR_PRODUCT } from "@/lib/sponsors/pricing";
import { handleSponsorCheckout, syncSponsorSubscription } from "@/lib/sponsors/stripe";
import { INTEL_PRODUCT } from "@/lib/intel/pricing";
import { handleIntelCheckout, syncIntelSubscription } from "@/lib/intel/stripe";
import { EVENT, trackEvent } from "@/lib/analytics";

function hasLiveStripeCredentials() {
  return /^whsec_[A-Za-z0-9_-]{16,160}$/.test(process.env.STRIPE_WEBHOOK_SECRET ?? "") &&
    /^(rk|sk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");
}

export async function GET() {
  if (process.env.PMRFP_VPS_BILLING_RECEIVER !== "enabled") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const smtp = process.env.PMRFP_SMTP_ENABLED === "enabled" && !!process.env.PMRFP_SMTP_PASSWORD &&
    process.env.PMRFP_SMTP_USER === "info@pmrfp.com" && !process.env.PMRFP_SMTP_ALLOWED_RECIPIENT;
  const invoicesOnly = process.env.PMRFP_VPS_BILLING_PHASE === "invoices";
  const notifications = (smtp || !!process.env.RESEND_API_KEY) &&
    !!process.env.GHL_API_KEY && !!process.env.GHL_LOCATION_ID;
  let ready = false;
  if (hasLiveStripeCredentials()) {
    if (process.env.PMRFP_BILLING_BACKEND === "d1-live-recurring") {
      if (notifications && process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1" &&
          process.env.PMRFP_ISOLATED_D1_STAGING !== "enabled" &&
          (process.env.PMRFP_STRIPE_BILLING_GATEWAY_SECRET?.length ?? 0) >= 32 &&
          process.env.PMRFP_CUSTOMER_AUTH_ORIGIN === "https://pmrfp.com" &&
          (process.env.PMRFP_CUSTOMER_AUTH_GATEWAY_SECRET?.length ?? 0) >= 32 &&
          (process.env.PMRFP_CUSTOMER_AUTH_SESSION_SECRET?.length ?? 0) >= 32 &&
          !process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          ready = !!(await vpsAppDatabase().prepare(
            "SELECT 1 FROM _billing_authority WHERE id=1 AND mode='d1-authoritative-v1'",
          ).first());
        } catch { /* Remain unavailable until the VPS can reach the billing database. */ }
      }
    } else {
      ready = isServiceConfigured() && (invoicesOnly || notifications);
    }
  }
  return NextResponse.json({ ready }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}

/**
 * Founding 500 purchase. Never refuses: the cap was checked at checkout, and
 * a race that oversells is still granted (money taken means access granted)
 * with an admin alert. Throws on a failed grant so Stripe retries.
 */
async function handleFoundingCheckout(cs: Stripe.Checkout.Session, stripe: Stripe): Promise<void> {
  if (cs.payment_status !== "paid") return;
  const orgId = cs.metadata?.organization_id;
  const email = cs.customer_details?.email ?? "(no email on file)";
  if (!orgId) {
    await sendAdminFoundingAlert({ reason: "paid checkout without an organization id", organizationId: "(none)", email, sessionId: cs.id });
    return;
  }
  const cents = cs.amount_total;
  const currency = (cs.currency || "cad").toUpperCase();
  const result = await grantLifetime({
    organizationId: orgId,
    userId: cs.metadata?.user_id ?? null,
    checkoutSessionId: cs.id,
    stripeCustomerId: typeof cs.customer === "string" ? cs.customer : (cs.customer?.id ?? null),
    amount: typeof cents === "number" ? cents / 100 : null,
    currency,
  });
  if (!result.granted) {
    await sendAdminFoundingAlert({ reason: `grant failed (${result.error ?? "unknown"}); Stripe will retry`, organizationId: orgId, email, sessionId: cs.id });
    throw new Error(`founding grant failed: ${result.error}`);
  }
  await sendFoundingCheckoutUpdates(stripe, cs, orgId, result);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const billingMode = process.env.PMRFP_BILLING_BACKEND;
  if (billingMode === "d1-rehearsal" || billingMode === "d1-live-recurring") {
    const live = billingMode === "d1-live-recurring";
    const origin = new URL(request.url).origin;
    const host = request.headers.get("host");
    const privateHost = host === "pmrfp-stripe-d1-writer:4322" || host === "pmrfp-stripe-writer:4322" ||
      origin === "http://pmrfp-stripe-d1-writer:4322" || origin === "http://pmrfp-stripe-writer:4322";
    const privateVpsWriter = privateHost &&
      process.env.PMRFP_VPS_BILLING_RECEIVER === "enabled" &&
      process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1";
    if (live && (process.env.PMRFP_ISOLATED_D1_STAGING === "enabled" ||
        (origin !== "https://pmrfp.com" && !privateVpsWriter))) {
      return NextResponse.json({ error: "Live D1 billing is unavailable" }, { status: 503 });
    }
    try {
      return NextResponse.json(await deliverD1Billing(getStripe(), body, sig, { live }));
    } catch (error) {
      return NextResponse.json({ error: error instanceof D1ApiError ? error.code : "d1_billing_failed" },
        { status: error instanceof D1ApiError ? error.status : 503 });
    }
  }
  if (!process.env.STRIPE_SECRET_KEY || !isServiceConfigured()) {
    // Keep Stripe's retry path active if this deployment cannot persist an
    // event or its deduplication record. A 2xx here would lose billing updates.
    return NextResponse.json({ error: "Billing webhook unavailable" }, { status: 503 });
  }

  const vpsReceiver = process.env.PMRFP_VPS_BILLING_RECEIVER === "enabled";
  const stripe = getStripe();
  let verified: Awaited<ReturnType<typeof verifyStripeEvent>>;
  if (vpsReceiver) {
    if (!hasLiveStripeCredentials()) {
      return NextResponse.json({ error: "Billing webhook unavailable" }, { status: 503 });
    }
    try {
      const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
      verified = event.livemode === true ? { event, via: "signature" } : null;
    } catch {
      verified = null;
    }
  } else {
    // The existing receiver can recover an event with its Stripe API key.
    verified = await verifyStripeEvent(stripe, body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  }
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event: Stripe.Event = verified.event;
  if (vpsReceiver && process.env.PMRFP_VPS_BILLING_PHASE === "invoices" &&
      event.type !== "invoice.payment_failed" && event.type !== "checkout.session.expired") {
    return NextResponse.json({ error: "Event is outside the active billing phase" }, { status: 503 });
  }
  if (verified.via === "api") {
    console.warn("[stripe webhook] signature mismatch; verified via API. Update STRIPE_WEBHOOK_SECRET.");
  }

  // Idempotency: Stripe retries on any non-2xx response or timeout. Without
  // this, a slow handler (several sequential awaited email/GHL calls below)
  // that times out gets redelivered, and the customer sees the "you're
  // activated" email twice on day one. Table is service-role only (RLS
  // enabled, no policies); missing table (migration not yet applied)
  // degrades to "process every time" rather than breaking the webhook.
  if (isServiceConfigured()) {
    const svc = createServiceClient();
    const { error: dupErr } = await svc
      .from("stripe_webhook_events")
      .insert({ id: event.id });
    if (dupErr) {
      if (dupErr.code === "23505") {
        // Already processed this exact event — ack without redoing work.
        return NextResponse.json({ received: true, duplicate: true });
      }
      if (vpsReceiver) {
        return NextResponse.json({ error: "Billing receipt unavailable" }, { status: 503 });
      }
      // Any other error (e.g. table doesn't exist pre-migration) — log and
      // fall through to processing; better to risk a duplicate email than
      // to silently drop a real subscription event.
      console.error("[stripe webhook] idempotency check failed:", dupErr.message);
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        // First-party funnel (site_events). Not from the request: this is
        // Stripe calling, so only the buyer's id from the session metadata
        // (the database fills in their role and company country).
        await trackEvent(
          EVENT.CHECKOUT_COMPLETED,
          {
            product: cs.metadata?.product ?? (cs.mode === "subscription" ? "subscription" : cs.mode ?? null),
            plan: cs.metadata?.plan ?? null,
            interval: cs.metadata?.interval ?? null,
            paid: cs.payment_status === "paid",
          },
          { userId: cs.metadata?.user_id ?? null, fromRequest: false },
        );
        // Monthly sponsorship (/advertise): its own subscription, never an org plan.
        if (cs.metadata?.product === SPONSOR_PRODUCT) {
          await handleSponsorCheckout(cs);
          break;
        }
        // Award Intelligence: its own entitlement (intel_access), never the org's Trade Pro row.
        if (cs.metadata?.product === INTEL_PRODUCT) {
          await handleIntelCheckout(cs, stripe);
          break;
        }
        // One-time Project Spotlight purchase: tell the owner, and tell the
        // buyer where to send their article.
        if (cs.mode === "payment" && cs.metadata?.product === SPOTLIGHT_PRODUCT) {
          await sendSpotlightCheckoutEmails(cs);
          break;
        }
        // Founding 500: one-time payment for lifetime Trade Pro.
        if (cs.mode === "payment" && cs.metadata?.product === FOUNDING_PRODUCT) {
          await handleFoundingCheckout(cs, stripe);
          break;
        }
        // One-time Marketplace featured listing: extend featured_until by 14 days.
        if (cs.mode === "payment" && cs.metadata?.product === FEATURED_PRODUCT) {
          const listingId = cs.metadata?.listing_id;
          let title: string | null = null;
          if (listingId && isServiceConfigured() && cs.payment_status === "paid") {
            const svc = createServiceClient();
            const { data: listing } = await svc
              .from("marketplace_listings")
              .select("id,title,featured_until")
              .eq("id", listingId)
              .maybeSingle<{ id: string; title: string; featured_until: string | null }>();
            if (listing) {
              title = listing.title;
              const { error: featErr } = await svc
                .from("marketplace_listings")
                .update({ featured_until: nextFeaturedUntil(listing.featured_until).toISOString() })
                .eq("id", listing.id);
              if (featErr) console.error("[stripe webhook] featured update failed:", featErr.message);
            }
          }
          const cents = cs.amount_total;
          await sendAdminNewSale({
            company: title ? `Listing: ${title}` : null,
            email: cs.customer_details?.email ?? "(no email on file)",
            plan: "Marketplace featured listing",
            interval: "one-time",
            amountFormatted: typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${(cs.currency || "cad").toUpperCase()}` : "—",
          });
          break;
        }
        if (cs.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof cs.subscription === "string" ? cs.subscription : cs.subscription.id,
          );
          // Ensure metadata carries org id (from the checkout session).
          if (!sub.metadata?.organization_id && cs.metadata?.organization_id) {
            sub.metadata = { ...sub.metadata, ...cs.metadata };
          }
          await syncSubscriptionFromStripe(sub);

          // Auto-approve on payment: a trade/supplier who pays should appear in
          // the directory immediately — never sit invisible in 'pending_review'
          // waiting for a manual admin flip (audit sev-5: "paid trades invisible").
          // Only promotes pending_review/draft → approved; never touches an
          // already-approved or suspended/rejected org.
          const approveOrgId = sub.metadata?.organization_id;
          if (approveOrgId && isServiceConfigured()) {
            const svc = createServiceClient();
            await svc
              .from("organizations")
              .update({ profile_status: "approved" })
              .eq("id", approveOrgId)
              .in("profile_status", ["pending_review", "draft"]);
          }

          await sendSubscriptionCheckoutUpdates(cs, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Sync Stripe's CURRENT state, not the event snapshot, so a late
        // retry or a backlog resent out of order can't roll a status back.
        const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
        if (sub.metadata?.product === SPONSOR_PRODUCT) {
          await syncSponsorSubscription(sub);
          break;
        }
        if (sub.metadata?.product === INTEL_PRODUCT) {
          await syncIntelSubscription(sub);
          break;
        }
        await syncSubscriptionFromStripe(sub);

        // Revenue leak: nothing previously demoted a churned org out of the
        // paid directory. listVendors()/getVendor() already exclude
        // status='suspended' (used today for admin bans), so a canceled
        // subscriber otherwise kept showing — ranked alongside active
        // paying competitors — for free, forever. Demote on deletion only
        // (not past_due — Stripe's own dunning retries run for weeks first,
        // and a temporary card failure shouldn't unlist anyone). Does NOT
        // auto-reactivate on a later resubscribe — that mirrors the existing
        // "never touches a suspended org" rule on the profile_status
        // promotion above, so an admin ban can't be silently undone by a
        // new Stripe event. Reactivating after billing is fixed is a
        // deliberate one-click admin action, same as lifting any other ban.
        // A Founding 500 lifetime org whose old recurring sub ends keeps
        // everything: no suspension, no "canceled" in GHL.
        if (await isOrgLifetime(sub.metadata?.organization_id)) break;

        if (
          event.type === "customer.subscription.deleted" &&
          isServiceConfigured() &&
          sub.metadata?.organization_id
        ) {
          const svc = createServiceClient();
          await svc
            .from("organizations")
            .update({ status: "suspended" })
            .eq("id", sub.metadata.organization_id)
            .eq("status", "active");
        }

        // GHL: if we have the org's email, mirror the new subscription state.
        // The deletion event also fires here → flips status to canceled.
        if (isServiceConfigured() && sub.metadata?.organization_id) {
          const supabase = createServiceClient();
          const { data: org } = await supabase
            .from("organizations")
            .select("email,name")
            .eq("id", sub.metadata.organization_id)
            .maybeSingle<{ email: string | null; name: string | null }>();
          await syncSubscriptionContact(sub.metadata.organization_id, sub.status, org);
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        // Dead code before this fix: Stripe SDK ^22 moved this field to
        // invoice.parent.subscription_details.subscription. The old
        // `(inv as Stripe.Invoice & { subscription?: string }).subscription`
        // cast lied to TypeScript — at runtime it was always undefined, so
        // this branch never ran (past_due was only ever set as a side
        // effect of customer.subscription.updated, which Stripe also fires
        // on payment failure — worked by coincidence, not by design).
        const subField = inv.parent?.subscription_details?.subscription;
        const subId = typeof subField === "string" ? subField : subField?.id;
        // Mirror the subscription's current status rather than forcing
        // past_due: an old failed invoice resent after the customer paid
        // must not mark them past_due again.
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          // An Award Intelligence sub carries organization_id too: it must
          // never be synced into the org's Trade Pro subscriptions row.
          if (sub.metadata?.product === INTEL_PRODUCT) {
            await syncIntelSubscription(sub);
          } else if (sub.metadata?.organization_id) {
            await syncSubscriptionFromStripe(sub);
          } else if (isServiceConfigured() && sub.status !== "active" && sub.status !== "trialing") {
            // No org id on the subscription (e.g. a hand-linked row): keep the
            // old behaviour and flag the row by subscription id.
            await createServiceClient()
              .from("subscriptions")
              .update({ status: "past_due" })
              .eq("stripe_subscription_id", subId);
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error", err);
    // Release the idempotency claim so Stripe's retry actually reprocesses
    // (otherwise the retry is acked as a duplicate and the work is lost).
    if (isServiceConfigured()) {
      await createServiceClient().from("stripe_webhook_events").delete().eq("id", event.id);
    }
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
