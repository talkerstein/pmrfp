# Explicit Supabase Data API permissions

Supabase removes automatic grants on new public tables on October 30, 2026.
Existing production grants remain intact. PMRFP uses supabase-js/PostgREST,
including service-role queries, so BYPASSRLS alone is not enough for new tables.

Historical migrations now explicitly grant the operations covered by their RLS
policies and backend CRUD; public views grant backend SELECT as well. This is
intentional for fresh resets and delayed feature rollouts. Already-applied
migrations are not replayed: 20261021000001_explicit_api_grants.sql backfills the
same privileges for installed relations. It skips absent optional tables/views
when an installation's migration history lags master. Their creation
migrations now carry their own grants when they are eventually applied.

The backfill does not revoke privileges, alter RLS, grant defaults or create
feature tables. Correction requests retain their existing column-only admin
updates. Backend-only tables receive no client grants. Private/premium row
filtering stays in the existing policies. This patch addresses the permissions
change; it does not resolve disk IO, query performance or the unrelated backlog.

Validation: scripts/check-db-grants.mjs requires explicit backend grants and RLS
for table creation (the original split schema/RLS pair is the sole exception).
test/db/api-grants.test.ts replays every real public migration in PGlite without
blanket grants/default ACLs, checks backend table/view permissions, client write
restrictions, premium reads, correction columns, idempotency and older installs.
Auth/storage are platform shims; extension/trigram DDL is omitted in PGlite.
CI runs the checks for database changes. No new Supabase infrastructure is needed.

Production rollout: apply only the forward backfill to project
tumexryzbzmtijvbloch, audit missing grants on installed relations, and smoke-test
public routes. Do not reset the database or mark unrelated migrations applied.
For an older unrecorded migration, run the Database migrations workflow manually
with mode=push and include_earlier=true after review. This uses --include-all for
both preview and apply; ordinary pushes keep the chronological safety check.
The workflow now fails unless every local/remote migration version matches.

On October 21, 2026 the forward backfill was applied successfully through the
production SQL editor. Before and after, an audit found zero missing expected
grants on installed relations. Twenty-five optional relations from later feature
migrations were absent and were skipped. The US RFP listing rendered 554 listings
after the patch. The SQL-editor application is intentionally not used to repair or
falsify the unrelated CLI migration history; replaying the backfill is safe.


On October 21, the migration backlog was reconciled successfully in workflow run
https://github.com/talkerstein/pmrfp/actions/runs/39606667632. Twenty pending
migrations were applied and all 58 versions matched production afterward. A
newer, manually installed major-project view initially blocked replay of the
older migration; the replay now preserves its appended columns. The regression
covers an existing wave-2 row and view. No versions were fabricated or baselined.

Aggregate before/after counts matched: 48 users, 56 organizations, 3,033 RFPs,
two subscriptions and 253 forum threads (zero replies). Current usage was
13.814/250 GB egress and 0.045/100 GB file storage for Oct 6–Nov 6; the database
reported Healthy on Micro with 2% CPU, 47% RAM and no visible disk IO budget
warning. These are point-in-time checks, not an outage guarantee; isolated
network/TLS failures were present in the preceding hour.
