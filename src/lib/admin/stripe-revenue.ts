/**
 * Revenue for the weekly report, straight from Stripe — not from our
 * subscriptions table, which only knows what the webhook (or a manual SQL fix)
 * wrote there. Test rows and hand-entered rows made the table's MRR wrong;
 * Stripe is the ledger.
 */
import type Stripe from "stripe";

export interface StripeRevenue {
  /** Money actually received (succeeded charges minus refunds), in dollars, by currency. */
  moneyIn7d: Record<string, number>;
  moneyIn30d: Record<string, number>;
  payments7d: { who: string; amount: number; currency: string; date: string }[];
  active: { who: string; amount: number; currency: string; interval: string }[];
  /** Monthly recurring revenue of active subscriptions, dollars, by currency. */
  mrr: Record<string, number>;
  pastDue: string[];
  canceled7d: string[];
}

const DAY = 86_400;

function who(c: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined, fallback?: string | null): string {
  if (c && typeof c === "object" && !("deleted" in c && c.deleted)) {
    const cust = c as Stripe.Customer;
    return cust.name || cust.email || cust.id;
  }
  return fallback || (typeof c === "string" ? c : "Unknown customer");
}

const add = (m: Record<string, number>, cur: string, amt: number) => {
  m[cur] = Math.round(((m[cur] ?? 0) + amt) * 100) / 100;
};

/** Pure: summarize Stripe objects. `now` in unix seconds. */
export function summarizeStripe(
  charges: Stripe.Charge[],
  subs: Stripe.Subscription[],
  now: number,
): StripeRevenue {
  const out: StripeRevenue = { moneyIn7d: {}, moneyIn30d: {}, payments7d: [], active: [], mrr: {}, pastDue: [], canceled7d: [] };

  for (const ch of charges) {
    if (ch.status !== "succeeded" || !ch.paid) continue;
    const net = (ch.amount - (ch.amount_refunded ?? 0)) / 100;
    if (net <= 0) continue;
    const cur = ch.currency.toUpperCase();
    if (ch.created >= now - 30 * DAY) add(out.moneyIn30d, cur, net);
    if (ch.created >= now - 7 * DAY) {
      add(out.moneyIn7d, cur, net);
      out.payments7d.push({
        who: who(ch.customer as Stripe.Customer | string | null, ch.billing_details?.name || ch.billing_details?.email),
        amount: net,
        currency: cur,
        date: new Date(ch.created * 1000).toISOString().slice(0, 10),
      });
    }
  }

  for (const s of subs) {
    const name = who(s.customer);
    if (s.status === "active" || s.status === "trialing") {
      let monthly = 0;
      let amount = 0;
      let interval = "month";
      let currency = s.currency.toUpperCase();
      for (const item of s.items.data) {
        const unit = (item.price.unit_amount ?? 0) / 100;
        const qty = item.quantity ?? 1;
        const iv = item.price.recurring?.interval ?? "month";
        const count = item.price.recurring?.interval_count ?? 1;
        const perMonth = iv === "year" ? 1 / (12 * count) : iv === "week" ? 52 / 12 / count : iv === "day" ? 365 / 12 / count : 1 / count;
        amount += unit * qty;
        monthly += unit * qty * perMonth;
        interval = iv;
        currency = item.price.currency.toUpperCase();
      }
      // List price: coupons aren't applied here. "Money in" (charges) is the exact figure.
      out.active.push({ who: name, amount, currency, interval });
      add(out.mrr, currency, monthly);
    } else if (s.status === "past_due" || s.status === "unpaid") {
      out.pastDue.push(name);
    } else if (s.status === "canceled" && (s.canceled_at ?? 0) >= now - 7 * DAY) {
      out.canceled7d.push(name);
    }
  }
  return out;
}

/** Fetch from Stripe (live key on Vercel). Null when Stripe isn't configured or errors. */
export async function fetchStripeRevenue(stripe: Stripe, now = Math.floor(Date.now() / 1000)): Promise<StripeRevenue | null> {
  try {
    const [charges, subs] = await Promise.all([
      stripe.charges.list({ created: { gte: now - 30 * DAY }, limit: 100, expand: ["data.customer"] }),
      stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] }),
    ]);
    return summarizeStripe(charges.data, subs.data, now);
  } catch (err) {
    console.error("[admin-weekly] Stripe fetch failed:", err);
    return null;
  }
}

export function fmtByCurrency(m: Record<string, number>): string {
  const parts = Object.entries(m).filter(([, v]) => v > 0);
  if (!parts.length) return "$0";
  return parts.map(([cur, v]) => `$${v.toLocaleString("en-CA", { maximumFractionDigits: 2 })} ${cur}`).join(" + ");
}
