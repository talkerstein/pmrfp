# Incremental consumer — live manual cycles verified November 3

## November 6 checkpoint

Workers Paid is active after explicit approval. The new isolated native copy contains 144,032 exactly verified records across 117 tables after two normal incremental cycles; its native readback backup has been restored and verified. The separate expanded read-only preview matches 1,786 public listings and taxonomy. All 64 current files have matching R2 readbacks. The approved 76-account Auth shadow copy is sealed, has no sessions or Worker bindings, and does not switch login. All 67,518 bootstrap receipts and 520 follow-up receipts are acknowledged; durable receipt history is 105,321. Native synthetic login-to-D1 and private R2 file operations pass; real account/mail/file integration remains unfinished. See [VERIFICATION-2026-11-06.md](VERIFICATION-2026-11-06.md). Older dated sections remain historical.

## Current checkpoint — November 5

See [VERIFICATION-2026-11-05.md](VERIFICATION-2026-11-05.md). Reader/ACK/Auth-export access is renewed until November 12, 15:30 India; capture covers 116 public tables. The refreshed 141,068-record candidate is validated locally only. The active native copy remains November 3 (87,866 records), with no new ACKs today. Native synthetic Auth login/session/revocation checks pass; real Auth and storage integration remain unfinished. Free-plan capacity blocks the expanded native refresh. Historical dated sections below describe their original checkpoints.


The historical November 2 preparation/resume notes below are retained for context.
On November 3 the quota-reset metadata canary and idempotent bootstrap registration
passed. Two manual incremental cycles then completed native forward replay, exact
field/schema/FK validation, restored baseline/final backups, bounded source ACKs
and durable consumer-state advancement. No unattended scheduler is enabled.

The first cycle captured 36,943 receipts, compared its complete reconstruction
against a full source read in the same transaction, and advanced to 87,793 rebuilt
records. The second captured 329 receipts using 150 row packets (31,745 bytes),
with no full-source transfer, and advanced to 87,866 rebuilt records. Both exact
journals passed local forward/reverse/reapply; native failure rollback/reversal
was checked on the isolated synthetic canary. Real-data native reversal was not
repeated today, to avoid duplicate daily-quota consumption. Actual before/after
readbacks were restored and verified. See [VERIFICATION-2026-11-03.md](VERIFICATION-2026-11-03.md).

The active baseline artifacts are now `reader-snapshot-20261103-cycle2.jsonl`
and `reader-rebuilt-20261103-cycle2.jsonl` in ignored private artifacts. Do not
re-register or replay the earlier November 2 bootstrap over this acknowledged
checkpoint. Retained source receipt history contains 37,283 acknowledged events;
newer and late-committing events remain pending. Reader/ACK expiry is unchanged.

## Historical November 2 preparation


**Local tests and live read-only preflight pass. Native activation and the first
live incremental replay are blocked by the exhausted D1 daily write allowance.**
The completed bootstrap is still validated: 79,179 copied records, with all 11
bootstrap receipts acknowledged. Neither copied preview nor synthetic canary has
`_migration_capture_state` yet. Do not treat the earlier successful bootstrap ACK
as registration of this newly introduced consumer checkpoint.

## Consistency and recovery

`capture_state.py` keeps a single durable D1 metadata row linking the full local
source SHA, approved rebuilt-candidate SHA, catalog SHA and SHA-256 digest of the
retained source acknowledgement receipt set. Exact known metadata schema and row
shape are validated separately from application data. It never authorizes app
access. Application-data readback backups omit this control row; restoring one
requires a fresh bootstrap before normal incremental consumption.

`acknowledge_capture.py` verifies the entire native candidate before acknowledging
any source receipts. Acknowledgements are bounded, serializable and reject IDs
already assigned to another candidate. After all ACK batches, it reads the full
acknowledged-receipt-set digest and atomically advances D1 control metadata under
the validated manifest guard. A lost response can be retried idempotently. Partial
ACK recovery excludes only this exact operation's captured IDs assigned to its
exact candidate from the old-history comparison. Foreign checkpoint receipts are
not excluded. No source application-table write is issued.

A rewind of D1 control state is detected by the changed source receipt-set digest.
A missing/unrelated control state is refused. Copied-preview journal reversal is
also refused when its starting checkpoint has already been acknowledged. A new,
unacknowledged candidate can be reversed to its acknowledged baseline for rehearsal;
finish forward/reverse/reapply and backup checks before acknowledging that candidate.
Keep one migration consumer; no unattended scheduler has been enabled.

## Incremental extraction

`incremental_capture.py` requires the pinned copied preview, verified source
TLS/reader identity, matching durable state and a complete native baseline check.
One PostgreSQL repeatable-read, read-only transaction then:

- Checks the source role/permissions/expiry, queue marker, exact registered and
  actual primary-key inventories, columns, capture trigger definitions/enabled
  states, reviewed private definer bodies/configuration and application functions.
  Application-function comparison uses the same extension-function exclusion as
  the authoritative catalog audit. The real `pg_trgm` fixture checks this policy;
  new application functions still cause refusal. The RFP revision trigger must
  remain enabled and attached to the audited function.
- Checks the entire acknowledged receipt-set digest against durable state.
- Captures **all unacknowledged** receipt IDs as strings, with no maximum-ID
  watermark. More than 75,000 pending events fails closed rather than splitting
  a committed source transaction.
- Reads current rows for distinct pending keys, using typed primary-key lookups.
  Missing current rows become deletes, repeated events coalesce, and key changes
  include both old and new keys. A TRUNCATE replaces that complete table, including
  an empty result. Auth IDs are refreshed from the approved ID-only shim each time.
- Returns a checksummed private delta. The client reconstructs a complete source
  snapshot from its validated prior snapshot and checks every field and FK locally.
  Guard metadata is aggregated and row packets share one UNION ALL query to avoid
  hundreds of network round trips.

The optional `--verify-full-source` transfers all source rows in that **same**
transaction and compares every reconstructed field against them. Use it for the
first live run after the quota reset. Its report separates incremental packet
bytes from full-verification bytes; that first audit still transfers the full
source. Normal later runs omit the full-transfer option. No production egress
saving or successful live incremental replay is claimed yet.

## Resume after the quota reset

Use new private artifact paths for each run and the existing protected reader
credentials; never put passwords/tokens in command arguments, logs or Git.
Set the production catalog/schema environment variables used by the prior run.

1. Verify the durable metadata write/readback and optional-schema checks on the
   synthetic canary, then remove only its recognized test metadata and reverify.
2. Re-run the existing full bootstrap acknowledgement **idempotently** against the
   79,179-record candidate. Existing receipts should produce zero new ACKs; the
   new step registers its durable D1 consumer checkpoint after native validation.
3. Export the first incremental capture with `--verify-full-source`; verify the
   same-transaction full-source comparison. Import the resulting complete source
   snapshot locally and perform only the approved derived rebuild.
4. Plan the candidate journal. Rehearse it locally, then on the pinned read-only
   copied preview, including rollback/reapply, all-field/FK checks and restored
   readback backups. The consumer metadata remains at the prior ACK baseline
   during this rehearsal.
5. Acknowledge only that capture's IDs after final native validation. Recheck the
   durable control row and retained source receipts. Newer/late events remain pending.
6. Update the local preview dataset pin and repeat relevant API parity checks.

The existing source reader and private ACK function expire November 5 at 10:00 UTC.
Renewal requires a separately reviewed/approved reader and ACK-expiry change.
Replay scheduling, freshness-gated writes, broader application conversion, Auth,
Storage and production cutover remain separate unfinished gates.
