# Award Intelligence (paid add-on) and the one-off market report idea

_2026-10-16. Built in PR "Award Intelligence" (branch `feat/award-intel`)._

## What a subscriber gets

All from the official award notices already on the board (CanadaBuys, SEAO, City of Toronto, Nova Scotia). One country and one currency per view.

- **Competitor profiles** `/intel/companies/[slug]`: wins over time, total disclosed value, average and typical award, buyers, trades, provinces/cities, last-12 vs previous-12 trend (says "not enough history" while records are under two years old), every award with its official notice.
- **Buyer profiles** `/intel/buyers/[slug]`: spend by trade and year, awards, typical size, incumbents (won 2+ times), every supplier.
- **Renewal radar** `/intel/renewals`: snow, janitorial, landscaping, waste, security, elevator, HVAC maintenance, pest, fire-safety inspection. Expected rebid = same month as the award, one term later; window opens 4 months before. Uses the term stated in the notice title (periods, seasons, durations, "3+2", option years) and labels everything else "Estimated from typical 3-year terms". Filters: trade, province, buyer, horizon. Shows which months the rebids fall in.
- **Market share** `/intel/markets/[trade]/[province]`: top winners by count and value, top-3 share, HHI concentration, new entrants this year.
- **CSV** for every view.

Free, Trade Pro and signed-out visitors see counts, one example row and a blurred placeholder table. `/intel` is the only indexed page.

## Real coverage (read-only pass over prod, 2026-10-16, Canada)

| | |
|---|---|
| Award notices on record | 943 (records start 2025-10-14) |
| Companies / with 3+ awards | 685 / 39 |
| Buyers / with 3+ awards | 271 / 77 |
| Trade × province markets with 3+ awards | 54 |
| Recurring-service awards on the radar | 348 |
| Radar: rebid window open now or within 12 months | 4 (snow 2, landscaping 1, waste 1) |
| Radar: within 24 months | 91 (snow 44, HVAC 12, waste 12, janitorial 11, landscaping 4, elevator 3, fire 2, security 2, pest 1) |
| Awards whose title states a term | 20 of 943 (2%); 19 of 348 recurring (5.5%); none state option years in the title |

U.S.: 0 award notices on the board, so U.S. Intel is empty (the page says so).

**Why the 12-month radar is small:** the board keeps a rolling ~12 months of award notices (CanadaBuys, Toronto, NS 365 days; SEAO 180 days), so nothing awarded 2–5 years ago exists yet, and 95% of recurring awards fall back to the 3-year estimate (rebid late 2028+). Two data follow-ups would fix it:
1. Keep award rows instead of archiving them after the feed window (or store them in a separate award-history table that public pages don't index), and backfill older CanadaBuys fiscal-year award CSVs (open data goes back years).
2. Parse term and option years from the full notice text at import (scope is in `rfp_posts.scope`, not in the public view or snapshot) into a small `term_months / option_months` column. The radar already prefers a stated term when one is present.

Persona note (2026-10-16): recurring-service contractors are the likeliest payers; municipal contracts often state terms/option years in the documents (Oakville six winter seasons, Oshawa 36 months, Clarington 3+2), which is why follow-up 2 matters.

## Price and switches

- $99/month or $990/year, CAD in Canada and USD in the U.S. (one config: `src/lib/intel/pricing.ts`). Launch pricing.
- Separate from Trade Pro: neither unlocks the other.
- **Card checkout is OFF by default** (`INTEL_CHECKOUT_ENABLED` unset) so Rishon can pilot with design partners first. While off, pages say "Ask for access" and admins grant it at `/admin/intel` (optional end date).

## One-off "market report" product (idea, not built)

A printable page for one trade × one province (e.g. "Snow removal in Quebec, 2026"), sold once rather than as a subscription.

- **Content:** the market-share page plus the renewal radar for that trade × province, the price benchmark range, top buyers and their incumbents, a month-by-month rebid calendar, and the method notes. Dated, with sources and licences.
- **Format:** an HTML page at `/intel/reports/[trade]/[province]?token=…` with print CSS (one page per section, no nav), so "Save as PDF" in the browser gives the PDF. No PDF library needed.
- **Who buys:** a contractor entering a new province; an association or lender sizing a market; a property manager checking whether a market is competitive.
- **Price to test:** $149–$249 CAD per report; free with an annual Intel plan.
- **Checkout later:** one-time Stripe Checkout (`mode: "payment"`, `metadata.product = pmrfp_market_report`), like Project Spotlight; the webhook emails a signed link that works for 30 days.
- **Only offer it where it's honest:** a trade × province with 10+ awards on record (today that's a handful of Quebec and Nova Scotia snow/janitorial markets). Below that, don't sell it.
- The `/intel` page already has a "Need one market on paper? Tell us" link (to `/contact?topic=market-report`) to measure demand before building.
