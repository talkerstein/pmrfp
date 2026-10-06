# Public database bandwidth controls

The 6 October 2026 Supabase audit found PMRFP at 26.265 GB egress in the 29 September–29 October cycle. Checked days were 99.9–100% PostgREST traffic. Live logs showed repeated Node-origin queries for the RFP board, categories/photos, taxonomy, directory and case studies. File migration is not the immediate remedy.

## Behavior

- The cookieless anonymous public client caches successful database GET responses in Next's persistent Data Cache for 300 seconds. Taxonomy reads use a separate one-hour tag. Complete query URLs and headers keep filters and page offsets distinct. Auth, RPC, storage, writes and unexpected user credentials bypass the cache.
- Cookie-authenticated and service clients remain uncached. Relevant successful server writes invalidate the public-data tag immediately. Direct browser/mobile or SQL-editor changes refresh through the five-minute TTL; changing permissions in the dashboard should be followed by a redeployment/cache purge if immediate public removal is required.
- RFP imports remain complete: 250-row pages keep response entries below the cache size limit for typical teaser payloads. Directory cards no longer retrieve full descriptions or contact fields. No RLS or paid-access rules are changed.
- Anonymous public requests without a Supabase session cookie skip Auth refresh. Protected routes and signed-in requests retain verification.
- Board metadata and locked-detail proof counts use `GET` count queries with `limit=0`, without downloading rows/categories/photos. Positive exact counts return HTTP 206, which Next's fetch cache does not persist; the parsed numeric result therefore uses an explicit `unstable_cache` data boundary with a 300-second TTL and the public-data tag. Its key includes project URL, UTC day, sorted region IDs and excluded slug. Null deadlines and deadlines on today's UTC date are open, matching existing board behavior. Regional counts retain display-name matching and exclude the current slug.
- The board retains its complete rows/category mappings for existing filter, sort, country/tab counts, award totals and pagination semantics, but only fetches photos for the visible 30 cards plus up to nine recent-award cards. Export/report callers retain the default complete behavior. Full database-side pagination is deferred because those totals still depend on the complete filtered dataset.
- Public taxonomy maps, active dropdowns and region trees share a canonical paginated projection. Lookup rows keep all names allowed by anonymous RLS; only dropdowns filter inactive entries. Authenticated full-detail name maps retain their existing user-bound client. Taxonomy edits through server clients invalidate both taxonomy and derived public-data tags; other writes do not evict taxonomy. Direct SQL/browser changes to taxonomy can remain stale for up to an hour, so use a cache purge/redeployment when an immediate change is needed.
- Every public request invokes Next's patched fetch so each render registers its own cache tags and TTL. No process-wide in-flight promise map bypasses that registration. Canonical taxonomy uses React's render-local memoization, while Next handles fetch memoization/cache locking. This does not claim elimination of overlapping cold reads across Vercel instances.
- Public GET/HEAD page requests share a Redis sliding-window limit of 120 requests per IP per minute. Excess requests receive HTTP 429 and Retry-After. Auth routes, private dashboards, assets, API handlers, webhooks, cron jobs and POST actions are excluded from this new bucket; existing mutation limits remain.

## Rate limiter activation

Configure either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or the Vercel Marketplace aliases `KV_REST_API_URL` + `KV_REST_API_TOKEN`, in the deployment environment. No new Redis service or paid subscription is created by this change. When Redis is absent/unavailable, public requests are allowed; persistent public-data caching still applies. The public limiter deliberately never falls back to Supabase counters, which would add a database request per page. Rate keys are hashed IPs.

This limiter protects requests through the website. Direct requests to the Supabase endpoint, including mobile clients, do not pass through Vercel. Do not represent this as a Supabase-wide gateway limit. If logs later show direct abuse, investigate Supabase-side controls separately and preserve mobile access.

## Verification and rollout

Run unit/database tests, typecheck, targeted lint and a production build. Cache tests exercise actual Supabase SDK requests, page-offset separation, private-token exclusion and write invalidation. Limiter tests cover configured Redis, missing configuration, 429/retry headers and outages.

`next-public-cache.test.ts` runs Next 16.2.6's real `unstable_cache`, patched fetch and asynchronous render contexts against fixture upstream/storage. It verifies sequential reuse of HTTP 206 numeric counts, consumer tags/TTL on cache hits and overlapping renders, expiry after tag invalidation and elapsed TTL. It is not a measurement of Vercel's live cache or bandwidth.

After deploying, compare the next complete hour/day of Supabase PostgREST request counts and egress with the baseline (roughly 9.3k API Gateway requests in the inspected hour). Confirm no cache-size errors and check fresh content after moderation/imports. Old accumulated egress will not decrease; assess the rate of new usage. Set a Vercel Firewall rate rule if protection must run before application functions or cover excluded widget routes; that is separate from this code change.

The existing Pro upgrade handles continuity while optimizing. It is not performed by this change. No schema migration or object/data deletion is required. Reverting the commit removes the code changes.
