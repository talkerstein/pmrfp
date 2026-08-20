# PMRFP — PM-side SEO growth model + pricing

> Written 2026-08-19. Numbers marked **measured** come from Search Console and
> the production database. Everything else is a stated assumption — treat the
> model as a way to see which lever matters, not a forecast.

## The structural fact that drives everything

Property managers **never pay us**. They post free. So the SEO play does not
produce revenue directly — it produces **RFPs**, and RFPs are what make trades
pay $249. The chain is:

```
PM organic visit → posts an RFP → board fills → trades subscribe
```

Revenue is one step removed and lagged. That's fine, but it means we should stop
judging SEO by signups and start judging it by **RFPs posted per month**.

It also answers the $5/$10 question: if the audience we're attracting is PMs,
the thing we monetise is still the trade side. Cheap trade SKUs don't help us
reach PMs at all.

## Where we are (measured)

| Metric | Value |
|---|---|
| Organic impressions, 90d | 1,220 |
| Organic clicks, 90d | 19 |
| Average position | 13.9 (page 2) |
| Pages indexed | 156 |
| Pages **not** indexed | 215 |
| Open RFPs | 7 |
| Real orgs | 20 |
| Paying customers | 1 ($249 ARR) |

`/vs/merx` alone is 717 of those 1,220 impressions — 59% of all visibility, on
one competitor page, converting 1 click.

## How much PM traffic actually fills the board

Assumptions, stated plainly:

- A cost-guide or template visitor posts an RFP **2%** of the time (range 1–3%;
  it's a real commitment, not a newsletter signup).
- An RFP stays open ~**45 days**.

To hold a **50-RFP board** — the point where a trade in a given trade+region
reliably sees relevant work — you need ~33 new RFPs a month, which needs:

> **~1,650 PM-intent organic visits per month.**

That is the target number. We're currently at roughly **6 clicks a month**.

That gap is the honest headline. Closing it on SEO alone is a 12-month job, which
is why the email harvest matters: it fills the board *now* while SEO compounds
behind it. The two are not alternatives.

## Fix the bucket before pouring more in

**215 pages are not indexed** — 76 "crawled, currently not indexed" and 75
"discovered, not indexed". That's 58% of the site Google has seen and declined.

Publishing 40 new pages into that is pouring water into a leaky bucket. Priority
order is: get existing pages indexed and ranked → *then* expand.

The cheapest wins available right now, in order:

1. **`/vs/merx` from position ~14 to page 1.** 717 impressions already exist. At
   position 4–6 a 6–9% CTR turns 1 click into roughly 45–65. Same page, same
   content, no new work — it needs internal links and depth, not creation.
   (Title fix is already in PR #24, unmerged.)
2. **Internal linking into orphaned pages.** "Discovered, not indexed" usually
   means thin internal linking. Every cost guide should link its matching
   template and trade hub, and vice versa.
3. **Merge or drop genuinely thin pages** rather than leaving 151 of them
   competing for crawl budget.

## PM acquisition — ranked by what actually reaches a property manager

### 1. Seasonal tender timing (do this **now**)
Canadian commercial snow contracts are tendered **August–October** for the
Nov–April season. We already have `snow-removal-seasonal-contract` (template)
and `commercial-snow-removal-cost` (guide). This is the single most timely
PM-intent asset on the site and the window is open right now.

Build the pattern into a **tender calendar**: snow (Aug–Oct), roofing and paving
(Feb–Apr for spring), HVAC service (Mar–May), landscaping (Feb–Mar), fire and
life-safety inspections (annual anniversaries). Publish and push each ahead of
its window instead of whenever.

### 2. Expand RFP templates (20 → 60)
This is the **highest-intent content we can own**. Someone searching
"commercial HVAC RFP template" is *about to create supply*. Nobody else in
Canada is competing seriously for these terms, and each template ends in the
most natural CTA in the funnel: post this and get responses.

### 3. Reserve fund + capital planning (condo corporations)
A reserve fund study dictates 5–30 years of capital work. A PM reading one is
looking at a literal pipeline of future RFPs. Own the ground between
"the study says the roof goes in 2028" and "how do I tender it".

### 4. Compliance and inspection intervals
ESA, TSSA, fire code, WSIB clearance, licensing. PMs *must* comply, the searches
are evergreen, and it positions us as the professional reference.
**Care needed:** Ontario condo law's competitive-procurement provisions are not
binding. Write about them accurately as an industry direction — never as a legal
requirement to tender.

### 5. Free tools
An RFP scope builder or budget estimator. Genuinely useful, naturally
link-worthy, and captures a PM at the exact moment of intent. This is also how we
earn links legitimately — which is the real answer to the backlink instinct.

### 6. Associations (not SEO, but the audience is already assembled)
ACMO, CCI-Toronto, BOMA, REIC. Membership, speaking, contributed articles.
Reaches PMs directly *and* produces the kind of links that are safe to have.

### 7. The 1,126-contact Ontario PM list
Fastest PM channel we own and it needs no ranking. See
`briefs/outreach/rfp-harvest-emails.md`.

## Pricing — adjusted

Keep PMs free. Ladder the trade side so each rung adds something real:

| Tier | Price | What it's actually worth | Works with a thin board? |
|---|---|---|---|
| Free listing | $0 | Presence | yes |
| **Verified** | **$99/yr** | Real checks — licence, WSIB, insurance — plus the badge | **yes** |
| Trade Pro | $249/yr | Verified + RFP access + matching alerts | needs inventory |
| Featured | $599/yr | Priority placement (already built) | yes |

**Why $99 and not $5–10/mo.** The instinct — a cheap rung that sells while the
board is thin — is right. The price point was the problem. $10/mo is $120/yr
against a $249 core: it anchors expectations at half price and invites the
question "why would I ever buy Pro". $99/yr sits clearly *below* Pro, still
reads as a real product, and its value doesn't depend on RFP volume, because
directory presence already works — `/directory/pest-control-plus` pulled 54
impressions on its own.

**Mix to ~$20k ARR** (versus "100 Pro subs" as the only route):

```
100 Verified @ $99  =  $9,900
 30 Pro      @ $249 =  $7,470
  5 Featured @ $599 =  $2,995
                      -------
                       $20,365
```

Reaching 100 verified + 30 pro is a materially easier path than 100 Pro, and the
verified tier is sellable today.

**Verification has to be real.** `organizations.verified` is currently a flag we
set by hand. Selling that badge without doing the checks means selling PMs a
trust signal that isn't backed by anything — which poisons the demand side we're
trying to build. Charge for the work, then do the work.

## What this means for sequencing

1. Fix the Stripe webhook. Two new SKUs on billing that silently failed for
   customer #1 just multiplies the failure.
2. Merge PR #24 — the `/vs/` title fix is free traffic sitting unshipped.
3. Indexation pass before new content.
4. Snow-removal seasonal push while the window is open.
5. Build Verified as a product.
6. Templates 20 → 60, on the tender calendar.

Nothing here removes the need for the harvest emails. SEO is the compounding
channel; the emails are the one that produces RFPs this month.
