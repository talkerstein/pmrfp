# Recorded rehearsal result — 2026-10-21

The latest pinned staging database is `pmrfp-migration-staging-v2-20261021`
(`80b90607-2f8d-4f9b-a646-658f2ebad0bc`). It is private and has no application
serving endpoint or production traffic.

- Initial source export: 59 public tables, 9,913 public records, 48 auth-ID
  references; 60 copied tables and 9,961 records in total.
- Source verification: exact row counts and MD5s emitted by the same read-only
  repeatable-read query; strict table/column coverage and JSONL SHA-256 footer.
- Two live exports were identical; local reconciliation correctly made no changes.
- Initial local copy: all fields identical, all foreign keys valid.
- Local backup/restore: all 9,961 records matched the earlier snapshot.
- Remote D1 copy: full candidate table/index schema matched; every field of all
  9,961 records matched; `PRAGMA foreign_key_check` returned no violations and
  D1's `PRAGMA quick_check` passed.
- Backup built from the actual remote D1 readback, restored to a separate local
  database: all 9,961 records and relationships matched.
- 18 offline tests passed. They cover changed rows, insertions, deletions,
  no-op replay, checksums, coverage/drift rejection, rollback on relationship
  failure, tampering, backup preservation, generated fields, NULL/malformed JSON,
  decimal precision and the remote staging-load safety boundaries.
- Current-master candidate (85 public tables) accepted by the native local D1
  runtime. The repository schema replay includes the grants and city-source
  migrations now on master.
- No production application code, Supabase migration, source row, source grant,
  source job or storage object was changed by this branch. No credential or
  production row export is tracked by Git.

The first staging generation is retained as an earlier rehearsal copy. Raw CSV,
JSONL, SQL imports, database backups and logs are under the ignored, mode-0700
`.d1-private` directory; files are mode 0600.

The source has since advanced: a read-only follow-up reports 85 public tables,
141 public policies and 13 views. The D1 snapshot is deliberately marked
**not current production** in `d1/rehearsal-report.json`. It is evidence for the
copy/validation pipeline, not evidence that ongoing synchronization is running.

Application-serving parity, continuous CDC, in-place remote delta replay,
reverse-write replay, full Auth/Storage restore and production cutover have not
been implemented or demonstrated. They remain explicit gates in the README.
