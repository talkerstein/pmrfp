# PMRFP — Going Live

The app runs fully in **demo mode** with no setup. To run it for real you connect three services. Budget ~30 minutes.

Copy `.env.example` → `.env.local` and fill values as you go.

---

## 1. Supabase (database + auth + storage)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **Project Settings → API** — copy into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — server only)
3. Apply the schema. With the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push          # runs everything in supabase/migrations/
   ```
   Then load demo data (optional — skip in production):
   ```bash
   supabase db execute --file supabase/seed.sql
   ```
   *(No CLI? Paste each file in `supabase/migrations/` then `supabase/seed.sql` into the SQL Editor, in filename order.)*
4. **Auth → Providers → Email**: enable email, set "Confirm email" on. **Auth → URL Configuration**: set Site URL to your domain and add `…/onboarding` + `…/reset-password` as redirect URLs.
5. Make yourself an admin: after signing up, run in the SQL Editor:
   ```sql
   update public.users_profile set primary_role = 'super_admin' where email = 'you@example.com';
   ```

The migrations create three Storage buckets (`logos`, `rfp-documents`, `capability-statements`) with policies — no manual storage setup needed.

## 2. Stripe (subscriptions)

1. In the [Stripe Dashboard](https://dashboard.stripe.com), create a **Product**: "PMRFP Trade Pro Annual", recurring **yearly**, **$249.00 CAD**. Copy the **price ID** (`price_…`) → `STRIPE_PRICE_TRADE_PRO_ANNUAL`. *(Optional upsell:* create "PMRFP Featured Annual", yearly, **$599.00 CAD** → `STRIPE_PRICE_FEATURED_ANNUAL`. An active Featured subscription auto-sets the org's priority placement.)*
2. **Developers → API keys** → `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. **Developers → Webhooks** → add endpoint `https://your-domain/api/stripe/webhook`, listening for:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Local testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

**Comp a member without Stripe:** set their org's subscription `status = 'comped'` (admin → subscriptions, or SQL). `has_active_trade_access` treats `comped` as paid.

## 3. Resend (email)

1. Create an account at [resend.com](https://resend.com) and verify a sending domain (e.g. `mail.pmrfp.com`).
2. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `PMRFP <hello@pmrfp.com>`).
3. Optional: `ADMIN_NOTIFICATION_EMAIL` for admin alerts.

Without a key, emails are logged, not sent — nothing breaks.

## 4. Vercel (deploy)

1. Import the GitHub repo at [vercel.com](https://vercel.com).
2. Add every variable from `.env.local` in **Project → Settings → Environment Variables**, plus `NEXT_PUBLIC_SITE_URL=https://your-domain`.
3. Add the custom domain `pmrfp.com`.
4. Deploy. The daily matching-alert cron in `vercel.json` runs automatically. (Optional: set `CRON_SECRET` and Vercel will send it as a Bearer token.)

## Environment variable reference

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; webhooks, admin jobs |
| `STRIPE_SECRET_KEY` | for billing | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | for billing | Verify webhooks |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | for billing | Client Stripe key |
| `STRIPE_PRICE_TRADE_PRO_ANNUAL` | for billing | $249/yr price ID |
| `RESEND_API_KEY` | for email | Resend API |
| `RESEND_FROM_EMAIL` | for email | From address |
| `NEXT_PUBLIC_SITE_URL` | recommended | Absolute URLs, OG, emails |
| `CRON_SECRET` | optional | Protect the alerts cron |
| `NEXT_PUBLIC_GA_ID` | optional | Google Analytics |

## Pre-launch checklist (spec §32)

- [ ] Env vars set in Vercel
- [ ] Migrations applied to the production project; RLS confirmed on
- [ ] Demo seed **excluded** from production (don't run `seed.sql` there)
- [ ] Stripe live keys + live webhook endpoint
- [ ] Resend sending domain verified
- [ ] Legal pages reviewed (terms / privacy / disclaimer)
- [ ] An admin user exists
- [ ] `npm run build` + `npm run test` pass
- [ ] Payment flow smoke-tested end to end
