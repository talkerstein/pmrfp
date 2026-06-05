# PMRFP — Trade Referral Payout Policy

> **Decision (2026-06-05, Rishon):** Pay the $75 trade-referral fee **~30 days
> after the referred trade's Trade Pro payment clears**, to protect against
> chargebacks/refunds. This **replaces** the earlier 90-day-retention gate.

## The rule

The **$75 CAD** finder's fee (trade-referral lane) is paid when **all** are true:

1. The referred trade **activated Trade Pro** (annual $249/yr or monthly $29/mo), and
2. That charge has **cleared** — settled in Stripe with **no refund, chargeback, or open dispute**, and
3. **~30 days** have passed since the payment cleared.

→ On day 30 with a clean charge, the **$75 e-transfer goes out within 7 days**.

If the charge is **refunded, charged back, or disputed** inside the 30-day window → **no fee is owed** (the referrer is told the deal didn't stick).

## Why 30-days-after-clear (not pay-on-activation)

- Paying the instant a trade activates exposes us to a pure loss if they refund or charge back days later — we'd be out the $75 **and** the subscription.
- A 30-day hold after the payment clears covers the **bulk** of refund/dispute risk cheaply, while still paying referrers fast enough to keep the lane attractive.
- **Honest caveat:** card networks allow chargebacks up to ~120 days, so 30 days doesn't eliminate the risk entirely — it covers the common window. Revisit if we ever see late-dispute abuse.

## Plan-specific

- **Annual ($249):** lowest risk — one large cleared charge, 30-day hold, pay.
- **Monthly ($29):** same 30-day-after-first-payment-clear rule. Note this covers *chargeback* risk but not a month-2 cancel; acceptable for now given the small fee vs. the $29 already collected. Revisit if monthly-referral churn spikes.

## Operational (when GHL is wired)

Replace the dormant `fee-hold-90day-retention` workflow with a **`fee-hold-30day-clear`** check:
- Tag on activation: `fee-hold-30day-clear` + `plan-annual|plan-monthly`.
- A 30-day timer from the payment-clear date → check Stripe for refund/dispute → if clean, create an e-transfer payout task; else close as forfeited.
- Until GHL is live, this is tracked manually by Rishon from Stripe.

## Visibility

- The **referral program is OUT of the primary nav** (and off the homepage banner) for now — the link is shared **strategically** by Rishon.
- Still reachable via the **footer (Resources)** and direct links: `/refer`, `/refer-a-trade`, `/refer-a-project`.

## Copy status

Transactional touchpoints updated to the new policy: refer-trade form fee line, the submit confirmation message. **Still saying the old "90-day" rule (next-hour sweep):** `refer-a-trade` marketing page (~6 spots), the referrer confirmation email (`src/lib/email/send.ts`), and the `/refer` hub. These must be updated before any strategic link is sent.
