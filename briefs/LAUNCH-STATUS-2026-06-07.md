# PMRFP — LAUNCH STATUS (2026-06-07)

## 🚀 pmrfp.com is LIVE on Vercel

DNS cut over, SSL issued, latest code + live env vars deployed. Verified live.

### ✅ DONE (verified)
- **DNS cutover**: pmrfp.com → Vercel (ALIAS @ → cname.vercel-dns.com, bypassing
  Hostinger CDN). www → Vercel. MX (mx1/mx2.hostinger.com) + SPF/DKIM untouched —
  email still flows. _dmarc restored (`p=none; rua=mailto:info@pmrfp.com; fo=1`).
- **SSL**: HTTPS 200 on apex + www, valid cert.
- **Code shipped to prod** (master `263e34a`):
  - De-Canadianized core funnel; re-anchored to **GTA beachhead** ("Now live in
    the GTA · Your region next"). Homepage "Canada-first" count = **0**.
  - **OG share card** fixed (was rendering "Canada-first" on every link preview).
  - **No-refund** policy canonical everywhere; **referral** out of nav (footer only);
    referral payout = **30 days after the contractor's payment clears** (chargeback-safe).
  - Hydration "1 Issue" date bug fixed (timeZone:UTC).
  - Geo guardrails: founding-region waitlist UI, markets.ts, liquidity.ts (code live;
    **DB tables pending — see below**).
  - **/llms.txt** live (LLM-readable site map). **/sitemap.xml** = 157 URLs. **/robots.txt** 200.
- **Vercel env**: `NEXT_PUBLIC_SITE_URL=https://pmrfp.com` set + redeployed. Live
  Stripe keys (pk/sk_live) + price IDs + webhook secret all present in Production.

---

## ⏳ REMAINING — YOUR hands (I can't do these safely / they're walled)

1. **Apply the DB migration** (2 min). Your Supabase SQL editor is already open with
   the snippet; OR paste `briefs/prod-migrations-paste.sql` (idempotent, safe to
   re-run) and hit **Run**. Covers: real-estate-agent role, RFP 'expired' status,
   and the geo liquidity + **regional_waitlist** + notification_preferences tables.
   *Until this runs, the founding-region waitlist forms will error on submit. Core
   directory / RFP / checkout flows are unaffected.*

2. **Stripe → point the webhook at the live domain**: set the endpoint URL to
   `https://pmrfp.com/api/stripe/webhook` (Stripe dashboard is walled from me).
   Events: checkout.session.completed, customer.subscription.created/updated/deleted,
   invoice.payment_succeeded. Without this, paid signups won't auto-activate.

3. **Supabase → Auth → URL Configuration**: Site URL `https://pmrfp.com`, redirect
   `https://pmrfp.com/**`. So confirmation/reset links point at the live domain.

4. **$1 live checkout test**: run one real Trade Pro purchase end-to-end, confirm the
   org flips to active in /admin + the webhook fires. (Refund yourself after.)

5. **🔐 ROTATE these exposed secrets** (pasted in chat = burned):
   - Hostinger mailbox password (info@pmrfp.com)
   - Resend API key (`re_...`)
   - Stripe live secret key (`sk_live_...`) — rotate in Stripe, update Vercel env, redeploy.

---

## 🔭 LATER (not launch-blocking)
- Resend domain verification + `RESEND_API_KEY`/`RESEND_FROM` in Vercel (transactional
  email; until then leads still land via fallback).
- Analytics: GA4 / PostHog + Google Search Console (submit sitemap.xml).
- Cloudflare/Turnstile — optional anti-spam; skip for now.
- GHL env vars (`GHL_API_KEY`, `GHL_LOCATION_ID`) — CRM sync lights up when set.

## Notes
- `add-llms-txt` branch was folded into master via cherry-pick (single file). The
  branch is stale (behind master) — safe to delete on GitHub.
- Build verified green locally (tsc clean, 223 static pages) before each push.
