# PMRFP — Marketing Team Handoff Pack

> **Forward this whole doc to the marketing team / Rems / anyone helping launch.**
> It's everything they need to take PMRFP from "soft-launch ready" to "paid traffic on" without breaking the brand or making a false claim.
> Last updated: 2026-05-31 · Owner: Rishon (R. Talkar publicly)

---

## 0. The 30-second context (read this first)

PMRFP.com is a **Canada-first, two-sided B2B platform** for commercial & residential **property** work:
- **Property managers / building owners / condo boards** post RFPs **free**.
- **Trades** (electricians, HVAC, roofers, etc.) pay **$249/yr or $29/mo** to get listed + see/bid on those RFPs.
- We are **not** a homeowner lead-gen site (that's HomeStars/TrustedPros — we attack that positioning). Commercial-serious only.

**Current state:** Product is live at **pmrfp.vercel.app** (real database, payments wired). $0 revenue, 0 paying users yet, 7 real RFPs on the board. The job now is **supply (trades) → measurement → paid traffic.**

**The marketing team's mission for "next stage":** help seed the supply side, stand up the measurement/ad stack, and start the first surgical ad + content push — **without** spending a dollar of ad budget until the plumbing and tracking are confirmed live.

---

## 1. ✅ Access & accounts the team needs (Rishon to grant)

Marketing can't start until they can see and touch these. Check each off as you grant access:

- [ ] **Live site** — pmrfp.com (after DNS cutover) / pmrfp.vercel.app today
- [ ] **Google Analytics 4** — add team as Editor *(account TBD — see Blocked §6)*
- [ ] **Google Search Console** — verified property + Full user access
- [ ] **Google Ads account** — admin/standard access *(create if not existing)*
- [ ] **Meta Business Manager** — Pixel + ad account access
- [ ] **LinkedIn Campaign Manager** — Insight Tag + ad account
- [ ] **PostHog** (product analytics / funnels / session replay) — team member invite
- [ ] **GHL (CRM)** — read access to the PMRFP sub-account pipeline
- [ ] **Brand asset folder** — logos, palette, fonts (see §3)
- [ ] **Notion** — PMRFP marketing board (create one, or a shared section)
- [ ] **This repo's `/briefs` folder** — outreach packs, cost-guide data, roadmap

> ⚠️ **Do NOT give anyone the Supabase service key, Stripe secret key, or Vercel env vars.** Those stay with Rishon/dev only.

---

## 2. ✅ The marketing work to OWN (organized by the launch sequence)

This maps 1:1 to `briefs/roadmap-to-live.html`. Marketing owns the **bold** items; dev/Rishon owns the plumbing.

### Stage A — Measurement (do FIRST, before any spend)
- [ ] **Install GA4** + tag the 7 events: `signup_started`, `signup_completed`, `rfp_posted`, `interest_expressed`, `checkout_started`, `checkout_succeeded`, `referral_submitted`
- [ ] **Drop Meta Pixel + LinkedIn Insight Tag**; fire `Lead` on signup, `Purchase` on checkout
- [ ] **Google Ads conversion tracking** imported from GA4 (so it optimizes for customers, not clicks)
- [ ] **Verify Search Console + submit `/sitemap.xml`** (207+ routes deserve indexing)
- [ ] **Write & enforce a UTM convention** → save as `briefs/utm-convention.md`. Every paid/organic/outreach link uses it from day one.

### Stage B — Supply seeding (the marketplace law: trades before PM ads)
- [ ] **Run the electrician outreach pack** in `briefs/outreach/` — 3 cold-email variants, LinkedIn DM, phone script, GTA target list, tracking CSV. **Target: 25 trades.** Don't redesign it — execute it.
- [ ] **Work the Ontario PM list** — `briefs/outreach/pm-list-ontario.xlsx` (Tier-A in `pm-list-ontario-tier-A.csv`) for the demand side once supply > 15 trades.
- [ ] **Clone the outreach pack for trade #2** (plumber or HVAC) only after 10 electricians are in.
- [ ] **Announce both referral lanes** to signed-up trades (trade lane = $75 cash; project lane = recognition/leaderboard). One email when Resend is live.

### Stage C — Content & organic (compounding, start in parallel)
- [ ] **SEO content is already built** — 20 RFP templates, 10 cost guides, 5 vertical pages, /vs competitor pages. Marketing's job: **promote them, build links, keep them fresh** — not rebuild them.
- [ ] **R. Talkar founder launch post** on LinkedIn — quiet, confident, "built the property RFP tool I wanted when I ran our buildings." Link in first comment, no hype.
- [ ] **Social drumbeat** — LinkedIn-first, prestige B2B voice (the `pmrfp-social` agent drafts Mon/Wed/Fri once email infra is live).
- [ ] **Partnership intros** — BOMA / ACMO / REIC. Member-list access >> ad spend. (The `pmrfp-bizdev` brief surfaces 3/week.)

### Stage D — Paid (small, surgical — only after A–C are real)
- [ ] **Google Ads: 2 search campaigns, $25/day cap.** A = PM intent ("rfp software for property managers", "commercial maintenance RFP") → /for-property-managers. B = Trade intent ("commercial electrician leads Toronto") → /for-trades.
- [ ] **LinkedIn: 1 single-image ad, $25/day** to PM/REA/Asset-Manager titles in ON. One message: *"Stop chasing 5 quotes by email."*
- [ ] **Meta retargeting** — quiet pixel pool (visited /rfp-templates or /cost-guides, didn't sign up). Activate $10/day only once audience > 500.
- [ ] **Weekly Friday review:** CAC per channel, signup→paid rate, trade vs PM cohort. **Kill any channel above $200 CAC by week 3.**

---

## 3. ✅ Brand kit (so everything looks like one company)

- **Colors:** Indigo `#282B59` (primary) · Teal `#91F2CF` (accent) · Ink `#0D0D0D` · BG `#F5F7FB`
- **Fonts:** Poppins (headings) · Lato (body) · IBM Plex Mono (eyebrows/labels)
- **Logo files:** in repo at `public/brand/` (mark, wordmark, lockup SVGs)
- **Voice:** Premium, calm, commercially serious. **Never** breathless launch-hype. Think "the professional standard," not "🚀 we're live!!!"
- **Eyebrow style:** mono, uppercase, wide letter-spacing, teal.
- **Buttons:** pill-shaped. Teal button = indigo text (not white).
- **Naming:** Public byline is **R. Talkar**, brand bridge line "from the team behind PermitClub" is allowed in footer only.

---

## 4. ✅ Positioning & messaging one-pager (don't go off-message)

**One-liner:** *The RFP + verified-trade platform for Canadian commercial & residential property.*

**For property managers:** Post one RFP, get competing bids from serious, insured commercial trades — instead of chasing five quotes by email.

**For trades:** Get found by the property managers who actually have commercial budgets and recurring work. $249/yr, not per-lead.

**Why we win (use these):**
- Commercial/residential **property** focus — not homeowner lead-gen.
- **Verified, insured** trades (insurance verification flow coming) — credibility the directory sites don't have.
- Canada-first, bilingual coming (EN/FR).
- Flat annual price, no pay-per-lead gouging.

**Proof points we can use today:** 7 real RFPs live, real founding-cohort companies, programmatic SEO depth, honest competitor comparisons (MERX, ConstructConnect, TrustedPros).

---

## 5. 🚦 Claims & legal guardrails (READ — protects us from blowback)

### The "Bill 91" / regulation angle — APPROVED language vs BANNED language

✅ **You MAY say:**
- "Ontario condo law (Bill 91) is modernizing condo governance and pushing toward more transparent, competitive procurement."
- "The industry is professionalizing — property managers are expected to run fair, documented bid processes. PMRFP makes that effortless."
- "Get ahead of where property procurement is heading."

❌ **You may NOT say:**
- "The law **requires** condos to run an RFP / use PMRFP." *(The binding procurement-threshold regulations are not fully in force — this is false and a property manager will call it out.)*
- "Bill 91 **mandates** competitive bidding above $X." *(Threshold rules are still pending regulation.)*
- Any claim that implies legal non-compliance for not using us.

### Other claim rules
- **Trade/prompt-payment angle** (for the trade side): you may reference that prompt-payment laws now exist across Ontario/BC/Alberta and "serious commercial work deserves a serious platform." Don't claim PMRFP enforces or guarantees payment — it doesn't.
- **No fake scarcity / fake testimonials / fake counts.** Social-proof counters pull only real (non-demo) data. Keep it that way.
- **"Verified ✓" badge** may only be used once the insurance-verification flow ships. Don't market "verified trades" before then.
- **Pricing:** $249/yr or $29/mo CAD. Early-bird line ("lock in $249, rises to $399 at 100 subs") is approved. Featured tier $599/yr.
- **No refunds.** Subscriptions are non-refundable; members cancel anytime and keep access to the end of the paid period. (Founder decision 2026-06-05 — do NOT use "money-back guarantee" anywhere.)

> When in doubt on any external claim, route it past Rishon. For anything touching law/regulation, accuracy beats punch.

---

## 6. 🔴 Blocked on Rishon/dev (marketing depends on these — track them)

Marketing **cannot fully launch** until the Phase-1 plumbing lands (~50 min of Rishon's time). Flag these to him:

- [ ] **DNS cutover** pmrfp.com → Vercel *(can't run ads to a .vercel.app URL)*
- [ ] **Resend wired + domain verified** *(no transactional/marketing email until then — biggest conversion leak)*
- [ ] **Stripe flipped to LIVE** *(no real revenue until then)*
- [ ] **GHL sub-account stood up** + env vars *(CRM is dark without it)*
- [ ] **1 SQL migration** applied *(REA signups error without it)*
- [ ] **Decide which Google/Meta/LinkedIn ad accounts** we use (new vs existing TCG) and grant access
- [ ] **Terms / Privacy / Refund pages** reviewed *(required for Stripe live + Google Ads policy)*

Full interactive checklist: `briefs/roadmap-to-live.html` and `briefs/monetize-checklist.html`.

---

## 7. 🎯 Definition of "next stage" (what success looks like)

We've moved to the next stage when **all** of these are true:
1. Measurement stack live & verified (GA4 + pixels + Search Console + UTMs).
2. **25 trades** in the directory (supply seeded).
3. DNS + Resend + Stripe-live + GHL all green.
4. First $50/day ad test running with **known CAC per channel**.
5. First paid trade subscription processed end-to-end.

**Milestone gate:** 30 paid trades → unlocks the mobile app build.

---

## 8. Files the team should bookmark

| File | What it is |
|---|---|
| `briefs/roadmap-to-live.html` | Interactive phase-by-phase launch checklist |
| `briefs/monetize-checklist.html` | The ~50-min plumbing checklist (Rishon's) |
| `briefs/outreach/` | Electrician recruit pack (emails, DM, phone, list, CSV) |
| `briefs/outreach/pm-list-ontario.xlsx` | Ontario property-manager target list (Tier-A flagged) |
| `briefs/handoff-2026-05-31.md` | Full product state / what shipped |
| `src/lib/seo/rfp-templates.ts` · `cost-guides.ts` · `verticals.ts` | The SEO content engine (already built — promote, don't rebuild) |

---

*Questions on product state → Rishon. Questions on claims/legal → Rishon (esp. Bill 91 / regulation). Everything else → own it and move.*
