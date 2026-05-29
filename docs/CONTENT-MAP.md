# PMRFP — Sitemap, Structure & Copy

Live: pmrfp.vercel.app · ~15 unique templates, 144 routes.

## Sitemap

```
PUBLIC (marketing)
/                         Homepage
/for-trades               Trades value prop
/for-property-managers    PM value prop
/pricing                  Free + Pro $249
/directory                Vendor list + filters
/directory/[slug]         Vendor profile        (×N vendors)
/rfps                     RFP board (gated)
/rfps/[slug]              RFP detail (teaser/full) (×N rfps)
/resources               Resource hub
/resources/[slug]        Article               (×N)
/contact                  Contact form
/terms /privacy /disclaimer   Legal

SEO PROGRAMMATIC
/trades                   All 39 categories
/trades/[category]        Trade hub             (×39)
/regions                  All 21 regions
/regions/[slug]           Region hub            (×21)
/vs                       Compare index
/vs/[competitor]          Comparison            (×12: merx, vendorpm, bidnet-direct,
                          biddingo, constructconnect, dodge, trustedpros, homestars,
                          angi, planhub, buildingconnected, status-quo)
/for                      Solutions index
/for/[vertical]           Vertical              (×4: builders, tradesmen, sales-teams, investors)

AUTH
/sign-in /sign-up /forgot-password /reset-password /onboarding

TRADE DASHBOARD  /dashboard
  /company /rfps /saved-rfps /interests /billing /settings
PM DASHBOARD  /pm-dashboard
  /rfps /rfps/new /rfps/[id]/interests /saved-vendors
ADMIN  /admin
  /users /organizations /rfps /rfps/new /subscriptions /interests
  /contact-requests /categories /regions /resources /settings /audit-logs

SYSTEM  /suspended  /sitemap.xml  /robots.txt
```

---

## Structure + copy per template

(H1 / sub / sections in order / CTA. Body copy lives in code: `src/lib/site.ts` `COPY.*`, `src/lib/seo/competitors.ts`, `src/lib/seo/verticals.ts`.)

### / (Homepage)
- **H1:** Find Commercial Property RFPs and Get Discovered by Property Decision-Makers
- **Sub:** PMRFP helps Canadian trades, contractors, and service companies get listed, monitor commercial property opportunities, and connect with property managers, builders, and building owners.
- **CTAs:** Join as a Trade Company · Post an RFP
- **Sections:** Hero (+ disclaimer line) → Stats strip [Canada-first · Commercial property focused · Vendor directory · RFP visibility] → Problem ("Commercial property work is relationship-driven — and fragmented" + 4 cards: Fragmented opportunities / Hard-to-reach decision-makers / Manual vendor searches / Missed follow-ups) → Solution (Get Listed / Find RFPs / Express Interest) → Audience split (For trade companies / For property managers) → Category grid → Pricing preview ($249/yr + early-bird) → Final CTA ("Get listed before your competitors do.")

### /for-trades
- **H1:** (trades) get-discovered angle. **Key line:** "Most commercial property opportunities never reach your inbox unless you are already known."
- **Sections:** Hero → Why commercial work matters → How PMRFP helps → What's included (profile, listing, RFP feed, save, express interest, alerts) → Who should join → Pricing teaser → FAQ → CTA. + disclaimer.

### /for-property-managers
- **H1:** post-once / find-vendors / no-obligation angle.
- **Sections:** Hero → Post your project → Find vendors by category + region → Reduce time wasted → Keep details private → No obligation → CTA (Post an RFP / Browse directory). + disclaimer.

### /pricing
- **Cards:** Free (directory listing, no RFP access) · **Pro $249 CAD/yr** (full RFP feed, express interest, priority directory, alerts) — featured. Early-bird banner: "lock in $249/yr — rises to $399 at 100 subscribers."
- **FAQ:** guarantee work? (No) · cancel? (yes, end of period) · Canada-wide? (yes, Ontario/GTA focus) · PMs post free? (yes) · single region ok? (yes). + disclaimer.

### /directory
- **H1:** Find qualified trades for commercial property work
- **Sections:** Hero → FilterBar (category, region, property type, verified, keyword; sort) → result count → vendor card grid / empty state.

### /directory/[slug] (vendor profile)
- **H1:** [Company name] (+ verified badge, city/province)
- **Sections:** Back link → header (logo/initials, name, location, featured) → full description → category badges → facts (years in business, team size, insurance, WSIB) → service regions → property types → sidebar: contact (if show_contact) OR Request Introduction form → "Claim this profile" CTA.

### /rfps
- **H1:** Commercial property RFP opportunities
- **Sections:** Hero → locked banner (if not paid) → FilterBar (category, region, property type, keyword; sort: closing soon / newest) → count → RFP card grid (Locked / Full-access badge) / empty.

### /rfps/[slug] (RFP detail)
- **Teaser (all):** title, category/property-type badges, region, "Closes [date]", summary.
- **Full (paid):** Project scope → Requirements → Budget range (if public) → Submission instructions → Contact (per visibility) → disclaimer. Sidebar: Region/Property type/Closes meta + **Express Interest** + **Save**.
- **Locked (unpaid):** LockedContentPanel — "Subscribe to view the full opportunity" + Join/Activate + pricing.

### /resources + /resources/[slug]
- Index: H1 "Guides for trades and property managers" → article cards.
- Article: title → date → markdown body → CTA section.

### /contact
- **H1:** Get in touch. Form: name, email, phone, organization, "reaching out as" (general / PM needs sourcing / trade question), message. + email link.

### /trades  (category index)
- **H1:** Commercial property trades & service categories → grid of 39 category cards (icon + "Commercial [name] contractors & RFPs") → CTA.

### /trades/[category]  (TEMPLATE)
- **H1:** Commercial [Category] Contractors & RFP Opportunities in Canada
- **Sub:** dual-audience intro (run a [category] company / need a [category] contractor).
- **CTAs:** List your [category] company · View [category] RFPs
- **Sections:** Hero → Open [Category] opportunities (RFP cards) → [Category] companies in the directory (vendor cards) → [Category] by region (links to /regions/*) → FAQ (find RFPs / get listed / guarantee?) → CTA. JSON-LD: Breadcrumb + ItemList + FAQ.

### /regions  (region index)
- **H1:** Commercial property vendors & RFPs by region → grouped by province → region chips.

### /regions/[slug]  (TEMPLATE)
- **H1:** Commercial Property Vendors & RFP Opportunities in [Region]
- **Sections:** Hero (CTAs: Find vendors in [Region] · View [Region] RFPs) → Open opportunities in [Region] → Vendors serving [Region] → Trades in [Region] (category links) → FAQ → CTA.

### /vs  (compare index)
- **H1:** How PMRFP compares → 12 comparison cards.

### /vs/[competitor]  (TEMPLATE)
- **H1:** PMRFP vs [Competitor]
- **Sub:** the honest positioning line (in `competitors.ts` → `angle`).
- **Sections:** Hero (CTAs: Join PMRFP $249/yr · See pricing) → At a glance (comparison table: feature / PMRFP / [Competitor]) → "What [Competitor] is" + best-for + pricing + strengths vs "Where PMRFP wins" → FAQ → trademark/disclaimer line → CTA.
- Angles (one-liners): MERX=government tenders vs private property · VendorPM=enterprise compliance vs discovery-first · ConstructConnect/Dodge/PlanHub/BuildingConnected=new-build leads vs existing-property work · HomeStars/Angi/TrustedPros=residential vs commercial · status-quo=referral lists vs a front door.

### /for  (solutions index)
- **H1:** Built for every side of commercial property → 4 vertical cards.

### /for/[vertical]  (TEMPLATE)
- **H1 (per vertical):**
  - builders → "Find the right subs — fast. Without the cold calls."
  - tradesmen → "Stop waiting for the phone to ring."
  - sales-teams → "Your next commercial contract is already posted."
  - investors → "Your portfolio deserves better vendors than whoever answers first."
- **Sections:** Hero (positioning + 2 CTAs) → The problem today (pain cards) → How PMRFP helps (value-prop cards) → feature chips → FAQ → disclaimer → CTA. (All copy in `verticals.ts`.)

### Auth
- /sign-in: "Welcome back" + email/password + forgot link.
- /sign-up: "Join PMRFP" + role picker (I'm a trade company / I manage-own-build properties / I'm just browsing) + name/email/password + signup disclaimer.
- /onboarding: trade = company basics + categories + regions + contact visibility; PM = basics; browsing = "Start browsing".

### Trade dashboard (/dashboard…)
- Home: stat cards (Subscription, Profile completion %, Matching RFPs, Saved, Interests, Profile views) + upgrade card (if free) + profile checklist + recommended next action.
- /company: full profile form. /rfps: feed (locked if free). /saved-rfps. /interests: table w/ status. /billing: plan + Activate/Manage. /settings.

### PM dashboard (/pm-dashboard…)
- Home: stat cards (Active RFPs, Pending review, Interested vendors, Saved vendors) + "Post an RFP" CTA.
- /rfps: own RFP table. /rfps/new: post-RFP form. /rfps/[id]/interests: interested vendors table. /saved-vendors.

### Admin (/admin…)
- Overview: KPI cards (users, active subscribers, ARR, signups 30d, pending profiles, pending RFPs, published RFPs, interests).
- Tables: users, organizations, rfps (+new), subscriptions, interests, contact-requests, categories, regions, resources, settings, audit-logs.

---

## Canonical copy locations (don't reword the disclaimers)
- Tagline / nav / footer / disclaimers: `src/lib/site.ts` (`SITE`, `PRICING`, `COPY`, `*_NAV`, `FOOTER_COLS`)
- Competitor copy: `src/lib/seo/competitors.ts`
- Vertical copy: `src/lib/seo/verticals.ts`
- Demo content (vendors/RFPs/resources): `src/lib/demo-data.ts`
