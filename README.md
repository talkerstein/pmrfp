# PMRFP

**Commercial property RFPs & vendor discovery, built for Canadian trades.**

PMRFP is a Canada-first, two-sided B2B SaaS marketplace:

- **Trade companies** (electricians, HVAC, roofers, snow removal, cleaning, GCs…) get a directory listing and — with **Trade Pro ($249 CAD/year)** — view full RFP opportunities and express interest.
- **Property managers / builders / owners** post RFPs for free and browse the vendor directory.
- **Admins** seed and moderate the marketplace.

> PMRFP is a vendor discovery and RFP visibility platform. It does **not** guarantee project availability, bid success, contract awards, or revenue.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript (strict), React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI), Inter |
| Backend | Supabase — Auth, Postgres, Storage, **RLS** |
| Payments | Stripe (annual subscription) + Billing Portal + webhooks |
| Email | Resend (transactional) |
| Validation | Zod (shared client + server) |
| Tests | Vitest + PGlite (RLS), Playwright (e2e) |
| Hosting | Vercel |

## Demo mode (zero setup)

The app runs **without any credentials**. When Supabase isn't configured it serves from seeded fixtures (`src/lib/demo-data.ts`) so the entire public site — homepage, directory, RFP board, resources — is fully browsable, and the authenticated dashboards/admin are previewable via a demo session.

```bash
npm install
npm run dev          # http://localhost:3000
```

On the RFP detail page in demo mode, toggle between the full member view and the locked visitor view with `?view=locked`.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run start        # serve the production build
npm run typecheck    # tsc --noEmit
npm run test         # Vitest (RLS in PGlite + unit tests)
npm run test:e2e     # Playwright (requires browsers + a running app)
```

## Project structure

```
src/
  app/
    (marketing)/   public site: home, for-trades, for-property-managers,
                   pricing, directory, rfps, resources, contact, legal
    (auth)/        sign-in, sign-up, forgot/reset-password
    onboarding/    role-aware org setup
    dashboard/     trade dashboard (gated: role=trade)
    pm-dashboard/  property-manager dashboard
    admin/         admin back-office (role=admin/super_admin)
    api/           stripe (checkout/portal/webhook), contact,
                   rfp-interest, save-rfp, cron/rfp-alerts
  components/      public/, dashboard/, admin/, forms/, ui/ (shadcn)
  lib/
    supabase/      browser/server/service clients + proxy session
    access/        getSession, requireRole, hasActiveTradeAccess
    data/          directory/rfps/taxonomy/resources (Supabase-or-demo)
    stripe/        server client + subscription sync
    email/         Resend senders (all 7 transactional emails)
    validations.ts Zod schemas
    demo-data.ts   fixtures for demo mode
supabase/migrations/  schema, RLS, storage, reference data
supabase/seed.sql     demo marketplace
test/                 db (PGlite RLS), unit, e2e
```

## Security model

RFP gating — the core monetization wall — is enforced **at the database**:

- Full `rfp_posts` rows are readable only by paid trades, the owning PM, or admins (RLS).
- A postgres-owned `rfp_public` view exposes **teaser columns only** to everyone.
- `has_active_trade_access()` (SQL + mirrored in `src/lib/access`) gates saves and interest submissions.

This is verified offline by `test/db/rls.test.ts` (15 assertions in PGlite with a Supabase auth shim).

## Going live

The product is complete in demo mode. To run it for real, connect Supabase, Stripe, and Resend — see **[docs/SETUP.md](docs/SETUP.md)**. In short: create the three accounts, paste the keys into `.env.local` (template in `.env.example`), apply the migrations + seed, and deploy to Vercel.

---

Built by the team behind [PermitClub](https://permitclub.com).
