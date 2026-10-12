# Sponsorships

Direct sponsorships sold on `/advertise` by **trade × province/state**, plus a
national tier and an email-only tier. No ad networks, no third-party scripts,
no tracking pixels, no new cookies.

## Tiers and prices

Set in one file: `src/lib/sponsors/pricing.ts` (CAD and USD set separately,
never converted; `LAUNCH_PRICING` shows the "Launch pricing" tag).

| Tier | Holds | Launch price |
| --- | --- | --- |
| `province` | one trade in one province/state: web pages + that trade's emails there | $199/mo |
| `national` | one trade in the whole country: every province/state without its own sponsor, the trade's forum, emails | $499/mo |
| `digest` | one trade in one province/state, emails only | $149/mo |

One sponsor per slot (country × trade × province × web/email). A province
sponsor beats the national one in its province. Canada and the U.S. never mix.

## Where units show

One labelled card ("Sponsored" / "Commandité" / "Patrocinado"), below the main
content, `rel="sponsored noopener"`, clicks through `/go/<slug>`:

- RFP/tender detail pages (trade + the listing's province)
- Major projects list filtered to a province, and project pages there
- Trade forum boards (visitor's province, else national)
- Trade pages (`/trades/<trade>` national; `/trades/<trade>/<city>` its province)
- Daily match email and weekly digest (the email's trade + its listings' province)
- Price benchmark pages: wire `<SponsorSlot ctx={{ placement: "benchmark", categories: [trade], market, province }} />` once PR #140's pages are on master.

Never on dashboards, admin, sign-in/up, onboarding, pricing, billing or
checkout (`EXCLUDED_ROUTES` in `src/lib/sponsors/model.ts`, unit-tested).
When no paid sponsor holds a slot, the house sponsors in
`src/lib/sponsors/registry.ts` fill it as before.

## Admin

`/admin/sponsors` → **New sponsor** (or a paid checkout appears as `pending`):

1. Fill name, website, logo URL, tier, country, trades (slugs), provinces/states, dates.
2. Write or paste the message (headline ≤ 70, message ≤ 180, button ≤ 28; French for Québec).
3. **Approve and go live**: checks the copy rules (no bid-like wording, no PMRFP
   endorsement or guarantees, no competitor domains, French for Québec) and slot
   exclusivity. Pause keeps the slot; End frees it.
4. **Report** per sponsor and month (impressions, clicks, click rate, by placement
   and trade × province) with CSV download.

Impressions: a unit counts when at least half of it is on screen (one
first-party POST to `/api/sponsors/seen`, no cookies) or when an email with it
is sent. Counts are buffered in memory per server instance and written in one
batched RPC a minute (`record_sponsor_impressions`), so they're approximate.

## Stripe (optional card payment)

Without these, `/advertise` is enquiry-only. To take cards for a tier:

1. In the Stripe dashboard, create a product "PMRFP sponsorship" with a
   **recurring monthly** Price per tier and currency (e.g. 199 CAD, 199 USD).
2. Set the Price IDs in Vercel: `STRIPE_PRICE_SPONSOR_{PROVINCE,NATIONAL,DIGEST}_{CAD,USD}`.
3. The existing webhook (`/api/stripe/webhook`) needs `checkout.session.completed`
   and `customer.subscription.*` events (already used by Trade Pro).

Paid checkout → a sponsor row goes `draft` → `pending` (slot held), the owner
gets the usual new-sale email, and the message waits for review in
`/admin/sponsors`. A cancelled or unpaid subscription ends the sponsorship.

## Database

Migration `supabase/migrations/20261012000002_sponsorships.sql`: `sponsors`
(admin-only), `sponsors_public` view (rows holding a slot; copy only when
approved), `sponsor_impressions` + `record_sponsor_impressions()`, and a
`region` column on `sponsor_clicks`. Pages read one cached snapshot
(`src/lib/sponsors/data.ts`, tag `sponsors`), never the table per request.
