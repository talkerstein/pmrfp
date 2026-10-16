import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminNewSale } from "@/lib/email/send";
import { intelRowFromSubscription, shouldApplyIntelSync } from "./stripe-rules";

/**
 * Stripe → intel_access (called from /api/stripe/webhook for metadata.product
 * = INTEL_PRODUCT). Never touches subscriptions (Trade Pro) or organizations.
 * Throws on a failed write so Stripe retries.
 */

export async function syncIntelSubscription(sub: Stripe.Subscription): Promise<void> {
  if (!isServiceConfigured()) return;
  const row = intelRowFromSubscription(sub);
  if (!row) {
    console.warn("[intel] subscription without an organization id", sub.id);
    return;
  }
  const svc = createServiceClient();
  const { data: existing } = await svc
    .from("intel_access")
    .select("status,source,stripe_subscription_id")
    .eq("organization_id", row.organization_id)
    .maybeSingle<{ status: string; source: string; stripe_subscription_id: string | null }>();
  if (!shouldApplyIntelSync(existing, row)) return;
  const { error } = await svc.from("intel_access").upsert(row, { onConflict: "organization_id" });
  if (error) throw new Error(`intel_access sync failed: ${error.message}`);
}

/** Paid checkout: activate from the subscription, and tell the owner a sale landed. */
export async function handleIntelCheckout(cs: Stripe.Checkout.Session, stripe: Stripe): Promise<void> {
  const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id;
  if (subId) {
    const sub = await stripe.subscriptions.retrieve(subId);
    if (!sub.metadata?.organization_id && cs.metadata?.organization_id) sub.metadata = { ...sub.metadata, ...cs.metadata };
    await syncIntelSubscription(sub);
  }
  const cents = cs.amount_total;
  const currency = (cs.currency || "cad").toUpperCase();
  await sendAdminNewSale({
    company: cs.customer_details?.name ?? null,
    email: cs.customer_details?.email ?? "(no email on file)",
    plan: "Award Intelligence",
    interval: cs.metadata?.interval === "annual" ? "annual" : "monthly",
    amountFormatted: typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${currency}` : "—",
  });
}
