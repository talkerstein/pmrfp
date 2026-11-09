# November 9 migration checkpoint

The live Supabase catalog matched the previous audit (116 application tables and 232 capture triggers). A normal incremental cycle transferred 16,231,556 bytes of changed rows, not a full source export. The isolated D1 copy contains 157,539 records after the approved derived-data rebuild. Local apply, reversal and reapply matched exactly; the native before/after backups both restored and matched their respective snapshots.

After the native restore checks, Supabase acknowledged all 26,523 captured changes. The read-only health check matched the durable D1 checkpoint and 131,844 retained acknowledgements. It found 58 newer events still pending at the time of inspection. The reader expires November 12 at 15:30 India time. The read-only Worker matched all fields on 1,792 published listings and all 45 categories, 88 regions, and 21 property types against the November 9 source snapshot. The earlier app preview dataset selection and production were not changed.

All 61 previously inventoried public images (48,561,650 bytes) matched their original public metadata and their full R2 readback checksums. The protected app preview issued a short-lived link for the largest image; the direct Worker download matched all 9,593,514 bytes and denied a tampered signature. This verifies serving through a dedicated rehearsal route. It does not change existing image references or verify newly added storage objects. See [the public image rehearsal](PUBLIC-ASSET-PREVIEW.md).

The refreshed snapshot contains no project rows referencing the three archived private project photos. The offline comparison emitted counts only. These files remain sealed in the private migration archive and are not bound to the public Worker. The existing synthetic photo rehearsal remains the upload and access-policy test for future projects.

Production remains on Supabase. The next release gates are stable file URLs and a fresh storage inventory; production account and authorization flows; application, mobile, background-job and payment writes; monitored sync; and a tested freeze, final reconciliation and rollback before cutover.
