# GC Hub growth — what's live, what's missing, what to do next

*2026-10-09. Numbers are from the public `rfp_public` view on 2026-10-08 (the same rows anyone sees on pmrfp.com). Nothing private was queried.*

## The short version

The GC Hub has all its plumbing and none of its traffic. **Zero sub-trade packages have ever been published.** Meanwhile the board already holds **963 real public contract awards** (Oct 2025 to Oct 2026) naming **698 different winning companies**, and **166 of those awards landed in the last 30 days**. That award data is the asset. Right now most of it is invisible to the two people who should care:

- **A contractor who just won public work** can only find themselves on PMRFP if they won twice (111 companies have a page; the other 587 don't), and the page they land on is in the old design with the "post your packages" ask buried in a sidebar.
- **A subcontractor** has no page that answers "who just won work in my trade and region, so I can call them?" That list only exists in the admin panel (`/admin/gc-leads`), for Rishon's outreach.

So the plan is: put the award data in front of both sides, on public pages, and make every one of them end in "post a package" (for the GC) or "get these in your inbox" (for the sub).

## What is live today

| Piece | Where | State |
|---|---|---|
| Post a package | `/gc-packages/new` → sign-up → confirm email → onboarding → form → admin review | Works. Long: 5 steps before the GC sees the form. |
| Package = a normal RFP row | `rfp_posts.source_type = 'gc_package'` + `gc_project_name`, `awarded_rfp_id` | Migration `20260924000002` **has run** in production (the columns are readable). |
| Packages on the board | `/rfps?view=gc`, cards badged "GC sub-trade package" | Works. Empty: 0 published. |
| Packages emailed to subs | Daily Trade Pro digest (packages are RFP rows, matched by trade + region) | Works. |
| "Recently awarded near you" in the digest | `lib/alerts/awards.ts`, up to 3 awards per Pro member | Works, Pro only, only on days the member also gets RFPs. |
| Award notice pages | `/rfps/<award-slug>` (963 of them) | Show who won, value, packages posted for that contract, and a "Won this contract? Post your sub-trade packages" box. **Not indexed** (only open RFPs are). |
| Contract-winner profiles | `/contract-winners/<slug>` | Only for companies with **2+ awards: 111 pages**. Old marketing design. One generic package CTA. |
| Contract-winner list | `/contract-winners` (v3) | Lists the 111. |
| Monthly winner reports | `/reports/contract-winners/<yyyy-mm>` | Live, v3. |
| GC lead list | `/admin/gc-leads` (admin only) | 145 non-national, non-public-body winners in the last 30 days; 354 in 90 days. Hand-emailed. |
| GC landing page | `/for/general-contractors`, `/for/builders` | Live. Its "See who just won public work" button goes to the 2+ winner list. |

### The real numbers

- 1,504 public listings; 507 open.
- 963 past public contract awards, all with a named winner: Quebec SEAO 390, Nova Scotia 307, CanadaBuys 240, City of Toronto 26. Canada only; there are no U.S. award feeds yet.
- 908 of the 963 name a company; the other 55 look like individuals or placeholders and are never named.
- 698 distinct companies won. 111 won twice or more (they have pages). **587 won once and have no page.**
- 196 companies won work tagged General Contracting.
- Busiest regions by winning companies: Quebec 283, Nova Scotia 185, Montreal 56, federal/"Canada" 53, Toronto 28, Ottawa 23.
- Busiest trades by winning companies: General Contracting 196, Snow Removal 107, Roofing 74, Cleaning 65, Concrete & Asphalt 58, Electrical 54, HVAC 54.
- Awards per month are rising: 49 (Oct 2025) → 149 (Aug 2026) → 217 (Sep 2026).
- GC packages published, ever: **0**.

## What's missing

1. **A front door.** There's no "GC Hub" page. A GC or a sub has nowhere that explains the two-sided idea and shows live activity.
2. **The sub-side hook.** "These contractors just won work in your trade and region" is the single most useful thing the award data can tell a sub, and it is only in the admin panel and (3 rows max) in the Pro digest.
3. **A page for every winner.** 587 of 698 winners have no profile, so an outreach email to most of them can't say "here's your page."
4. **A GC-shaped ask on the profile.** The current profile's "Is this your company?" button signs them up as a *trade* listing, not as a contractor posting packages.
5. **Posting friction.** A GC must create an account, confirm an email and fill in onboarding before seeing the package form.
6. **A real "claim."** Nothing links a signed-up GC to the award history we show for them. That needs a table and a verification step.

## Ranked moves

Ranked by how much they grow *both* sides per unit of effort, product-only first.

1. **GC Hub page (`/gc-hub`) — build now.** One public page: open sub-trade packages (real posts only, empty state when there are none), "contractors who just won public work" for the last 90 days filterable by trade and province, each row labelled with its source and linked to the official notice, and the GC ask ("Won public work? Post your packages free"). Gives subs a reason to visit today, from data we already have; gives GCs and outreach emails one link to send people to.
2. **A profile for every winner, in v3 — build now.** Extend `/contract-winners/<slug>` from 111 to all 698 companies with real award history. Every award row shows its source and official notice. A GC panel replaces the trade "claim": post a package for any of *these* contracts (prefilled), plus any packages already posted for them. Single-award pages are `noindex` (thin) and stay out of the sitemap; the 111 multi-award pages keep their URLs and stay indexed. Every award notice page now links to its winner's profile.
3. **Draft-first posting — build next.** Let a GC fill in the package before making an account; the draft rides through sign-up in auth metadata (like `gc_award` does today) and is waiting, prefilled, after onboarding. Biggest conversion lever on the GC side, but it touches sign-up, Google sign-in and onboarding, so it deserves its own PR and testing.
4. **Sub dashboard + digest link to the hub — dashboard part built now, digest next.** On the trade dashboard, "Contractors who just won public work in {trade}" with the 90-day count, linking to `/gc-hub` filtered to their busiest trade. Next: in the digest's "Recently awarded near you", link the winner's profile.
5. **Real claim (needs a migration) — later.** `gc_claims(org_id, winner_key, status)`; a GC claims a profile, admin verifies (domain or phone), the profile shows "Verified · posts packages here." Worth it once GCs are actually posting.
6. **GC directory by region — later.** `/contract-winners?province=` style pages exist in spirit already (trade filter). Region landing pages would be thin until there's more Ontario and Western data; revisit when U.S. or more provincial award feeds land.

Moves that need Rishon, not code:

- **Email the 145 recent winners** in `/admin/gc-leads`, now with a link to *their own* profile page (move 2) instead of a generic one.
- **Seed the first real packages.** The board shows "0 open packages" honestly. The first three or four real posts, from GCs Rishon already knows, change how the hub reads more than any feature.

## Rules these pages follow

- Only real award notices and real user posts. No sample GCs, no example packages, no invented counts.
- Every page built from award data names its source (CanadaBuys, SEAO, City of Toronto, Nova Scotia), carries the licence line, and links to the official notice.
- Individuals are counted, never named (existing `isPublishableWinner`).
- Thin pages (a winner with one award) are `noindex`.

---

## Technical appendix

**Data path.** Everything reads `listRfps()` (cached public fetch over `rfp_public`), the same rows as `/contract-winners` and the monthly reports. Winner grouping is `winnersFromRfps()` (`lib/data/winners.ts`, keyed by `winnerKey`). Award date = `deadline` on award notices. Packages = `source_type = 'gc_package'`, linked by `awarded_rfp_id`.

**Official notice links.** The public view has no `source_url`. CanadaBuys award URLs are rebuilt from the slug (`awardNoticeUrl`), exact. SEAO stores a per-notice URL; it's read through a new anon-readable view, `rfp_award_links` (migration `20261009000001_award_links.sql`), which exposes `source_url` for award notices only (award slug suffix + "Awarded …" summary + past date), so open tenders' bid links stay Pro-gated. Toronto and Nova Scotia don't publish a page per award (their stored URL is the portal), so those rows link the official portal and say "Official portal". Until Dev runs the migration, SEAO rows also fall back to the SEAO portal; nothing breaks.

**Slug stability.** `winnersFromRfps(rfps, 1)` assigns slugs to multi-award companies first, so the 111 existing indexed URLs don't change when single-award companies get pages.

**Built in this PR (moves 1, 2 and the dashboard half of 4):**
- `src/lib/gc/hub.ts` — pure: recent wins (90 days), filters, totals, open packages.
- `src/lib/gc/official.ts` — official notice link per award slug.
- `src/app/[lang]/(v3)/gc-hub/page.tsx` — the hub. Indexed; filtered/paged views `noindex, follow`. In the sitemap with fr/es hreflang.
- `src/app/[lang]/(v3)/contract-winners/[slug]/page.tsx` — v3 profile for every winner (replaces the `(marketing)` route). 2+ awards indexed (unchanged URLs), 1 award `noindex`.
- `src/app/[lang]/dashboard/page.tsx` — the trade dashboard card.
- `src/i18n/messages/gcHub.ts` — en/fr/es strings (+ footer and dashboard strings).
- Links: `/contract-winners`, `/for/general-contractors`, every award notice page → its winner's profile, v3 footer.
- Migration `20261009000001_award_links.sql` (read-only view). Optional for the pages to work; needed for exact SEAO notice links. **Dev must run it.**

**Live numbers on the hub at build time (2026-10-08):** 413 awards in the last 90 days, won by 361 companies, 0 open packages. Profiles: 698 companies (111 indexed, 587 new `noindex` pages).
