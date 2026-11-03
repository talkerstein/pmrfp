# November 3 verification

Production remains on Supabase. No production cutover or copied-data application
writes are enabled.

## Source and checkpoint

The D1 quota-reset canary passed: durable consumer metadata was written, read
back under exact-schema validation, removed and the three original synthetic
records reverified. Bootstrap registration revalidated every field of all 79,179
copied records. Its 11 retained source receipts produced zero new acknowledgements.
The durable consumer checkpoint is now registered on the copied preview.

A fresh read-only source audit matches November 2 after capture installation:
108 public tables, columns, constraints, indexes, policies, functions, row/event
triggers, views and publications. The existing reader and bounded private ACK
function still expire November 5 at 10:00 UTC.

## First live incremental extraction

The repeatable-read, read-only transaction captured 36,943 pending event IDs and
returned 23,931 current/replacement row packets. Reconstructing the complete
source snapshot produced 87,958 records. Every reconstructed field matched the
full source read in the **same transaction**. Incremental packets used 16,497,000
bytes; the additional full verification transferred 57,070,988 bytes. This first
audit therefore does not claim production egress savings.

The approved derived rebuild contains 87,793 records and preserves all
unlisted authoritative fields. Its journal contains 23,874 changed records.
The old 100-row packing cap exceeded the 500-statement batch bound before native
mutation. Vectors now permit up to 500 rows while retaining the 90,000 UTF-8-byte
bound, scalar types, parameter limits, atomic guards and single-transaction replay.
All 84 offline tests pass. The exact captured data passed local
forward/reverse/reapply at expression-depth limit 64, including durable baseline
metadata. A separate native synthetic test passed intentional failure rollback,
forward replay, reversal and staging cleanup with the larger vectors.

## Native replay status

Native real-data forward replay passed in one 272-statement atomic batch. All
87,793 destination records, exact schema, foreign keys and integrity checks
passed. Actual baseline and final readback backups were restored into new local
databases and validated. All 36,943 captured events were acknowledged after another full destination
validation; durable receipt-history metadata advanced. A second normal cycle
captured 329 events and transferred 150 row packets (31,745 bytes), with no full
source verification transfer. Its reconstructed source contains 88,031 records;
the approved rebuilt candidate contains 87,866. The 155-change journal passed
local forward/reverse/reapply, native forward replay, exact readback, restored
baseline/final backups, API parity, 329 new ACKs and durable state advancement.
The retained source ACK history now contains 37,283 events. Newer events remain
pending; no unattended scheduler is running.

Live public API comparisons matched every projected field of 1,794 published
RFPs, 45 categories, 88 regions, 21 property types and all three public photos.
The photo gateway rejects invalid keys and application writes. The local preview
dataset pin was updated; production configuration was not changed.
To avoid repeated daily-quota consumption, today's exact-data reversal is local;
native reversal/failure behavior is verified on the isolated synthetic canary.
Earlier real-data native forward/reverse/reapply evidence remains historical.

Continuous scheduling, broader application write/job/billing conversion,
Auth/Storage handling, full end-to-end verification and approved cutover remain
unfinished.

## Complete-exit scope

The user explicitly selected replacing Auth and Storage as well. An aggregate
read-only dashboard inventory found 69 email/password users, 61 confirmed emails,
three current bans, no MFA/passkeys/SSO/social identities, eight buckets and 61
objects including three private project photos. Five local Better Auth synthetic
login/import/session tests pass. Two PGlite permission/expiry tests pass for the
review-only Auth reader extension. After explicit approval it was installed;
a protected local 69-account export was checksummed, with no secret values printed
or committed and no real-account Cloudflare import. A new private R2 migration
bucket was created. See [FULL-SUPABASE-EXIT.md](FULL-SUPABASE-EXIT.md) for remaining
gates and the boundaries of this evidence.

## R2 file backup/copy

All 61 captured objects now have checksummed local backups and matching native
R2 readbacks: 58 public source files (46,839,955 bytes) and three private project
photos (777,531 bytes). Every file was downloaded back from the new R2 bucket and
its SHA-256 compared with the validated source backup. Public downloads checked
source ETag, length and MIME; private dashboard downloads matched captured source
size and MD5/ETag. Source objects were not modified or deleted.

The migration bucket `pmrfp-storage-migration-20261103` has its managed development
URL disabled and no custom domains, verified again after all uploads. A synthetic
put/get checksum canary passed and its test object was removed. No application
storage gateway, URL remapping, private access serving or storage cutover is
implemented by these copies. The storage downloader adds five offline boundary
and tamper tests, bringing that suite to 89 passing tests. CI also verifies 149
relevant Worker contracts and five isolated Auth tests; typecheck and targeted
lint pass. Production traffic remains on Supabase.
