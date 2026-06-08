import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscriptionFromStripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendSubscriptionActivatedEmail, sendAdminNewSale } from "@/lib/email/send";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
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
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionFromStripe(sub);
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
        const inv = event.data.object as Stripe.Invoice & { subscription?: string };
        if (inv.subscription && isServiceConfigured()) {
          const supabase = createServiceClient();
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", inv.subscription);
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
