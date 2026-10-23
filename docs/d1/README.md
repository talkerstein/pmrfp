# PMRFP D1 migration — staged data rehearsal

**Status: application conversion is incomplete; production cutover is blocked.**
This branch implements the audit, candidate D1 copy schemas, consistent exports,
local incremental reconciliation, private staging import, validation, and local
backup/restore rehearsal. It now includes an opt-in synthetic saved-RFP preview; see [PREVIEW.md](PREVIEW.md). Production traffic remains on Supabase. Supabase
remains authoritative. Existing production business rows, row policies, jobs, storage objects and Vercel configuration are unchanged. The user approved a temporary migration reader and narrower PUBLIC execution grants on 19 definer functions; see [READER-ACCESS.md](READER-ACCESS.md). At the user's request, one isolated Auth test account and its ordinary profile were created for preview verification; source bookmarks and public business listings were not created.

Repository baseline refreshed to `origin/master` at
`a70342d`,
2026-10-23. Worktree: `../d1-migration`, branch `codex/d1-staged-migration`.
The other chat's checkout was not modified. The grants fix (#164), city-source work
(#163), and migration-reconciliation fixes (#165/#166) landed during this work;
this branch was rebased onto them without modifying those patches. The live
copy below is the earlier point-in-time snapshot, not a fresh post-reconciliation
export. Repeat the live audit before a later data synchronization or cutover.

## October 23 update

The daily D1 write allowance reset. The pending 10,776-record copy is now fully uploaded, verified and restored from its actual readback backup. A fresh live audit includes 101 public tables; shared columns match current master. The user authorized SELECT-only reader grants on the three added tables (`badge_rewards`, `email_consents`, `rfp_changes`), retaining the October 29 expiry and zero table writes/Auth password access. The new tables are preserved in full, including when empty.

Today’s consistent export contains 11,819 public records and 54 Auth IDs (11,873 total). Its approved rebuilt candidate has 11,754 records and is verified on D1, including readback/restore; authoritative fields remain identical. The copied-data Worker now serves that candidate in read-only mode. The original full-copy and earlier rebuilt databases remain available.

Public category/region/property-type lookup reads now have an opt-in D1 backend, with fixed projections, active-only anon-equivalent filtering, bound pagination and a private gateway. Live comparison matched every field of 45 categories, 88 regions and 21 property types. English/French browser filters work. Production selection is explicitly blocked; private listing data and jobs still use Supabase. The public board now also has an opt-in D1 provider: all 1,792 published rows and category links matched source output; validated dataset identity and provider-specific caches are enforced. Full application tests: 2,458 passed, two skipped; build, typecheck, targeted lint and 21 migration tests pass. See `preview-report-2026-10-23.json` and [PREVIEW.md](PREVIEW.md).

## October 22 update

A fresh live catalog now reports 98 public tables, 163 public/storage policies, 63 functions, 37 row triggers and 20 views. Shared columns match the repository replay. The remaining metadata differences are a Supabase RLS helper and one storage read policy; this branch did not change them. See the dated Oct 22 catalog/schema files, `PREVIEW.md` and `VALIDATION.md`. The older table below remains the Oct 21 comparison for historical reproducibility.

The Oct 22 full copy (10,842 records) and rebuilt candidate (10,726 records) are now separately verified on D1, including actual readback backup/restore. The synthetic saved-RFP flow is deployed and verified with a real test session. Full application parity and production cutover remain incomplete. The approved source reader is active and its live permission checks passed. A direct consistent export now contains 10,893 records. Local reconciliation and backup/restore passed; a fresh rebuilt candidate contains 10,776 records. Uploading that latest candidate is blocked by Cloudflare’s exhausted daily free D1 row-write allowance (error 7500), resetting October 23 at 00:00 UTC. Existing verified remote copies are retained.

## Findings that change the migration

| Inventory | Current repository replay | Production snapshot at export |
|---|---:|---:|
| Public tables | 98 | 59 |
| Public + storage RLS policies | 164 | 127 |
| Application functions | 62 | 26 |
| Application/auth row triggers | 37 | 24 |
| Public views | 20 | 11 |

The initial production snapshot has **39 fewer tables** than the current repository replay. Shared column differences are catalogued separately; this is a comparison against the old snapshot. All missing relations/columns are listed in `d1/schema-drift.json`.
A later read-only follow-up, after the other chat reconciled migrations, now
reports **85 public tables, 141 public policies and 13 views** in production.
The full catalog and data in this rehearsal intentionally remain the earlier
point-in-time export; they must not be presented as the current live dataset.
`production-followup-status.json` records the follow-up. Capture a fresh complete
catalog and snapshot before the next synchronization.

Do not infer deployed database state from the migration filenames. Do not apply
the missing Supabase migrations as part of the D1 rehearsal.

The supplemental audit also records eight event triggers: six Supabase platform
DDL/extension hooks and two RLS-enforcement hooks (`ensure_rls` and
`auto_enable_rls_trigger`). D1 needs an explicit default-deny serving boundary
instead of relying on these Postgres event triggers.

The live database audit reported 33,336,467 bytes for the database and 18,571,264
bytes for public relations including indexes. These are Postgres sizes, not D1
storage projections. The complete application snapshot contains 9,913 public
records plus 48 auth-ID references, **9,961 copied records** total. Row estimates
in `pg_stat_user_tables` were stale; validation uses actual rows.

The production catalog was read through the authenticated Supabase SQL Editor,
inside `BEGIN READ ONLY`. Dashboard API credentials were not extracted. Vercel
CLI access worked, but environment downloads supplied `[SENSITIVE]` placeholders,
so those values were not usable as database credentials. Cloudflare authentication
uses an explicitly approved Wrangler OAuth session scoped to account-read and
D1-write plus refresh/background access.

## Files and reproducibility

- `d1/postgres-catalog.json`: reconstructed repository schema, all migrations in
  order, using PGlite and minimal Supabase auth/storage shims. Unavailable
  extensions and GIN/GiST indexes are explicitly recorded, not silently counted
  as supported. This is not proof of production state.
- `d1/production-catalog-2026-10-21.json`: authoritative live schema metadata;
  contains definitions and estimates, no application rows or auth credentials.
- `d1/source-dependencies.json`: source call sites, including mobile and scripts;
  literal relation discovery is supplemented by a list of dynamic `.from(...)`
  call sites requiring manual review.
- `d1/0001-staging-copy.sql`: repository-schema candidate; **copy only**.
- `d1/production-staging-copy.sql`: live-schema candidate; **copy only**.
- `d1/*porting-gaps.json`: every omitted default, check/index, policy, function,
  trigger and view. There are 418 repository and 255 production gap entries.
  These are behavior entries, not estimates of engineering effort.
- `d1/production-snapshot.sql`: reproducible read-only dashboard export query.
- `scripts/d1/migrate.py`: local export, reconcile, validate and restore CLI.
- `scripts/d1/dashboard_snapshot.py`: checks source MD5/counts and converts CSV
  groups to strict, checksummed JSONL.
- `scripts/d1/remote.py`: pinned private staging loader and complete remote read
  comparison, using the documented Cloudflare query API.

```sh
node scripts/d1/catalog.mjs
python3 scripts/d1/schema.py
node scripts/d1/audit.mjs
python3 -m unittest discover -s test/d1 -v
npx wrangler@4 d1 execute DB --local --config d1/wrangler.local.jsonc \
  --file d1/0001-staging-copy.sql
```

Regenerate candidate schemas separately after a catalog change; do not hand-edit
them. Repository reconstruction requires installed project npm dependencies.
Python tools use the standard library (Python 3.9+). Wrangler 4.151.3 was used for
the recorded rehearsal. No application dependency or lockfile was changed. The D1-specific GitHub
workflow runs the offline tests without production secrets; it cannot apply a
Supabase or D1 migration.

## Database semantics and application boundary

UUIDs remain text identifiers. Booleans become constrained 0/1 integers. Arrays
and JSONB become canonical JSON text. Decimal numerics are exported as decimal
strings and stored as TEXT to preserve precision. Integer range is checked.
Timestamp strings are preserved as exported under UTC. Existing primary keys,
unique constraints, foreign keys and supported checks/indexes are preserved.
Generated `digest_subscribers.email_key` is generated, not inserted.

This representation is suitable for a copy rehearsal. Production query code
still needs explicit decimal arithmetic, timestamp comparisons and JSON/array
operators; lexicographic numeric sorting is not an acceptable replacement.
Nullable JSON retains SQL NULL; malformed non-NULL JSON is rejected. Nested
JSON numeric values use decimal parsing to avoid floating-point truncation.
Postgres UUID generation, identity, regex checks, timezone defaults, custom
indexes and unsupported constraints remain listed in the gaps file. A candidate
schema is deliberately not described as an application-ready migration.

D1 has no Supabase PostgREST endpoint or Postgres role/RLS execution. Existing
Supabase clients cannot be pointed at it. The current audit records 56 auth call sites, 21
storage call sites, 18 literal RPC names and 31 configured Vercel cron jobs.
`src/lib/supabase/{server,browser,read,service}.ts`, the bearer-session client,
mobile's Supabase client and direct scripts must be converted intentionally.
A generic client-supplied SQL gateway would bypass the current authorization and
is not part of this implementation.

The intended serving architecture keeps Next.js on Vercel and Supabase Auth.
A private Worker with a D1 binding should expose typed application operations;
Vercel passes the actual user bearer token, which the Worker verifies against
Supabase issuer/audience/signature before evaluating authorization. Anonymous,
user, organization-member, admin, and trusted-job operations must be distinct.
Never accept a caller's role/user ID as authorization and never expose a D1 API
token or service-role secret to browser/mobile code. The saved-RFP operation subset is now implemented, deployed and verified with a real test session. Other operations and identities remain to be ported.

## Security and behavior still to port

| Area | Required replacement and test boundary |
|---|---|
| RLS | Port each final policy, including `USING` and `WITH CHECK`; default-deny new tables; test anon, owner, other organization, suspended user, admin and job identities. Retest grants after the separate October 30 patch lands. |
| Privileged guards | Preserve `guard_users_profile_insert`, `guard_users_profile_privileged`, `guard_organization_privileged`, and marketplace field guards. Users must not change roles, moderation, billing, ownership or featured fields. |
| Auth signup | `auth.users` currently triggers `handle_new_user` in Postgres. Keeping Supabase Auth requires an idempotent verified signup/auth-event bridge into D1, deletion handling, and reconciliation. Merely keeping login working does not keep profiles synchronized. |
| Authorization helpers | Port `is_admin`, `is_org_member`, paid/trial/intel access and publish visibility against current D1 state. Source/live access helper definitions differ. |
| Counters and forum | Atomic view/impression/click/rate-limit RPCs; poll results; forum profile/thread/category/reputation/rating/vote trigger effects; timestamp maintenance. Retry must not double-count. |
| Public views | Recreate explicit public projections and redaction. RFP teasers, private reviews, sponsor contact fields, buyer contacts and paid intel must retain current visibility. Include production-only `major_project_source_counts` and its admin check. |
| Billing and jobs | Preserve Stripe webhook event IDs, subscription state, notification/email send logs and retry/idempotency behavior. Convert every importer and cron writer before D1 becomes authoritative. |
| Search/query semantics | Translate ILIKE, arrays, nested relationship selects, containment, regexes, decimal/date ordering, conflict targets and pagination; preserve response/error/count semantics at call sites. |
| Mobile | Login can remain Supabase; direct table queries, access RPC and device-token writes need the same typed authorization boundary as web. |

## Jobs and storage

All 28 scheduled paths and schedules are preserved in `source-dependencies.json`.
They cover tender importers, closure/expiry, alerts and digests, bid checks,
karma, major projects, forum recurring threads, lifecycle messages, award history
and insights. No `pg_cron` extension was present in the live extension inventory.
The audited public publication list was empty; source scans should still be
reviewed before concluding there are no runtime Realtime dependencies. The
Supabase overview reported no Edge Function requests; this is not a full remote
Edge Function code inventory.

At the snapshot export, production had five buckets: public `logos`, `rfp-photos`, `project-photos`; private
`rfp-documents`, `capability-statements`. The repository additionally expects
private project/forum-photo buckets which are absent live. Preserve existing
URLs, object paths, MIME/size rules, private signed URLs and ownership checks.
Storage policies currently consult Postgres organization membership. Leaving
storage on Supabase while moving memberships to D1 requires a tested server-side
authorization/storage gateway or an explicitly synchronized membership mirror.
Do not remove source membership rows while those policies depend on them.
The storage object inventory found 39 logos (10,117,937 bytes) and four RFP
photos (35,753,497 bytes). Other buckets had no recorded objects. No storage
objects were migrated, changed or deleted in this rehearsal.

## Incremental sync and rollback contract

`migrate.py sync` applies differences between complete, consistent snapshots,
including deletes on tables without `updated_at`. It detects inserted/deleted/
changed records, backs up an existing target through SQLite's online-backup API,
then runs a single transaction with deferred FK checks. It re-reads after delete
cascades, inserts/updates only missing or changed records, and verifies every
field and FK before commit. It never uses `INSERT OR REPLACE`. Failed validation
rolls the transaction back. Reapplying the same snapshot is a no-op.

This is **incremental target reconciliation from full source snapshots**, not a
continuous or low-egress CDC implementation. A second live export was unchanged
and verified as a no-op; synthetic tests exercise inserts, updates and deletes.
Conflicting unique-key swaps can safely abort rather than silently lose records.
The local rehearsal holds snapshots in memory; it is suitable for the measured
11.5 MB export, not an unbounded production migration.

The remote loader uses resumable, dependency-ordered, idempotent staging batches.
It compares the full candidate table/index schema as well as all record fields.
It rejects integers outside the JSON API safe-integer range before any remote
write rather than silently truncating them.
It rejects a different source snapshot or an unrecognized target and marks a load
`loading` until all remote rows, integrity and foreign keys validate. It is pinned
to `pmrfp-migration-staging-v2-20261021`; it does not offer production cutover or
in-place remote incremental sync. Actual cyclic row dependencies require the
bulk import transaction path; schema cycles with NULL references are supported.
The observed snapshot has no unsatisfied row cycles. Bulk file imports failed on
Cloudflare upload/connectivity/reset errors, so the query API was used instead.

Before production conversion, implement a transactional Postgres outbox/CDC
stream for INSERT/UPDATE/DELETE, with source transaction identity, durable event
IDs, tombstones and an independently committed target checkpoint. Do not use
`updated_at` polling alone and do not advance past an uncommitted sequence ID:
concurrent source transactions can commit in a different order. Replay must be
idempotent and retain transaction boundaries. Any source trigger/replication
installation is a separate reviewed deployment, not installed by this branch.
A controlled write freeze plus final complete snapshot is the safe alternative
for the currently small dataset, if the user chooses it at cutover review.

Rollback today is immediate because the site still uses Supabase. Restore local
backups to a NEW filename, validate against the earlier snapshot, and preserve
the current copy. No command in this branch restores or deletes Supabase data.
After D1 begins accepting authoritative writes, rollback requires reverse replay
of the D1 write journal and a write freeze before returning to Supabase; switching
an environment variable alone would lose intervening writes. That reverse-write
path is not implemented, so authoritative D1 writes remain blocked.

## Residual costs

Retaining Supabase Auth and Storage retains a Supabase project and its backing
Postgres service. It does **not** eliminate the subscription/compute bill.
Supabase's current Pro page starts at $25/month, with a $10 compute credit covering
one Micro project. Auth, storage and egress overages remain usage-dependent;
no downgrade or billing change was made. [Supabase pricing](https://supabase.com/pricing)

D1 charges for rows scanned, rows written (including index work), and storage.
Current Free allowances are 5M rows read/day, 100K written/day and 5 GB total;
paid allowances/rates differ. Workers, Vercel, Supabase and external integrations
must be budgeted separately. A data copy is not proof of lower serving costs;
measure the actual query plans and workload. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

D1 limits, backups and import behavior should be checked before cutover:
[limits](https://developers.cloudflare.com/d1/platform/limits/),
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/),
[import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Cutover gates — not yet satisfied

1. Resolve the live/master schema differences without changing another chat's
   grant patch; repeat the live audit after all production changes land.
2. Implement the typed D1 serving layer and all security, RPC, trigger and public
   view behavior. Run existing RLS scenarios against the replacement boundary.
3. Port every web/mobile/direct-script and cron/Stripe writer. Exercise complete
   user flows on an isolated preview: signup/login/reset/deletion, onboarding,
   directory, RFP posting/payment/interest/docs, forum, projects/photos/reviews,
   marketplace, jobs/talent, trusted lists, intel, billing and notifications.
   Validate hidden/absent-live features against the repository candidate too.
4. Prove consistent initial copy, concurrent insert/update/delete replay, delete
   cascades, checkpoint recovery, duplicate events, schema drift rejection and
   reverse replay. Record acceptable lag and downtime; no timing commitment is
   implied by this branch.
5. Take/download a native Supabase backup covering auth as well as application
   tables, and a storage-object inventory/backup. Restore-test it in isolation.
   Rehearsal JSONL contains auth IDs only, not passwords or a full project backup.
6. Capture a D1 backup/bookmark, restore it into a staging target and compare all
   records again. Confirm the account's actual Time Travel retention/limits.
7. Present a concrete cutover/rollback report and obtain the user's approval.
   Only then freeze writers/jobs, drain/reconcile source changes, validate the
   final checkpoint and route traffic. Retain source data through the agreed
   rollback window. Never delete Supabase data as an incidental cleanup step.
