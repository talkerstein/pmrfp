import "server-only";
import type Stripe from "stripe";
import { sendAdminFoundingAlert, sendAdminNewSale, sendFoundingLifetimeEmail } from "@/lib/email/send";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";

export async function sendFoundingCheckoutUpdates(
  stripe: Stripe, checkout: Stripe.Checkout.Session, organizationId: string,
  result: { duplicate: boolean; previousStripeSubscriptionId: string | null; oversold: boolean; sold: number | null },
) {
  const email = checkout.customer_details?.email ?? "(no email on file)";
  const alert = (reason: string) => sendAdminFoundingAlert({ reason, organizationId, email, sessionId: checkout.id });
  if (result.duplicate) {
    await alert("org already had lifetime: second payment, refund it");
    return;
  }

  if (result.previousStripeSubscriptionId) {
    try {
      await stripe.subscriptions.update(result.previousStripeSubscriptionId, { cancel_at_period_end: true });
    } catch {
      console.error("[founding] could not stop old subscription renewal");
    }
    await alert(`buyer had recurring sub ${result.previousStripeSubscriptionId}; set to not renew, consider refunding unused time`);
  }
  if (result.oversold) await alert(`oversold: ${result.sold} lifetime orgs (cap 500)`);

  const cents = checkout.amount_total;
  const currency = (checkout.currency || "cad").toUpperCase();
  await sendAdminNewSale({
    company: checkout.customer_details?.name ?? null,
    email,
    plan: "Founding 500 Lifetime",
    interval: "one-time",
    amountFormatted: typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${currency}` : "—",
  });
  if (checkout.customer_details?.email) {
    await sendFoundingLifetimeEmail(checkout.customer_details.email);
    await syncPmrfpUserToGhl(
      { email: checkout.customer_details.email, fullName: checkout.customer_details.name ?? null, role: "trade", subscriptionStatus: "active", profileCompletionPct: 100 },
      { extraTags: ["pmrfp-pro-active", "pmrfp-founding-lifetime"] },
    );
  }
}
