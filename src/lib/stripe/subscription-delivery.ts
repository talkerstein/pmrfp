import "server-only";
import type Stripe from "stripe";
import { escHtml } from "@/lib/email/parts";
import { sendAdminNewSale, sendSubscriptionActivatedEmail } from "@/lib/email/send";
import { syncPmrfpUserToGhl } from "@/lib/ghl/sync";

export async function sendSubscriptionCheckoutUpdates(session: Stripe.Checkout.Session, sub: Stripe.Subscription) {
  const name = session.customer_details?.name;
  const email = session.customer_details?.email;
  const interval = sub.items.data[0]?.price.recurring?.interval === "year" ? "annual" : "monthly";
  const currency = (session.currency ?? "cad").toUpperCase();
  const amount = session.amount_total;
  await sendAdminNewSale({
    company: name ? escHtml(name) : null,
    email: escHtml(email ?? "(no email on file)"),
    plan: sub.metadata?.plan === "featured" ? "Featured" : "Trade Pro",
    interval,
    amountFormatted: typeof amount === "number" ? `$${(amount / 100).toFixed(2)} ${currency}` : "—",
    couponNote: (session.total_details?.amount_discount ?? 0) > 0 ? "promo/coupon applied" : undefined,
  });
  if (!email) return;
  await sendSubscriptionActivatedEmail(email);
  await syncPmrfpUserToGhl(
    { email, fullName: name ?? null, role: "trade", subscriptionStatus: "active", profileCompletionPct: 100 },
    { extraTags: ["pmrfp-pro-active", "fee-hold-90day-retention", `plan-${interval}`] },
  );
}

export async function syncSubscriptionContact(organizationId: string, status: Stripe.Subscription.Status,
  org: { email: string | null; name: string | null } | undefined | null) {
  if (!org?.email) return;
  const statuses = { active: "active", past_due: "past_due", trialing: "trial" } as const;
  const subscriptionStatus = statuses[status as keyof typeof statuses] ?? "canceled";
  await syncPmrfpUserToGhl({
    email: org.email, fullName: org.name, role: "trade", orgId: organizationId, orgName: org.name, subscriptionStatus,
  });
}
