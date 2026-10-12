import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendAdminNewSale } from "@/lib/email/send";
import { asPaid, loadAdminSponsors } from "./admin";
import { findConflicts, torontoDay } from "./model";

/**
 * Stripe → sponsors (called from /api/stripe/webhook for metadata.product =
 * SPONSOR_PRODUCT). Paid checkout: the draft becomes "pending" (slot held,
 * message waiting for review) and the owner is told. Subscription ended:
 * the sponsor ends today. Never touches organizations or Trade Pro.
 */

export async function handleSponsorCheckout(cs: Stripe.Checkout.Session): Promise<void> {
  const sponsorId = cs.metadata?.sponsor_id;
  const cents = cs.amount_total;
  const currency = (cs.currency || "cad").toUpperCase();
  let company: string | null = cs.customer_details?.name ?? null;
  let conflictNote = "";

  if (sponsorId && isServiceConfigured() && (cs.payment_status === "paid" || cs.payment_status === "no_payment_required")) {
    const svc = createServiceClient();
    const { rows } = await loadAdminSponsors(svc);
    const me = rows.find((r) => r.id === sponsorId);
    if (me) {
      company = me.name;
      // Money taken means the slot is held, even if someone else got there first;
      // the admin sorts out a clash (refund or another slot).
      const others = asPaid(rows.filter((r) => r.id !== sponsorId));
      const clash = findConflicts(
        { id: me.id, tier: me.tier as "province" | "national" | "digest", country: me.country as "CA" | "US", trades: me.trades ?? [], regions: me.regions ?? [], startDate: me.start_date, endDate: me.end_date },
        others,
      );
      if (clash.length) conflictNote = ` SLOT CLASH with ${clash[0].sponsor.name || clash[0].sponsor.slug}: refund or offer another slot.`;
      const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id ?? null;
      const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer?.id ?? null;
      const { error } = await svc
        .from("sponsors")
        .update({
          status: me.status === "draft" ? "pending" : me.status,
          stripe_subscription_id: subId,
          stripe_customer_id: customerId,
          notes: `${me.notes ?? ""}\nPaid by card ${torontoDay()}.${conflictNote}`.trim().slice(0, 4000),
        })
        .eq("id", sponsorId);
      if (error) throw new Error(`sponsor ${sponsorId} paid update failed: ${error.message}`);
    }
  }

  await sendAdminNewSale({
    company: company ? `Sponsor: ${company}${conflictNote}` : "Sponsor",
    email: cs.customer_details?.email ?? "(no email on file)",
    plan: `Sponsorship (${cs.metadata?.tier ?? "slot"}, ${cs.metadata?.country ?? ""}) · review the message in /admin/sponsors`,
    interval: "monthly",
    amountFormatted: typeof cents === "number" ? `$${(cents / 100).toFixed(2)} ${currency}` : "—",
  });
}

/** Subscription changed: a cancelled/unpaid sponsorship ends today (its slot frees up). */
export async function syncSponsorSubscription(sub: Stripe.Subscription): Promise<void> {
  if (!isServiceConfigured()) return;
  const ended = sub.status === "canceled" || sub.status === "unpaid" || sub.status === "incomplete_expired";
  if (!ended) return;
  const today = torontoDay();
  const svc = createServiceClient();
  const { data } = await svc
    .from("sponsors")
    .select("id,start_date,status")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle<{ id: string; start_date: string | null; status: string }>();
  if (!data || data.status === "ended" || data.status === "rejected") return;
  const end = data.start_date && data.start_date > today ? data.start_date : today;
  const { error } = await svc.from("sponsors").update({ status: "ended", end_date: end }).eq("id", data.id);
  if (error) throw new Error(`sponsor ${data.id} end failed: ${error.message}`);
}
