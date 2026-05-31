# PMRFP on GoHighLevel — 30-minute Setup Playbook

> Sets up PMRFP's CRM, pipelines, automations, and PMRFP↔GHL integration.
> Code on PMRFP side is already shipped behind two env vars
> (`GHL_API_KEY` + `GHL_LOCATION_ID`) — once you add them in Vercel, every
> PMRFP signup / onboarding / subscription / RFP event syncs into GHL
> automatically.

## Order of operations (do these in this exact order)

1. **Sub-account** (5 min)
2. **Custom fields** (5 min) ← integration depends on these existing
3. **Pipelines** (15 min)
4. **Generate API key** (1 min)
5. **Paste API key + Location ID into Vercel** (2 min) ← turns the integration ON
6. **Automations** (20 min) — most important sequences described below

---

## 1. Sub-account

In your agency-level GHL dashboard:
- Create new sub-account: **"PMRFP"**
- Type: SaaS / Vertical (whichever your plan supports)
- Industry: Construction / Trades
- Brand colors:
  - Primary: `#282B59` (indigo)
  - Accent: `#91F2CF` (teal)
- Domain: `crm.pmrfp.com` (CNAME later) OR use the default GHL subdomain for now
- Phone: your business line
- Email: `hello@pmrfp.com`

---

## 2. Custom fields (Contact-level)

Settings → Custom Fields → Contacts → **Add Field** × 8:

| Field name | Type | Key (lowercase, no spaces) | Notes |
|---|---|---|---|
| PMRFP Role | Dropdown | `pmrfp_role` | Options: `trade`, `supplier`, `property_manager`, `real_estate_agent`, `visitor`, `referrer` |
| PMRFP Org ID | Text | `pmrfp_org_id` | The Supabase `organizations.id` UUID — primary join key |
| PMRFP Org Slug | Text | `pmrfp_org_slug` | Easy human reference |
| PMRFP Org Name | Text | `pmrfp_org_name` | Human-readable name |
| PMRFP City | Text | `pmrfp_city` | |
| PMRFP Province | Text | `pmrfp_province` | |
| PMRFP Trade Category | Text | `pmrfp_category` | E.g. "Electrical" |
| Subscription Status | Dropdown | `pmrfp_sub_status` | Options: `none`, `trial`, `active`, `past_due`, `canceled` |
| Profile Completion % | Number | `pmrfp_profile_pct` | 0-100 |
| Referrer Name | Text | `pmrfp_referrer_name` | Who introduced them |
| LTV Estimate (CAD) | Number | `pmrfp_ltv_estimate` | Computed: $249 × years remaining |

**Important:** the keys must match exactly. The integration code in `src/lib/ghl/sync.ts` references these by key. If you rename them in GHL, also rename in the code.

---

## 3. Pipelines (4 of them)

Settings → Pipelines → **+ Create Pipeline**

### 3.1 Trade Pipeline (the most important — directly tied to $249/yr revenue)

| Stage | When to move here |
|---|---|
| 01 — Cold lead | Trade identified, not yet contacted (manual entry from /briefs/outreach/target-list.md) |
| 02 — Outreach sent | First cold email or LinkedIn DM fired |
| 03 — Replied | They responded |
| 04 — Demo booked | 15-min intro call scheduled |
| 05 — Signed up (free) | Auto: created PMRFP account but no Pro |
| 06 — Profile completed | Auto: profile_completion_score ≥ 80 |
| 07 — Trade Pro activated 💰 | Auto: Stripe subscription = active |
| 08 — Renewing | Auto: 30 days before renewal |
| 09 — Churned | Auto: subscription = canceled / past_due > 7 days |

### 3.2 Project Referral Pipeline (for /refer-a-project submissions)

| Stage |
|---|
| 01 — New referral (just submitted) |
| 02 — Owner contacted |
| 03 — RFP drafted |
| 04 — Pending review |
| 05 — Published live ⭐ |
| 06 — Awarded |
| 07 — Closed (no award) |

### 3.3 PM Activation Pipeline (for property managers we want to activate)

| Stage |
|---|
| 01 — Signed up |
| 02 — Profile completed |
| 03 — First RFP posted ⭐ |
| 04 — Repeat poster (≥3 RFPs in 60 days) |
| 05 — Power user (≥10 RFPs total) |
| 06 — Dormant (no posts in 90 days) |

### 3.4 Partnership Pipeline (for BizDev — BOMA, ACMO, associations, integrations)

| Stage |
|---|
| 01 — Identified |
| 02 — Outreach sent |
| 03 — Replied |
| 04 — Meeting booked |
| 05 — Proposal sent |
| 06 — MoU signed |
| 07 — Live partnership |
| 08 — Paused |

---

## 4. API key + Location ID

1. GHL → Settings → **Business Profile** → copy the **Location ID** (looks like `xY8aB9k...`)
2. GHL → Settings → **API Keys** → **+ Generate API Key**
   - Name: `pmrfp-production-integration`
   - Scopes: `contacts.write`, `contacts.read`, `opportunities.write`, `opportunities.read`, `pipelines.read`
   - Copy the key (you can only see it once)

---

## 5. Vercel env vars

In Vercel → PMRFP project → Settings → Environment Variables → Add **3 vars**:

```
GHL_API_KEY=<the_api_key_from_step_4>
GHL_LOCATION_ID=<the_location_id_from_step_4>
GHL_PIPELINE_TRADE_ID=<copy the Trade Pipeline ID from GHL pipeline URL>
```

Optional (for richer pipeline auto-staging):
```
GHL_PIPELINE_PROJECT_REFERRAL_ID=<...>
GHL_PIPELINE_PM_ID=<...>
GHL_PIPELINE_PARTNERSHIP_ID=<...>
```

Apply to: Production + Preview.

Vercel will auto-redeploy. Once env vars land, every PMRFP event syncs to GHL.

---

## 6. Automations (the 6 most critical — paste into GHL Workflows)

### A. New trade signup welcome sequence

**Trigger:** Contact updated → `pmrfp_role = trade` AND `pmrfp_sub_status = none`

**Sequence:**
- T+0: Email — "Welcome to PMRFP — you're listed (now go Pro)"
- T+1d: Email — "Quick way to look more credible in the directory: add your logo"
- T+3d: Email — "Why Trade Pro is worth $249/yr (3 reasons)"
- T+7d: Email — "Founding-member pricing locks in $249/yr forever"
- T+14d: SMS — "Hey, [first name] — saw you signed up. Any questions about Trade Pro? — Rishon"

### B. Trade-Pro activation thank-you + onboarding

**Trigger:** Contact updated → `pmrfp_sub_status` changed to `active`

**Sequence:**
- T+0: Email — "Welcome to Trade Pro. Three things to do today: [checklist]"
- T+1d: Email — "Did you upload portfolio photos yet? Here's why it matters"
- T+7d: Email — "Your first week as a Pro — here's what you've gotten"
- T+30d: Email — "30-day check-in. Anything we should fix?"
- Internal: Notify admin (Rishon) of new Pro

### C. Trade Pro renewal reminder

**Trigger:** Contact field — 30 days before `pmrfp_subscription_renewal_date`

**Sequence:**
- T-30d: Email — "Your Trade Pro renews on [date]. You've gotten [X] RFP responses this year."
- T-14d: Email — "Renewal in 2 weeks. Anything we can do better?"
- T-7d: Email — "Renewing next week — heads up"
- T+0: System charges via Stripe (PMRFP handles)
- T+1d (if charge fails): Email — "Your renewal didn't go through. Update your card?"

### D. PM activation nudge (signed up but no RFP posted)

**Trigger:** Contact created → `pmrfp_role = property_manager` AND no RFP posted in 7 days

**Sequence:**
- T+7d: Email — "You signed up but haven't posted an RFP yet. Try a template: [link to /rfp-templates]"
- T+14d: Email — "Still here? Want help drafting your first RFP? Reply and I'll do it"
- T+30d: Email — "Final nudge. Is this something we should fix?"

### E. Project referral acknowledgment + admin alert

**Trigger:** Contact created → tag = `project-referral`

**Sequence:**
- T+0: Email to referrer — "We received your referral. Here's what happens next"
- T+0: Internal — Notify admin (Rishon) with project details
- T+1d: Internal task — "Follow up with property contact"

### F. Trade referral acknowledgment + admin alert

**Trigger:** Contact created → tag = `trade-referral`

**Sequence:**
- T+0: Email to referrer — "We received your trade referral. $75 when they activate Pro"
- T+0: Internal — Notify admin with trade details
- T+1d: Internal task — "Reach out to referred trade"
- T+7d (if trade hasn't been contacted): Reminder task

---

## 7. Calendars

Calendars → **+ New Calendar** × 2:

### A. "Book a 15-min PMRFP demo" — for hand-recruited trades + institutional PMs
- Duration: 15 min
- Availability: weekdays 10am-4pm ET
- Buffer: 5 min before/after
- Embed code: drop on `/for-trades` + `/for-property-managers` pages (as v2 enhancement)

### B. "Founder office hours" — pre-launch tier
- Duration: 30 min
- Availability: Tuesdays + Thursdays 2-4pm ET
- Use for: Trade Pro paying customers + REA partners
- Embed: trade dashboard

---

## 8. Forms

GHL hosts forms too, but PMRFP itself handles signup. **One** GHL form to host:

### "Refer a Project — Partner Intake"
- For trade associations / brokerages signing up as referral partners (not individual referrers — those use /refer-a-project)
- Fields: organization, contact, # of expected referrals/month, expected category mix
- On submit: create Contact w/ `pmrfp_role = referrer`, tag `partnership-prospect`, add to Partnership Pipeline at stage 01

---

## What the integration on PMRFP side does (automatic)

When you set `GHL_API_KEY` + `GHL_LOCATION_ID` in Vercel, these events auto-sync:

| PMRFP event | GHL effect |
|---|---|
| User signs up | Upsert contact with `pmrfp_role`, email, name; tag `pmrfp-signup` |
| Onboarding complete | Update contact: `pmrfp_org_id`, `pmrfp_org_slug`, `pmrfp_org_name`, `pmrfp_city`, `pmrfp_province`, `pmrfp_category`; if trade → move to Trade Pipeline stage 06 (Profile completed) |
| Stripe webhook → Trade Pro active | Update `pmrfp_sub_status = active`; move to Trade Pipeline stage 07 |
| Stripe → canceled | Update `pmrfp_sub_status = canceled`; move to Trade Pipeline stage 09 |
| PM posts RFP | If first RFP → move PM to PM Pipeline stage 03 |
| RFP published live | If from a referrer → notify GHL "project referral published" |
| /refer-a-project submission | Create contact tag `project-referral`, add to Project Referral Pipeline stage 01 |
| /refer-a-trade submission | Create contact tag `trade-referral`, add to Trade Pipeline stage 01 as a cold lead with referrer reference |

All fail silently if GHL env vars aren't set. Won't break the app.

---

## Smoke test (after setup)

1. Sign up a test user on pmrfp.vercel.app
2. Go to GHL → Contacts → search by the test email — should appear with `pmrfp_role` and `pmrfp-signup` tag
3. Activate Trade Pro via Stripe test mode (card 4242)
4. GHL contact's `pmrfp_sub_status` should flip to `active` within ~30 seconds (after Stripe webhook)
5. Check the Trade Pipeline — the opportunity should be at stage 07

If anything's off, check Vercel function logs — GHL sync errors log but don't throw.

---

## Future v2

- 2-way sync: GHL pipeline stage changes (admin moves a deal) → updates PMRFP org's internal_notes
- GHL phone/SMS via Twilio → outreach SMS from PMRFP dashboard
- Conversation AI for the cold-trade replies
- Workflow templates (export GHL workflows as JSON for portability)
