# PMRFP — three-product structure + programmatic SEO gate

> 2026-08-19. Grid numbers and revenue baselines are **measured** from the
> production DB and Search Console. Adoption figures are stated assumptions.

## The structure

| # | Product | Price | Value depends on RFPs? | Sellable today |
|---|---|---|---|---|
| 0 | Free listing | $0 | no | — |
| 1a | **SEO Starter** | **$99/yr** | **no** | **yes** |
| 1b | **SEO Pro** | **$199/yr** | **no** | **yes** |
| 2 | RFP Access (existing Trade Pro) | $249/yr | **yes** | not yet |
| 3 | **Complete** (SEO Pro + RFP) | **$399/yr** | partly | yes |

Complete is priced against $199 + $249 = $448 bought separately, so the bundle
saves $49 and is the obvious pick for anyone who wants both.

**Why the SEO tiers can be sold today and RFP access can't:** directory presence
already produces search impressions with no RFPs involved —
`/directory/pest-control-plus` pulled 54 impressions on its own. RFP access with
7 projects on the board is a promise, not a product.

### What each tier actually is

**SEO Starter — $99/yr.** Listed on up to **3** trade×city pages of their
choosing. "Listed Vendor" badge. Profile with website link.

**SEO Pro — $199/yr.** Up to **10** trade×city pages, priority ordering within
them, and the **Verified** badge — which means we actually check licence number,
WSIB clearance and insurance certificate. Verification is the work being paid
for, not a flag we flip.

**Complete — $399/yr.** SEO Pro plus the RFP board and matching alerts.

## The programmatic grid — measured, and the gate that makes it safe

```
41 trades x 25 regions            = 1,025 possible pages
combos with >=1 APPROVED vendor   =    10   (1.0% of grid)
combos with >=2 approved vendors  =     2
combos with >=3 approved vendors  =     0
non-demo vendor orgs              =    19   (only 12 approved)
```

Generating the full grid means **1,015 empty pages** on a domain where 215 of
371 pages already fail to index (76 "crawled, not indexed"; 75 "discovered, not
indexed"). That is the scaled-content pattern the June noindex guard exists to
prevent, and it would drag the cost-guide and template pages that are actually
working.

### The gate

> **A trade×city page is generated only when it has at least 2 approved vendors,
> or at least 1 paying vendor. Everything else does not exist — no route, no
> sitemap entry, no link.**

This is the same `isThin` logic already shipped in June, moved earlier: instead
of rendering a page and hiding it with `noindex`, we never build it.

The elegant part is that **the SEO quality gate and the sales mechanic are the
same mechanism**:

```
trade pays -> their city page turns on -> page has real content
           -> indexes -> ranks -> sends them leads -> they renew
```

No paying trades in a combo, no page. Quality can't drift, because content and
revenue are the same signal. It also gives the sales conversation a concrete
hook: *"Snow Removal in Mississauga isn't live yet — you'd be the one who turns
it on."*

### Immediate free win

**7 of 19 vendor orgs are stuck in `pending_review`** — they exist but aren't
public, so they count for nothing. Counting all non-demo vendors regardless of
status, **308 combos** have at least one vendor versus 10 today.

Approving that backlog is the single cheapest expansion available, costs
nothing, and needs no code. Do it before building anything.

## Revenue math

**Baseline: $249 ARR** (1 customer). Measured.

Per-100-listed-trades, assuming 40% pay something:

```
 35 x SEO Starter $99  =  $3,465
 15 x SEO Pro     $199 =  $2,985
  5 x RFP Access  $249 =  $1,245
  5 x Complete    $399 =  $1,995
 ---------------------------------
 60 paying of 100 listed = $9,690 ARR      ARPU across all listed: $97
```

At 250 listed trades on the same mix: **~$24,000 ARR** — the original 100-Pro
target, reached through a mix that doesn't depend on RFP inventory.

**The binding constraint is acquisition, not price.** 19 vendor orgs exist today.
The model says nothing useful until trades are arriving; what it does say is that
each arriving trade is now worth ~$97/yr instead of ~$0 while the board is thin.

## Sequencing

1. **Approve the 7 pending orgs.** Free, no code, 30x the eligible grid.
2. **Fix the Stripe webhook.** Three new SKUs on billing that silently failed for
   customer #1 multiplies the failure.
3. **Build `/trades/[category]/[city]`** behind the 2-vendor gate, with
   `generateStaticParams` emitting only qualifying combos.
4. **Build Verified** — verification record, admin review, badge gating.
5. **Wire the three Stripe prices** and the tier→entitlement mapping.
6. Then RFP supply work (harvest emails, seasonal tender pushes) — because
   tier 2 and 3 stay weak until the board fills.

## What this does not solve

Tiers 1a/1b monetise trades on search presence. That is real, and it buys runway.
It does **not** attract property managers, and it does not fill the board. The PM
side is still won by cost guides, RFP templates on the tender calendar, and the
1,126-contact outreach list. This model funds that work; it doesn't replace it.
