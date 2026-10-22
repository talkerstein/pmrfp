# D1 saved-RFP preview and rebuild policy

As of 2026-10-22, the draft branch contains the first opt-in application slice:
save, list and remove saved RFPs through a small Cloudflare Worker. Production
still uses Supabase. The synthetic preview is deployed and verified with a real Supabase test session. It is not a cutover-ready replacement.
The saved-alert cron, RFP lifecycle metrics, organization merges, page access
shell and other application flows still use Supabase. Do not switch real saves
until these consumers and ongoing synchronization have been converted.

## Serving boundary

Next forwards a bearer/cookie access token plus a server-only gateway secret to
`/v1/saved-rfps`. The Worker checks the token with Supabase Auth's `getUser`
endpoint and derives all application permissions from D1. Caller user IDs,
JWT metadata roles and arbitrary SQL are rejected. All SQL values are bound.
Responses expose only RFP ID, title, slug and saved timestamp from published
listings; private contact, pricing and scope fields are excluded.

A missing profile returns `profile_not_synced`; inactive profiles and users with
neither trade/supplier role nor a current paid/trial entitlement are denied.
Database/Auth failures fail closed. There is no fallback write to Supabase in
D1 mode. Authentication, the dashboard access shell and request rate limiting
still depend on their existing providers. Login/logout revocation behavior must
be checked with real Supabase sessions before any wider rollout.

Both read and write adapters use `PMRFP_SAVED_RFPS_BACKEND` (default `supabase`).
`d1` is hard-blocked when `VERCEL_ENV=production`. Preview configuration also
requires server-only `PMRFP_D1_API_URL` and `PMRFP_D1_GATEWAY_SECRET` (at least
32 random characters). Worker secrets are `GATEWAY_SECRET`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`. Never prefix the gateway secret with `NEXT_PUBLIC_`.

The deployed synthetic sandbox uses `SAVED_RFPS_MODE=sandbox-write`. The handler defaults to read-only when unset, and the copied-data preview explicitly stays read-only. POST requires both
`sandbox-write` mode and an explicit `_d1_sandbox` marker. Imported production
snapshots have no such marker. No production write mode is implemented here.
The code strengthens the old route's behavior by denying inactive profiles and
requiring a currently published RFP for new saves. Review this deliberate change.

## Separate sandbox

- Account: `f4e9b098134981b108024243b2a72ed4`
- Database: `pmrfp-api-sandbox-20261022`
- Database ID: `89721b4c-4fd7-46a2-809e-6a2299d915a3`
- Schema: 98 public tables from repository master `da918b5`, plus auth-ID shim
  and synthetic marker. This does not assert that live Supabase has 98 tables.
- Seed: `workers/d1-api/synthetic-seed.sql`; no real email, password or Auth
  account is created. The fixed seed ID is not an Auth account. A separate, explicitly authorized test account was created later and paired with synthetic D1 records for the live test.
- Configuration: `workers/d1-api/wrangler.jsonc`; no Vercel variables changed.

The schema and synthetic seed were applied remotely with Wrangler on Oct 22.
The two Oct 21 copied-data databases remain separate and unchanged. Worker and Worker Scripts access were authorized through the browser on Oct 22. The deployed synthetic endpoint is `https://pmrfp-d1-saved-rfps-preview.pmrfp.workers.dev`; its server-only gateway and public Auth configuration are configured as Worker secrets. A separate `wrangler.copy-preview.jsonc` deploys `pmrfp-d1-copied-read-preview` against the untouched v3 data copy with writes disabled.

```sh
npx vitest run test/d1-api test/unit/karma-rules.test.ts
python3 -m unittest discover -s test/d1 -v
npx wrangler@4 deploy --dry-run --config workers/d1-api/wrangler.jsonc
```

Node 24+ is required for the SQLite integration tests and rebuild CLI. The
application keeps its existing Node type baseline. Tests exercise the actual
SQL against SQLite, and the Worker is bundled with Wrangler; tests do not
substitute for broader rollout tests. A real Supabase test session has now verified app API save/list/unsave through the deployed sandbox and browser rendering, with zero source saved-RFP rows.

## Rebuild approved derived data

`d1/rebuild-policy.json` is an explicit allowlist. Everything not listed is
preserved, including unknown/new tables and all unlisted columns. Rebuild:

- `org_karma` from the preserved `karma_events` ledger, using the same application
  scoring implementation and an explicitly recorded scoring timestamp.
- Forum reply/word totals, latest post pointers, category totals, profile post
  counts/reputation and rating totals from preserved content/votes/ledger rows.
  System profiles retain zero reputation. Timestamp ties use ID as a stable
  tiebreaker; the original Postgres function did not specify a tie order.
- Transient `rate_limit_hits` start empty only in the new candidate. Rate-limit
  enforcement must already be active before any eventual traffic switch.

Historical view counts, marketing analytics, moderation history, billing,
Stripe idempotency records, email suppression/delivery logs, consents and source
ledger reversals remain preserved. Reference IDs and production edits remain
preserved. Views/indexes have no source records to copy; authorization, RPCs,
triggers, search and other behavior still require explicit implementation.

```sh
node scripts/d1/rebuild.mjs SOURCE.sqlite NEW_CANDIDATE.sqlite 2026-10-22T08:47:00Z
```

The source must be a closed consistent local migration backup. The command
refuses an existing target or WAL source, makes a private new copy, rebuilds in
a transaction, checks foreign keys, and compares a SHA-256 of every authoritative
row and column before/after. It writes a private report alongside the candidate.
A failed candidate is never approved for import; retain the unchanged source.
Do not upload this candidate with the original full-copy manifest: derived
values intentionally differ. `rebuild_snapshot.py` now creates a distinct checksummed rebuilt dataset with parent snapshot/policy provenance and validates it completely before import. Production behavior review remains required.

The Oct 21 D1 readback backup was rebuilt into a separate private candidate on
Oct 22. All authoritative data hashes matched; foreign keys and quick_check
passed. That remains the old point-in-time dataset, not current production.

The working estimate remains roughly 5–8 focused working days for full production
readiness, subject to schema drift, access, job conversion and end-to-end tests.
The rebuild shortcut reduces data-conversion work, but does not remove serving,
authorization, synchronization or cutover validation work.


## October 22 live results

The fresh source snapshot covers 98 public tables: 10,791 public records and 51
Auth ID references (10,842 records). V3 staging verified every field and schema,
then its actual readback backup was restored and reverified. The approved rebuild
produced 10,726 records: it reset 129 transient rate-limit hits and regenerated
karma cache rows (including 13 previously missing zero-score cache rows).
Authoritative records and unlisted fields remained identical. The rebuilt
snapshot was separately loaded into `pmrfp-rebuilt-staging-20261022`, fully
verified, read back, backed up, restored and validated against its own manifest.

The user authorized a non-deliverable test account on Oct 22. Supabase Auth and
its ordinary trade profile were created and the test profile marked complete;
no public company or source RFP was created. The snapshot predates this account.
Using that real session, POST `/api/save-rfp` returned 200, the Cloudflare Worker
returned the synthetic item, and the browser displayed it. Unsave returned 200
and the browser showed the empty state. The test account had zero saved-RFP
records in Supabase after both actions. Credentials and screenshots stay private.

Cloudflare native fetch rejected `redirect: "error"`; the Worker now uses
`manual` and rejects redirects without forwarding tokens. A regression test
covers that boundary. Live HTTP checks return 401 for missing gateway access,
missing user tokens and invalid tokens, with private/no-store response headers.

The local preview is at `http://localhost:3017`, configured through an ignored
private `.env.local`. Production Vercel settings and traffic are unchanged.
The approved source reader is active; live read/write/secret-access checks and
automated consistent export succeeded. See `READER-ACCESS.md`.

The direct export contains 10,840 public records and 53 Auth IDs (10,893 total).
Local incremental reconciliation verified every field and restored the previous
checkpoint backup successfully. Its rebuilt candidate has 10,776 records, with
all authoritative fields unchanged. The new remote database
`pmrfp-rebuilt-reader-staging-20261022` exists, but its upload is blocked by the
account’s daily free D1 row-write quota (error 7500). It is not a validated copy
and no Worker is bound to it. The allowance resets October 23 at 00:00 UTC
(05:30 India time), or an authorized paid-plan upgrade can remove this free-tier
limit. No billing change was made. Existing remote copies remain available.
