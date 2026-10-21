# Explicit Supabase Data API permissions

Supabase removes automatic grants on new public tables on October 30, 2026.
Existing production grants remain intact. PMRFP uses supabase-js/PostgREST,
including service-role queries, so BYPASSRLS alone is not enough for new tables.

Historical migrations now explicitly grant the operations covered by their RLS
policies and backend CRUD; public views grant backend SELECT as well. This is
intentional for fresh resets and delayed feature rollouts. Already-applied
migrations are not replayed: 20261021000001_explicit_api_grants.sql backfills the
same privileges for installed relations. It skips absent optional tables/views
because production's migration history currently lags master. Their creation
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
The existing automatic CLI workflow is blocked by missing historical migration
20261009000003 and must be reconciled separately before normal pushes resume.

On October 21, 2026 the forward backfill was applied successfully through the
production SQL editor. Before and after, an audit found zero missing expected
grants on installed relations. Twenty-five optional relations from later feature
migrations were absent and were skipped. The US RFP listing rendered 554 listings
after the patch. The SQL-editor application is intentionally not used to repair or
falsify the unrelated CLI migration history; replaying the backfill is safe.
