# Resend Setup — 10 minute checklist

The 7 transactional emails are fully wired in code. They no-op silently until
you complete these steps. Once done, every user-visible email flow on PMRFP
goes live.

## What's wired (already in code, awaiting your API key)

| Email | When it fires | Who gets it |
|---|---|---|
| Welcome | After signup | New user |
| Subscription Activated | After Stripe webhook fires | New paid trade |
| New Matching RFP Alert | When cron matches a new RFP to a trade's filters | Trade |
| Interest Confirmation | When trade expresses interest in an RFP | The trade |
| **PM New Interest** *(new — Quest 1.7 bonus)* | When trade expresses interest | **The PM who posted the RFP** |
| RFP Published | When admin approves a PM's RFP | The PM |
| Admin: New RFP Pending Review | When PM submits RFP | Admin inbox |
| Admin: New Vendor Interest | When trade expresses interest | Admin inbox |
| Admin: New Contact Request | When anyone fills /contact form | Admin inbox |

## Setup steps (your hands required)

### 1. Sign up for Resend (free tier)
- Go to https://resend.com/signup
- Free tier: 100 emails/day, 3,000/month — plenty for soft launch
- Upgrade to $20/mo once you cross 3,000/mo

### 2. Verify your sending domain (this is the slow step — ~30 min DNS propagation)
- Resend dashboard → Domains → Add Domain → enter `pmrfp.com`
- Add the 3 DNS records they show you (DKIM + SPF + DMARC) at your domain registrar
- Wait for "Verified" status (usually 5-30 minutes)
- **Until verified, emails will FAIL.** If you want to test immediately, use the
  Resend-provided `onboarding@resend.dev` sender (works without domain
  verification — just set `RESEND_FROM_EMAIL=onboarding@resend.dev`).

### 3. Generate API key
- Resend dashboard → API Keys → Create API Key
- Name it `pmrfp-production`
- Copy the `re_...` key (you can only see it once)

### 4. Add to Vercel env vars
In Vercel project → Settings → Environment Variables, add:

```
RESEND_API_KEY=re_...          (the key from step 3)
RESEND_FROM_EMAIL=PMRFP <hello@pmrfp.com>   (or onboarding@resend.dev for test)
ADMIN_NOTIFICATION_EMAIL=your@email.com     (where admin alerts go — your inbox)
```

Apply to: Production + Preview (not Development unless you want test emails locally)

### 5. Redeploy
Vercel will auto-redeploy with the new env vars within ~60 seconds of saving.

### 6. Smoke-test (3 minutes)
- Go to pmrfp.vercel.app, hit Contact, fill the form → should land in your
  ADMIN_NOTIFICATION_EMAIL inbox within 30 sec
- Sign up a new test PM with a real personal email → Welcome email should land
- That's enough to validate everything works

## What happens if you skip this

Emails silently log to console (no-op). Users don't get confirmations. PMs
don't know vendors are interested. Soft launch works but feels broken.

**Estimated impact of skipping:** 30-40% drop in trade-PM connection rate
(based on industry benchmarks for marketplaces).

## What happens if domain verification fails

Two paths:
1. **Quick fix:** Set `RESEND_FROM_EMAIL=onboarding@resend.dev` in Vercel — emails
   go out from Resend's shared sender, look slightly less professional but work
   immediately. Acceptable for soft launch.
2. **Right fix:** Re-check the DNS records you added. Most failures are
   `selector._domainkey.pmrfp.com` records not being added correctly. Their
   support resolves these in <1 hour.

## What's NOT wired yet (future quests)

- Daily/weekly RFP digest (Quest 3.2)
- Saved-search alerts (Quest 3.1)
- Renewal reminder (Quest 3.7)
- Subscription cancelled / payment failed (Stripe handles, but our copy isn't tuned)

Those land later. The 9 above are the launch-blocker set.
