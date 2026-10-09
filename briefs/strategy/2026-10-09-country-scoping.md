# Country-first scoping (2026-10-09)

Owner's rule: Canadians don't care about U.S. tenders and U.S. trades don't care about Canadian ones. Every list, count and email shows ONE country by default, then the visitor's own province or state first. Branch `feat/country-first`.

## How the country is decided

There is one resolver, `resolveCountry()` in `src/lib/visitor-geo.ts`. The server uses it through `getVisitorCountry()` (`src/lib/visitor-geo.server.ts`) and the browser through `readCountry()` / `useVisitorCountry()` (`src/components/geo/use-visitor-market.ts`). The header CA | US switch, the one-currency-per-visitor prices and every list all read from it.

| Order | Signal | Where it comes from |
|---|---|---|
| 1 | `?country=ca\|us` on pages that take it | An explicit view of one page (RFP board tabs, winners, directory, jobs, GC Hub, projects). Never stored. |
| 2 | The signed-in company's location | `organizations.province`, else an explicit U.S. `organizations.country`, else the country of its service regions (`accountGeo`). The dashboards copy it into the `pmrfp_acct` cookie (`AccountCountrySync`), so cached public pages follow it too. Sign-out clears it. |
| 3 | The CA \| US header switch | The `pmrfp_market` cookie. If a signed-in user flips the switch away from their company's country, the account cookie is dropped for that browser until the dashboard loads again. Dashboards and emails always use the company's country. |
| 4 | Vercel IP geo | `x-vercel-ip-country` / `x-vercel-ip-country-region`. The proxy copies them into the `pmrfp_geo` cookie so cached pages can use them. |
| 5 | Canada | Default. |

The province or state that sorts first comes from the account when it is in the resolved country, otherwise from the IP region when that is in the resolved country.

Sign-up and the company profile now write `organizations.country` from the province or state. The column defaults to "Canada", so U.S. companies were stored as Canadian before. Migration `20261010000002_org_country_backfill.sql` fixes existing rows.

## Caching: why this design

Pages that are already dynamic (they read `searchParams`, the session or cookies) resolve the country on the server. These are `/rfps`, the directory, suppliers, jobs, contract winners, GC Hub, projects, forum, sign-up, check-email and the dashboards. Each takes an explicit `?country=`, and Canada vs U.S. HTML is never shared because these pages are not cached per URL.

Cached ISR pages (homepage, trade hubs, pricing, audience landings and the v3 sticky bar) do not read headers. They render both countries' data on the server and the client shows the visitor's (`ByMarket`, `V3Sticky`, `HomeV3` `dataUs`). The cached HTML is the same for everyone and holds both versions, so one country's cache can never be served to the other. Crawlers and the first paint see Canada (the default market).

We chose this over `/ca/...` vs `/us/...` route segments for three reasons:
1. The app already has a `[lang]` segment. A second dynamic segment would move about 150 routes and every internal link.
2. Pages whose URL already names a place stay canonical and crawlable as they are: `/regions/us-texas`, `/trades/hvac/us-texas`, `/rfps/<slug>`, `/regions/ontario`.
3. Canonicals and hreflang stay unchanged. `?country=` views keep the base page's canonical.

If U.S. organic traffic on the country-neutral hubs (`/trades/<trade>`, `/`) ever matters, the next step is `?country=us` variants with their own canonical. That is a deliberate SEO decision, not part of this change.

## Audit: what mixed countries before, and what it does now

| Surface | Before | Now |
|---|---|---|
| Homepage: hero "N contracts open", stats bar, trade tiles and chips, ticker, Trade Pro example, browse links, sticky, popup | **Mixed.** Copy said "Canada and the U.S." | One board per country (`load()` → `fillBoard` for CA and US). The client shows the visitor's. Copy: "N contracts open in Canada" / "in the U.S." |
| Homepage: closing-soon cards | Scoped (CA/US) | Scoped |
| Homepage: winners treemap, "just awarded", report link, toast award | Canadian data shown to everyone | Canada only. The section is hidden for U.S. visitors (there are no U.S. award notices yet). |
| v3 sticky bar (about 25 pages via `V3Body`), `SimplePage` open card, audience landings (`/for/*`, `/for-trades`, `/for-property-managers`) | **Mixed** counts. U.S. visitors with fewer than 3 U.S. tenders saw Canadian "open" cards. | Per-country counts (`loadV3Board().byCountry`) and the visitor's country's cards only |
| `/rfps` board | Country tabs existed. Award total, region dropdowns and the province order were mixed. | Award total per country, region pickers list the chosen country, the visitor's province first, and the meta title count is per country |
| `/rfps/[slug]` | "N other open", similar listings and winner lookups were mixed | The listing's own country only |
| Directory, suppliers | **Mixed.** No country filter. | `VendorFilters.country` (the company's province plus its service regions), region pickers per country, the visitor's province first, `?country=` |
| Jobs | **Mixed** | Per country, the visitor's province first |
| Directory tab counts (`getListCounts`) | **Mixed** | Per country (`getVisitorListCounts`) |
| `/contract-winners` | Canadian data shown to everyone, with mixed board counts | `listWinners(country)`. U.S. visitors get the empty state. Counts are per country. |
| `/contract-winners/[slug]` | One company | n/a |
| `/reports/contract-winners` (+ `[month]`, CSV, OG) | Canadian data, but copy claimed "Canada and the U.S." | Data is hard-scoped to Canada (`REPORT_COUNTRY`), so U.S. rows can never enter. Copy now says Canada. U.S. visitors get a note. U.S. reports get their own pages once U.S. award notices exist. |
| `/gc-hub` | Wins were Canadian. GC packages were **mixed**. | Wins and packages from the visitor's country only, their province first, `?country=` |
| `/projects` gallery | **Mixed** | Country filter (province, else a `us-` region), the visitor's province first. A company's own view still shows all of its work. |
| Forum home: "Open tenders this week", "New tenders by forum" (#134) | **Mixed** | The visitor's country's auto-threads only, their province first (`AutoThread.country` from the listing's province) |
| Forum tender thread: "Similar past contracts" (#134) | Same province first, then **any country** | Same country only (`similarAwards`) |
| Forum regional channel | Fixed order | The visitor's own province's forum first, then their country's, then the other country's |
| Forum category lists and "Latest" member threads | Discussion, not tenders | Unchanged (follow-up below) |
| Trade dashboard home + `/dashboard/rfps` | **Mixed.** All open RFPs, both countries. | The company's country, its province first |
| PM dashboard | Own posts only | n/a |
| Weekly free digest (`/api/cron/tender-digest`) | **Leaked.** Every U.S. free trade got every Canada-national and region-less tender. | Only tenders in the countries the company works in. National regions are symmetric (`freeDigestMatches`). |
| Daily paid alerts (`/api/cron/rfp-alerts`) | **Leaked** region-less listings to every country | `countriesByOrg` + `DigestRfp.country`. The "recently awarded" section is also per country. |
| Saved-RFP alerts | Only what the user saved | n/a (intended) |
| Admin weekly | Admin only | n/a |
| Waitlist / digest sign-up (`regional_waitlist`) | Stores country. Nothing in the app emails it (GHL does). | n/a in app. GHL should segment on `pmrfp_country`. |
| Embed feed `/embed/feed/[trade]/all` | **Mixed** | `all` / `canada` / `ca` = Canada, `united-states` / `us` = U.S. A region is one country. |
| Trade hubs `/trades/[category]` | RFP cards and companies **mixed** | Both countries ship and `ByMarket` shows the visitor's. The SEO copy still says "in Canada" (follow-up). |
| `/trades/[category]/[city]`, `/regions/*`, province hubs | One place, so one country | Scoped already |
| `/pricing` | "RFPs in the last 30 days" and the mint/sticky counts were **mixed**. The email preview was Canada-only. | Per country, plus a U.S. email preview for U.S. visitors. The 30-day count also stops counting Toronto and Nova Scotia award notices (bug). |
| Sign-up | Chips counted both countries | Counts are per country. The visitor's country's regions (their province first) come before the other country's. |
| Sitemap | URL index | Correctly lists both (n/a) |
| OG images | Static copy or one entity | n/a |
| Founding 500 | No counts. Prices follow the market. | n/a |
| `/advertise` reach stats | Platform-wide on purpose (advertisers buy both audiences) | Unchanged on purpose |
| `/become-a-supplier` "busiest trades", `/vs/*` copy | Minor mix in busiest-trade counts | Follow-up |

## Follow-ups (not in this PR)

- **SEO copy on `/trades/*`.** The titles, FAQs and the trades index say "in Canada". It is correct for the default (Canadian) view, but U.S. visitors see Canadian copy above U.S. cards. Changing it is an SEO decision.
- **Forum category pages** list both countries' auto-threads by date. Country-first ordering needs either a country column on `forum_threads` or a paged query on `region`. Recommended: store `country` when the auto-thread is created (`auto-threads-server.ts`) and filter on it.
- **U.S. award notices.** Every award source today is Canadian (`-cba-`, `-qca-`, `-tora-`, `-nsa-`), so winners, reports and GC Hub wins are empty for U.S. visitors. When a U.S. award feed lands, add `/reports/contract-winners/us/...` routes and pass the country to `loadMonthly`.
- **SAM.gov rows with no place-of-performance state** have no province. They count as U.S. through their `us-*` / `united-states` region in emails (`listingCountry`), but the web board reads the province. A small import fix would set province from the region, or set region from `PopState`.
- **`resolveRegion(slug, fallback = "canada")`** in `src/lib/tenders/sync.ts:68`. If a `us-*` slug is ever missing, a U.S. tender is filed under Canada. U.S. sources should pass `fallbackRegion: "united-states"`.

## Dev must run

`supabase/migrations/20261010000002_org_country_backfill.sql`. It is idempotent and only sets `organizations.country = 'United States'` for companies whose province is a U.S. state or whose service regions are all in the U.S. The app works without it.
