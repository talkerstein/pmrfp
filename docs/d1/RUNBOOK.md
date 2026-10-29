# Rehearsal commands

These commands operate on private local artifacts or the pinned private staging
copy. There is no production cutover command.

## Select the catalog explicitly

```sh
export D1_MIGRATION_CATALOG=d1/production-catalog-2026-10-21.json
export D1_MIGRATION_SCHEMA=d1/production-staging-copy.sql
mkdir -p .d1-private
chmod 700 .d1-private
```

Without these variables, tools target the repository candidate, not the live
schema. Do not mix snapshot/catalog/schema combinations.

## Export source data

Generate the dashboard query, run it in PMRFP SQL Editor, and download all result
rows as CSV. This is a single repeatable-read, read-only transaction; it excludes
auth credentials and exports decimal numerics as text. Every table must appear,
even when empty. For larger datasets use the streamed psql exporter instead.

```sh
python3 scripts/d1/dashboard_snapshot.py sql --output .d1-private/export.sql
python3 scripts/d1/dashboard_snapshot.py convert \
  --input .d1-private/dashboard-export.csv \
  --output .d1-private/snapshot.jsonl
```

Alternatively, configure read-only PostgreSQL connection settings through secure
PG environment variables or `.pgpass`; never place a password in the command:

```sh
python3 scripts/d1/migrate.py export --output .d1-private/snapshot.jsonl
```

The psql exporter aborts on table/column drift. Both exporters require complete
schema coverage and primary keys. A snapshot is invalid without its checksummed
footer. Keep all CSV, JSONL, SQL imports, database files and logs private and
outside Git. The `.d1-private` directory is ignored.

## Copy, reconcile and restore locally

```sh
python3 scripts/d1/migrate.py sync --snapshot .d1-private/snapshot.jsonl \
  --target .d1-private/staging.sqlite
python3 scripts/d1/migrate.py validate --snapshot .d1-private/snapshot.jsonl \
  --target .d1-private/staging.sqlite

# Export another complete consistent snapshot, then reconcile it:
python3 scripts/d1/migrate.py sync --snapshot .d1-private/next.jsonl \
  --target .d1-private/staging.sqlite --backup .d1-private/before-sync.sqlite

# Restore the earlier state to a new file and verify it:
python3 scripts/d1/migrate.py restore --backup .d1-private/before-sync.sqlite \
  --target .d1-private/restored.sqlite
python3 scripts/d1/migrate.py validate --snapshot .d1-private/snapshot.jsonl \
  --target .d1-private/restored.sqlite
```

Never overwrite a snapshot or backup. Hash/count validation covers every field,
not just row totals. The tools raise on unexpected columns, duplicate keys,
corrupt JSON, missing tables and broken relationships.

## Load and inspect the pinned D1 staging database

The approved local Wrangler session can be used explicitly; production code must
use its own scoped credential/binding and must never read a developer's OAuth
file. No credentials are stored in this repository.

```sh
python3 scripts/d1/remote.py load --snapshot .d1-private/snapshot.jsonl \
  --wrangler-auth --report .d1-private/remote-load.json
python3 scripts/d1/remote.py verify --snapshot .d1-private/snapshot.jsonl \
  --wrangler-auth --report .d1-private/remote-verify.json \
  --backup .d1-private/remote-readback.sqlite
```

The verification backup is reconstructed from D1 readback, then checked against
the source snapshot before it is saved. Restore it to a new path using the local
restore command above. If a load reached all rows but stopped during final
validation, `remote.py finalize` repeats full schema/record/FK validation before
marking it validated; it does not waive checks.

This remote loader refuses a different snapshot. Use a fresh, explicitly reviewed
staging generation for changed data until transactional remote delta replay is
implemented. Do not loosen its pinned database guard to point it at production.

A validated local copy can also be converted to a private SQL import:

```sh
python3 scripts/d1/d1_sql.py --snapshot .d1-private/snapshot.jsonl \
  --target .d1-private/staging.sqlite --output .d1-private/import.sql
```

Bulk import can hold the target unavailable; use it only on an isolated staging
copy. If execution outcome is unknown, inspect the target before retrying DDL.
The API loader records the source digest and handles interrupted loads safely.

For a D1 backup, use `wrangler d1 export` into `.d1-private`, then restore its SQL
to a NEW local database and run `migrate.py validate`. Never restore over the
serving database as part of a rehearsal. A database export does not back up
Supabase Storage blobs or Supabase Auth credentials.

## Offline reversible change journal

`journal.py` compares two complete validated snapshots with the same catalog and
creates a private, checksummed before/after journal. Schema changes are rejected;
review and migrate the schema separately first. This still reads full snapshots
from Postgres. It is not CDC, a live remote delta applier, or a production rollback
implementation.

```sh
python3 scripts/d1/journal.py plan BEFORE.jsonl AFTER.jsonl .d1-private/delta.json
python3 scripts/d1/journal.py apply-local .d1-private/delta.json \
  .d1-private/rehearsal.sqlite --backup .d1-private/before-delta.sqlite
python3 scripts/d1/journal.py apply-local .d1-private/delta.json \
  .d1-private/rehearsal.sqlite --backup .d1-private/before-reverse.sqlite --reverse
```

Use the appropriate `D1_MIGRATION_CATALOG` and `D1_MIGRATION_SCHEMA` paths for both
snapshots. The output contains private rows; keep it ignored, mode 0600, and out
of logs. Output journals and backups cannot overwrite existing files. Applying
requires the exact whole-database baseline, validates every before-image and
final destination hash, reserves the writer before baseline checks, captures a
consistent backup, and checks all rows, integrity and foreign keys before the
transaction commits. Cascaded rows reparented in the next snapshot are restored.
Reverse application uses the same validation and backup requirements. A duplicate
replay is rejected unless the journal is a genuine no-op. An error rolls back the
target transaction; preserve its backup for review.

The offline replayer rejects a target containing `_migration_manifest`; serving
checkpoint transitions need their own remote atomic protocol. It must never
leave a validated manifest claiming old data after a local journal mutation.

Oct 23 resumed-session rehearsal: a fresh 11,953-record source snapshot produced
an 11,831-record rebuilt candidate with authoritative fields unchanged. The
144-change journal was applied to a separate restore of actual earlier D1
readback, validated against the new snapshot, reversed, and validated against
the original 11,754-record snapshot. The deployed copied-read checkpoint was
not mutated. See `d1/resumed-report-2026-10-23.json` for aggregate evidence.

## Synthetic remote journal protocol (native verification blocked)

`remote_journal.apply` accepts only the pinned `journal-canary` generation and
snapshots explicitly marked `synthetic-test`. Copied business-data generations
are rejected. It recomputes the journal from both complete snapshots, simulates
cascade handling locally, verifies the entire remote baseline and writes a
private actual-readback backup before mutation. Bound checkpoint/before-image
guards, deferred-FK mutations and a destination `loading` manifest execute in
one batch. Only a successful full schema/row/FK/integrity readback promotes that
destination to `validated`. Retrying after an uncertain response recognizes the
destination checkpoint and verifies/finalizes it without replaying mutations.
Reversal follows the same backup and validation protocol.

Cloudflare documents rollback of a batch if a statement fails:
[D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).
Local integration tests cover rollback, response loss after commit, before-image
races, incomplete destinations, reversal, idempotent recovery and isolation.
Those tests are not native Cloudflare verification.

The isolated canary `pmrfp-journal-canary-20261023`
(`e41a9e60-2022-4511-94b9-12866f921671`) was created. Its first schema write
was refused with Cloudflare error 7500: account daily free-tier row-write quota
exhausted. No synthetic data was loaded and no business copy was changed.
Native forward/failure/recovery/reverse testing remains pending after the
2026-10-24 00:00 UTC reset (05:30 India time). No paid-plan upgrade was made.

Remote verification now reads ten independently paginated tables per API batch,
retaining 250-row pages, ordered primary keys, duplicate detection, exact schema
and every-field validation, and the before/after manifest guard. This reduces
network round trips; it does not reduce the full-snapshot data read requirement.

Despite the write quota block, the new batched verifier was tested against the
actual deployed copy: all 11,754 records across 102 tables matched every field,
with identical schema and valid foreign keys. This verification made no writes.
The complete offline migration/rebuild/journal suite now has 40 passing tests.

## October 29 native recovery verification

After the quota reset, the pinned synthetic canary passed actual Cloudflare D1
failure rollback, forward replay, recovery after a deliberately discarded
successful commit response, reverse replay, full readback, and restored local
backup validation. Both snapshots contain three synthetic records across the
historical 102-table canary schema. No copied business-data generation was
mutated. `d1/checkpoint-2026-10-29.json` records the results. This closes the native
canary gate recorded as quota-blocked on October 23; it does not authorize the
same protocol against production or arbitrary copied datasets.

The branch is rebased onto current master `ff0958c`. New dated source/repository
catalogs and staging SQL cover 108 public tables plus Auth IDs. The historical
catalog/schema remain unchanged so existing checkpoints stay verifiable. The
source dependency audit now finds 120 relations, 20 RPCs and 35 cron definitions;
these remain implementation/audit work rather than ported behaviors.

The resumable loader now verifies the partial schema and every existing row
against the pinned snapshot, then submits only missing records. Changed or
unexpected existing rows abort before further INSERTs. An already validated
matching checkpoint is reverified without reopening `loading` state. The native
synthetic check removed one synthetic profile row, resumed with exactly one
INSERT, and passed complete record/schema validation. These guards reduce
repeated network work after interruption; they do not implement live CDC.

## Copied-data delta opt-in and October 29 quota checkpoint

`remote_journal.apply(..., allow_copied_preview=True)` additionally permits only
`pmrfp-rebuilt-staging-20261029`. It checks the pinned copied-read Worker binding
and read-only mode, matching catalogs/schemas, and approved rebuild policy/parent
provenance for both snapshots. Production, other generations, synthetic metadata
on a real-data target and unsafe configurations remain rejected. Pause owned
local preview consumers during these staging transitions; production-safe
concurrent serving is not implemented by this helper.

Before-images are packed within 100 parameters and 20 predicates per statement.
Balanced boolean trees avoid native D1 expression-depth failures on wide rows.
Every mutation remains in one bounded atomic batch, with pre-update actual
readback backup, complete post-update validation and idempotent recovery.
Source data is not written. Error logs retain fixed categories/codes only, never
SQL, source values, credentials or full provider response bodies.

The pending 311-change journal was fully rehearsed locally against an actual D1
readback, including reversal and reapplication under the native expression-depth
budget. All native read-only guards passed. Native mutation is quota-blocked
until October 30 at 05:30 India. The original physical checkpoint still validates
at 55,322 records; the prepared newer snapshot is 55,529. Preserve both snapshots,
the journal and protected backups. Resume with new artifact paths, keep the
preview paused during mutation, and update its dataset pin only after successful
full validation. No production cutover or reverse writes to Supabase are implied.

Full native readback now pages by the complete primary key, including composite
keys, with duplicate detection and ten-query batches. OFFSET is absent. This
keeps verification scans linear in record count and reduces avoidable read-quota
use; it does not turn full-source export into CDC.
