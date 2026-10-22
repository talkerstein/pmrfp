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

## October 22 rebuild and preview verification

The repository replay now covers 98 public tables (master `da918b5`), 164
public/storage policies, 62 functions, 37 row triggers and 20 views. The original
production snapshot and its checksums are unchanged.

- Remote synthetic sandbox `pmrfp-api-sandbox-20261022`: all 98 public tables
  accepted by Cloudflare D1; synthetic seed loaded; foreign_key_check empty;
  quick_check `ok`. It has no production records.
- Private rebuilt candidate from the Oct 21 remote readback: karma/forum
  aggregates rebuilt and transient rate-limit hits reset. The hash of all other
  rows/columns remained identical; local foreign keys and quick_check passed.
- 24 preview/Next route/rebuild integration tests pass, plus 22 existing karma
  scoring tests; 18 offline migration tests pass.
- Full application suite under Node 24.22.1: 2,064 passed, two skipped (before
  adding the four Next route tests, which pass separately).
- Next 16 production build and typecheck pass under Node 24. The build retains
  an existing dynamic filesystem trace warning in contract-history sources.
- Worker bundle dry run passes. Deployed HTTP/Auth/session verification is
  pending Cloudflare Worker permission consent and public Supabase Auth setup.

The machine's Node 26 produced five unrelated site-tracking localStorage test
failures; all five passed under Node 24. An isolated dependency install fixed the
worktree's original Turbopack symlink failure. No changes were made to those
tracking tests or the other checkout's dependencies.

This adds opt-in application code to the branch, not a production configuration
change. See `PREVIEW.md` for the remaining source-backed consumers and explicit
cutover guards.

## October 22 completed live preview and new datasets

Worker permissions were explicitly authorized. The synthetic and copied-read
Workers are deployed. The new source catalog has 98 public tables, 163
public/storage policies, 63 functions, 37 triggers and 20 views; shared columns
match the repository baseline. The old Oct 21 files remain unchanged.

The new consistent read-only source export contains 10,791 public rows plus 51
Auth ID references: 10,842 records. V3 staging matched every field and table/index
definition, passed foreign keys/quick_check, and its actual D1 readback backup was
restored and revalidated. The separately checksummed rebuilt dataset contains
10,726 records after resetting 129 transient rate-limit hits and regenerating
karma caches (13 additional zero-score cache rows). All authoritative fields
were identical. Its remote D1 copy, actual readback backup and restored local
copy also passed complete validation. Neither data copy accepts preview writes.

At the user's request, one isolated, non-deliverable test account was added to
Supabase Auth and paired with synthetic sandbox fixtures. Its profile was set up
without publishing a business listing or creating source RFPs. The source
snapshot predates this account. Actual signed requests through the Next API
saved/listed/removed a synthetic RFP in Cloudflare; both actions returned 200.
The signed-in browser displayed the saved item, then the empty state. Source
saved-RFP rows remained zero. Passwords, tokens, screenshots and row exports are
private/ignored. Production Vercel traffic/configuration is unchanged.

Cloudflare's native runtime rejected redirect:error; manual redirects now fail
closed without forwarding Auth tokens. Live missing-gateway, missing-user and
invalid-token checks return 401/private/no-store. The preview/privilege/karma
suite now has 48 passing tests, and offline migration/rebuild tests have 21.
The user approved and we applied the expiring reader and 19 narrowed definer
grants; an ID-only, reader-only view handles the managed Auth schema. Live TLS
verification succeeded with the Supabase CA. Reads passed; inserts (even in an
explicit read-write transaction), role switching, Auth password reads and all
19 restricted definer calls were denied. See `reader-verification-2026-10-22.json`
and `READER-ACCESS.md`.

The first automated repeatable-read export contains 10,893 records across 99
copied tables. Local reconciliation accepted the source changes, compared all
fields and relationships, and validated a restore of its previous-checkpoint
backup. The approved rebuild produced 10,776 records with authoritative fields
identical. The latest remote upload is **not complete**: Cloudflare returned
error 7500 (daily free row-write allowance exhausted) before accepting the
manifest CREATE. The new empty target is not serving traffic. Existing verified
full/rebuilt remote copies are unchanged. Continuous CDC remains unimplemented.
