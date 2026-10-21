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
