import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscriptionFromStripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendSubscriptionActivatedEmail, sendAdminNewSale } from "@/lib/email/send";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";
import { verifyStripeEvent } from "@/lib/stripe/verify-event";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Signature first; if the env secret doesn't match this endpoint, fall back
  // to fetching the event from Stripe by id (see verifyStripeEvent).
  const stripe = getStripe();
  const verified = await verifyStripeEvent(stripe, body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event: Stripe.Event = verified.event;
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

          // Notify the admin (you) the instant a sale lands — fires even if
          // the customer-facing email is missing an address.
          {
            const planLabel = sub.metadata?.plan === "featured" ? "Featured" : "Trade Pro";
            const intervalLabel =
              sub.items.data[0]?.price.recurring?.interval === "year" ? "annual" : "monthly";
            const cents = cs.amount_total;
            const currency = (cs.currency || "cad").toUpperCase();
            const amountFormatted =
              typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${currency}` : "—";
            const discount = cs.total_details?.amount_discount ?? 0;
            const couponNote = discount > 0 ? "promo/coupon applied" : undefined;
            await sendAdminNewSale({
              company: cs.customer_details?.name ?? null,
              email: cs.customer_details?.email ?? "(no email on file)",
              plan: planLabel,
              interval: intervalLabel,
              amountFormatted,
              couponNote,
            });
          }

          if (cs.customer_details?.email) {
            await sendSubscriptionActivatedEmail(cs.customer_details.email);
            // Referral fee gating — 90-day retention gate (audit rank-9).
            // The $75 cash fee stays cash (best referrer conversion), but we
            // NEVER pay it the day a trade activates — a refund or month-1
            // cancel would make the payout a pure loss. Instead BOTH intervals
            // start a 90-day hold; the GHL workflow releases the fee only if the
            // referred trade is still active at day 90 (annual: still subscribed;
            // monthly: ~3 paid months = revenue clears the $75). The interval is
            // tagged so the GHL workflow can pick the right check.
            const interval = sub.items.data[0]?.price.recurring?.interval;
            const intervalTag =
              interval === "year" ? "plan-annual" : "plan-monthly";
            await syncPmrfpUserToGhl(
              {
                email: cs.customer_details.email,
                fullName: cs.customer_details.name ?? null,
                role: "trade",
                subscriptionStatus: "active",
                profileCompletionPct: 100,
              },
              {
                extraTags: [
                  "pmrfp-pro-active",
                  "fee-hold-90day-retention",
                  intervalTag,
                ],
              },
            );
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Sync Stripe's CURRENT state, not the event snapshot, so a late
        // retry or a backlog resent out of order can't roll a status back.
        const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
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
          if (org?.email) {
            const statusMap: Record<string, "active" | "past_due" | "canceled" | "trial"> = {
              active: "active",
              past_due: "past_due",
              canceled: "canceled",
              trialing: "trial",
            };
            const mappedStatus = statusMap[sub.status] ?? "canceled";
            await syncPmrfpUserToGhl({
              email: org.email,
              fullName: org.name,
              role: "trade",
              orgId: sub.metadata.organization_id,
              orgName: org.name,
              subscriptionStatus: mappedStatus,
            });
          }
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
          if (sub.metadata?.organization_id) {
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
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
