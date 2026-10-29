# Approved source reader — applied October 22

The user approved the reader setup at action time. The role and 19 narrowed
definer grants have been applied to Supabase. The database generated the
initial password; saved SQL contains no password. The review-only proposal
retains its intentional approval guard and cannot be applied unchanged.

The applied setup creates `d1_migration_reader_20261022`, expiring October 29, 2026 at
15:30 India time (10:00 UTC), with at most three connections. It grants SELECT
on the 98 audited public tables and only `auth.users.id`. RLS bypass permits a
complete cross-user migration export; table privileges still deny writes and
Auth password access. There are no role memberships, table/sequence write
grants, replication privileges, schema creation privileges or default grants.
Sessions default to read-only with statement/lock/idle transaction timeouts.
The credential is retained only in private local configuration, never committed
or placed in a CLI argument.

The metadata-only preflight found no inherited PUBLIC table writes or schema
creation. The expanded audit found 23 publicly callable definer functions, including trigger functions. Four are audited read-only entitlement/membership predicates. The proposal narrows PUBLIC execution on the other 19 functions while preserving execution for anon, authenticated and service_role (and existing explicit grants and owners). This includes the marketplace counter writer and trigger functions that a database user could otherwise attach to temporary tables. Existing triggers continue firing normally; function bodies are unchanged.
Normal application callers retain the same counter behavior. No function body,
row policy, business row or application role membership is changed.

The proposal transaction guards abort if the table inventory, audited function definitions or
inherited permissions have changed. Postconditions verify the reader cannot call
the counter writer, read Auth password hashes, or write public tables.

A PGlite test executes the proposal against a 98-table fixture with RLS enabled,
confirms cross-user reads, denies table writes and Auth password reads, and
confirms all three existing app roles retain counter calls. It also denies reader attachment of a privileged trigger to a temporary table and confirms an existing trigger still fires for an ordinary invoker without EXECUTE on the trigger function. The unrendered
proposal also fails closed. This is an offline privilege rehearsal, not proof
of the deployed permissions. Live verification uses a separate database login.

Supabase's managed Auth schema did not accept USAGE from the dashboard's
Postgres role, despite accepting the ID column grant. The original postcondition
missed schema USAGE; the generator now checks it. The applied supplement
`d1/reader-auth-id-view-2026-10-22.sql` exposes only `id` through an owner-backed,
security-barrier view, `public.d1_migration_auth_ids_20261022`. Only the reader
receives SELECT; PUBLIC, anon, authenticated and service_role have no view
privileges. Auth schema access and password columns remain unavailable.
The exporter permits this exact view as an explicit alternative source.

The TLS session-pooler connection succeeds with `sslmode=verify-full` and the
Supabase CA certificate downloaded from Database Settings. Eight live checks
passed, and explicit privilege checks deny all 19 restricted definer functions.
An explicit read-write transaction still cannot prepare an INSERT. The first
consistent export contains 10,893 records; local reconciliation and restoration
of the prior checkpoint backup passed. No SSL enforcement
setting or shared trust store was changed.

This reader does not create logical replication slots or implement low-egress CDC.

Rollback after access is no longer needed: disable login first, then review and
remove the reader-only Auth ID view and the role's grants/role. The narrower definer grants can remain with normal app callers; restoring PUBLIC execution is not needed for the application.
No cleanup command is run automatically by this proposal.

Relevant platform references: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [inherited privileges](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c).


## October 23 approved extension

Three new source tables were found during the next metadata audit. The user
explicitly authorized SELECT-only access to `badge_rewards`, `email_consents`
and `rfp_changes`. The guarded proposal is
`d1/reader-access-extension-proposal-2026-10-23.sql`; its approved rendering was
applied through the dashboard. The expiry, role memberships, credential and
other privileges did not change. Live reader verification confirms 101 readable
public tables, zero writable tables and no Auth password-column privilege.
The ACL preflight still shows only the four audited read-only PUBLIC definer
helpers and no PUBLIC table-write or schema-create grants. The fresh snapshot
covers all 101 tables, including the three empty new tables.

## Approved renewal — October 29

The user approved renewing the same reader through November 5, 2026 at 15:30
India time (10:00 UTC) and SELECT-only access to seven new tables:
`blocked_domains`, `contractor_activity`, `open_data_runs`, `org_link_clicks`,
`organization_risk`, `permit_leads`, and `planned_procurements`. The applied SQL
also narrows PUBLIC execution of `guard_organization_link_fields()` to the
existing app roles, retaining ordinary trigger invocation. Its definition and
the four existing read helpers are pinned by hash before the transaction runs.

The guarded review SQL is `d1/reader-renewal-proposal-2026-10-29.sql`, generated
by `scripts/d1/renew_reader.py`. It verifies the exact 108-table inventory,
existing role flags/expiry/memberships, absence of table-write/schema-create
privileges, inherited definer inventory and denied Auth password access before
changing anything. It does not change the reader credential or default grants.
The local PGlite test verifies the guard, credential preservation, read-only
access, Auth ID-only view, denied privileged-trigger attachment and preserved
app-trigger invocation.

Live dashboard verification after application: 108 readable tables, zero
writable tables, no encrypted-password SELECT, no guard-function EXECUTE for the
reader, and continued Auth ID-view SELECT. Expiry is November 5 at 10:00 UTC.
Production schema columns match repository base `ff0958c` across 108 tables;
source-only `rls_auto_enable` and the previously documented storage-policy
baseline difference remain. This renewal does not migrate application writes.
