# Directory Pro Pass + SEO/Schema — Design Spec

**Date:** 2026-06-09
**Page:** `pmrfp.com/directory` (+ `/directory/[slug]`)
**Goal:** Make the directory look and feel pro so the ~25 PMs just cold-emailed (who will click through) *trust it enough to post an RFP*. Demand-conversion, not feature-creep. Build tight.

## Context (what already exists — do NOT rebuild)
- **Logo upload works**: `LogoUploader` (`src/components/forms/logo-uploader.tsx`) → `logos` Supabase bucket → `organizations.logo_url`. Self-serve at `/dashboard/company` (role `trade`). Currently: 2 MB cap, **no dimension control**.
- **Schema exists**: detail page renders `localBusinessSchema` + `breadcrumbSchema` from `@/lib/seo/jsonld`, and has `generateMetadata`.
- **Trust data exists on `organizations`**: `verified`, `featured`, `yearsInBusiness`, `employeeCountRange`, `insuranceStatus`, `wsibStatus` — shown on detail page, NOT on cards.
- **OG-image pattern exists**: `src/app/(marketing)/rfps/[slug]/opengraph-image.tsx` (copy this approach).
- **RFP posting exists**: `src/app/pm-dashboard/rfps/new/page.tsx` (PM posts a project).
- Stack: Next.js 16.2.6, Tailwind 4, shadcn/ui, teal+indigo tokens. Mutations = server actions; uploads = browser → Supabase Storage.

## Scope — 5 items

### 1. Square 250×250 logos (the ask)
- **`LogoUploader`**: before upload, draw the picked image onto a 250×250 `<canvas>` (contain-fit, centered, transparent/white bg), export a WebP (fallback PNG) Blob, upload *that* (not the raw file). SVGs pass through untouched (already vector). Keep the 2 MB input guard for pre-processing memory safety.
  - Result: every stored raster logo is exactly 250×250 → uniform grid.
  - Update `helpText` to: "Any size, we'll fit it to a clean 250×250 tile. PNG, JPG, WebP, or SVG."
- **Display** (`directory-card.tsx` + `[slug]/page.tsx`): show logos in a **white tile, thin border, `object-contain` with small padding** (not the current indigo-bg square) so transparent/odd-shaped logos look crisp and consistent. Initials fallback keeps the indigo treatment.
- *Non-goal:* interactive crop/zoom UI (contain-fit auto is enough for v1).

### 2. Trust band
- **Cards** (`directory-card.tsx`): add a compact trust row surfacing existing data — `verified` → "Verified" chip with `BadgeCheck`; if `insuranceStatus`/`wsibStatus` present → small "Insured"/"WSIB" chips; `yearsInBusiness` → "Xyrs" chip. Keep it to ≤3 chips, subtle.
- **"Verified by PMRFP"** tooltip (detail page header + card chip): one-line "We confirm licensing, insurance, and a real business presence before listing." (native `title`/lightweight tooltip; no new dep).
- **Directory header stat**: replace/augment the count line with "{N} verified trades across Ontario · {M} trade categories" using counts from the existing query.
- *Non-goal:* new credential fields / CMRAO-ACMO chips (no data for it yet) — use only existing columns.

### 3. "Invite to bid" CTA (the demand bridge)
- **Directory page**: a prominent band/CTA — "Need work done? Post your project free and these trades come to you." → links to the post-RFP flow.
- **Detail page**: primary button "Invite {Vendor} to bid" alongside the existing contact/intro card.
- **Target**: `/pm-dashboard/rfps/new?invite={slug}` (auth middleware bounces guests to sign-up). v1 = funnel + carry the slug as a query param (for later prefill/analytics).
- *Non-goal (v1):* building a full invite→notify pipeline / `rfp_invites` table. Just funnel browsing → RFP creation. Note the param is captured for v2 wiring.

### 4. Density + polish
- `loading.tsx` for `/directory` with skeleton cards (perceived performance).
- Refined **empty state** (when filters match nothing): friendly copy + "clear filters" action.
- Card hover/spacing consistency; subtle **Featured** highlight (ring/badge) for `featured` orgs (sorted first).
- Filter bar: show **result count**, default sort **verified-first**, add **clear-all** when filters active.

### 5. SEO / schema
- **Per-vendor OG image**: add `src/app/(marketing)/directory/[slug]/opengraph-image.tsx` mirroring the rfps pattern — vendor name + city + "Verified trade on PMRFP" + logo/initials, on-brand.
- **Enrich `generateMetadata`** (detail): add `openGraph` + `twitter` (title/description/image), `alternates.canonical`.
- **Extend `localBusinessSchema`** call to include `logo`/`image` (logo_url), `url` (the profile URL), and address (city/province) if the helper supports it; extend the helper if needed (small).
- Optional: `ItemList` JSON-LD on `/directory`. *(Will confirm helper signature before extending; follow existing jsonld.ts patterns.)*

## Approach notes
- Follow **existing in-repo patterns** (opengraph-image from rfps, server-action validation in `dashboard/actions.ts`, jsonld helpers). Read the Next.js 16 docs in `node_modules/next/dist/docs/` for `opengraph-image`, `generateMetadata`, and `next/image` before touching those (per AGENTS.md — modified Next.js).
- Client-side canvas resize keeps uploads going browser→Storage (no server image lib needed). The server action's existing logo-URL origin validation stays as the security guard.
- Verify visually via the preview tools (before/after screenshots of `/directory` + a detail page) before claiming done.

## Acceptance criteria
- [ ] A non-square logo uploaded via `/dashboard/company` is stored as 250×250 and renders uniformly in the card grid + detail header (white tile).
- [ ] Cards show verified/insurance/WSIB/years chips from existing data; header shows the "{N} verified trades… · {M} categories" stat.
- [ ] Every listing (card + detail) has an "Invite to bid / Post your project" CTA routing into the RFP-post flow with `?invite={slug}`.
- [ ] `/directory` shows skeletons while loading, a helpful empty state, verified-first sort, result count + clear-all.
- [ ] A vendor detail page produces a custom OG image + enriched metadata; LocalBusiness JSON-LD includes logo + url; `next build` + lint + typecheck pass.

## Out of scope (YAGNI)
Full invite/notify pipeline, reviews/ratings, portfolio lightbox, service-area map, new credential/data fields, an interactive logo cropper.
