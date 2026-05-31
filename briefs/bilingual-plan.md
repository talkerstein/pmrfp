# PMRFP Bilingual (EN/FR) — Execution Plan

> **Status:** PLANNED, not started. Deferred from the 2026-05-31 session because
> (a) it's a 200+ route restructure and (b) the file tools were glitching that
> session — too risky to start a repo-wide refactor. Pick this up in a CLEAN
> session. This doc makes next session execution-only.

> **Decision (Rishon, 2026-05-31):** build full EN/FR bilingual. Architecture
> call delegated to Claude → **`/fr/` URL routing** (real localized URLs), NOT a
> cookie toggle. Reason: only real `/fr/` pages satisfy Québec Bill 96 language
> parity + give French-language SEO. Audit ranked this #5 (Accessibility, grade D)
> with Bill 96 / AODA legal exposure called out.

---

## What's already in place (don't redo)

- **`next-intl ^4.4.0` is already a dependency** in package.json — but **0 files
  reference it**. It's installed and completely unwired. This is the library to
  use (it's the standard for Next App Router i18n).
- Stack: Next.js 16.2.6 App Router, Tailwind v4, Base UI. ⚠️ Read
  `node_modules/next/dist/docs/` for Next 16 i18n specifics — APIs differ from
  training data (per AGENTS.md). Next 16 uses `proxy.ts` not `middleware.ts`.
- All marketing routes live under `src/app/(marketing)/`.

## Architecture (the locked decisions)

1. **Locale-segment routing:** restructure to `src/app/[locale]/...` with
   `locale ∈ {en, fr}`. `en` is default; decide en-as-default-no-prefix vs.
   `/en/` prefix — **recommend `localePrefix: "as-needed"`** (en at `/`, fr at
   `/fr/`) so existing English URLs + SEO are preserved and only French gets a
   prefix. This avoids 200 redirects on the English side.
2. **next-intl setup:**
   - `src/i18n/routing.ts` — `defineRouting({ locales: ['en','fr'], defaultLocale: 'en', localePrefix: 'as-needed' })`
   - `src/i18n/request.ts` — `getRequestConfig` loading `messages/${locale}.json`
   - `src/proxy.ts` — wire next-intl's middleware (Next 16 = proxy.ts). NOTE a
     proxy.ts may already exist — merge, don't clobber.
   - `next.config.ts` — wrap with `createNextIntlPlugin()`
3. **Messages:** `messages/en.json` + `messages/fr.json`. Namespace by page
   (`home`, `forTrades`, `forPMs`, `pricing`, `directory`, `rfps`, `common`,
   `nav`, `footer`).
4. **hreflang:** add `alternates.languages` in metadata per page (en + fr-CA) so
   Google serves the right version. This is the SEO half of Bill 96 compliance.
5. **Toggle:** persistent EN | FR switch in `SiteHeader` (and mobile menu) using
   next-intl's `Link`/`usePathname` so it swaps locale while preserving the path.

## The 6 priority pages (Rishon's scope, by traffic/value)

1. `/` home
2. `/for-trades`
3. `/for-property-managers`
4. `/pricing`
5. `/directory` (chrome/labels; vendor data stays as-entered)
6. `/rfps` (chrome/labels; RFP content stays as-entered by PM)

Plus shared: header nav, footer, the `COPY`/`PRICING` blocks in `src/lib/site.ts`
that render across all pages.

## Translation quality

- **Québec French, not France French.** "Soumission" (not "appel d'offres" alone),
  "entrepreneur" for contractor, keep "RFP" only if paired with the French gloss.
  Construction/PM trade terms must read native to a Québec property manager — have
  `pmrfp-construction` + `pmrfp-property-mgr` agents review the FR trade copy
  before ship (they self-evoke Thu; or invoke on demand).
- Disclaimers (`COPY.disclaimer` etc.) are legal text — translate carefully and
  keep parity of meaning. Consider a lawyer pass before relying on FR disclaimer
  for legal protection.

## Execution order (per-page, commit each green)

1. Infra first: routing.ts + request.ts + proxy wiring + next.config plugin +
   empty `messages/{en,fr}.json`. Verify build green with everything still
   English (en.json holds current strings). **Commit.**
2. Move `(marketing)` + other public routes under `[locale]`. Fix imports.
   Verify every route still 200s in English. **Commit.** (This is the risky
   structural step — do it alone, verify hard.)
3. Extract strings page-by-page into en.json, swap to `useTranslations`/
   `getTranslations`. One page per commit, build green each time.
4. Translate fr.json page-by-page. Have the PMRFP FR-domain agents review.
5. Add hreflang alternates + the header/footer toggle. **Commit.**
6. Full QA: every page at `/` and `/fr/`, toggle both ways, mobile menu,
   metadata/hreflang in page source, sitemap includes both locales.

## Gotchas

- Dynamic routes (`/rfps/[slug]`, `/trades/[category]`, `/vs/[competitor]`,
  `/for/[vertical]`, `/cost-guides/[slug]`, `/regions/[slug]`) all move under
  `[locale]` too — generateStaticParams must now also fan out over locales.
- `sitemap.ts` + `robots.txt` must emit both-locale URLs.
- Auth/dashboard areas: scope decision — keep app UI English-only v1 (faster) or
  localize too. Recommend marketing-only French for v1; app stays EN.
- The 151 programmatic SEO pages: French versions multiply the route count.
  Decide if FR programmatic pages ship now or after the 6 core pages.

## Definition of done (v1)

- 6 core pages + nav + footer fully French at `/fr/...`
- EN/FR toggle in header + mobile menu, preserves path
- hreflang on all localized pages
- Build green, all routes 200 in both locales
- FR trade copy reviewed by pmrfp-construction + pmrfp-property-mgr
