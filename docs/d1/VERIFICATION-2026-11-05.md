# November 5 migration checkpoint

Production remains on Supabase. No cutover, billing change, application writer activation or real-account Auth import occurred.

## Completed

- Rebased the migration branch onto master `3ce55b1`.
- Installed the explicitly approved reader, bounded ACK and private Auth-view renewal until November 12, 15:30 India. Verified zero application-table write privileges and no direct Auth password-table grant.
- Installed the approved eight-table SELECT/capture extension. Live checks confirm 116 registered public tables and 232 enabled key-only triggers. All eight new tables were empty at the captured snapshot. The catalog also preserves two new notification-preference columns and records two new private storage buckets.
- Exported a consistent 141,250-record source snapshot across 117 tables, including Auth IDs, and captured 62,462 pending receipt IDs. The approved derived-data rebuild produced 141,068 records. Local field preservation, schema, foreign-key and integrity checks passed. This expanded copy has NOT been uploaded or acknowledged.
- Refreshed the protected local Auth export to 74 accounts. Actual hashes remain ignored, private local artifacts; no real accounts were uploaded to Cloudflare.
- Deployed an isolated, private-gateway synthetic Auth Worker backed by native D1. Four fabricated accounts use cost-10 bcrypt hashes. Final live checks pass for gateway denial, existing-hash login with unchanged UUID, wrong-password denial, unverified/banned denial, expired-ban acceptance, session reads and immediate sign-out revocation. No Source Auth writes occurred.
- Verified and restored a backup of the obsolete October 21 staging database (9,961 records). It has not been deleted, reset or reused.

## Verification

89 Python migration/storage tests, 154 Worker contract tests, nine Auth tests, root typecheck and targeted lint pass. Final synthetic Worker deployment: `28c69417-eadd-4e7a-8e9e-8123a7e9c695`. No full application build or complete customer-flow claim is made.

## Capacity and remaining work

The account dashboard confirms Workers Free. Its D1 limits are 100,000 rows written per day (index writes add to usage) and ten databases; the synthetic Auth database occupies the tenth slot. The 141,068-record refreshed bootstrap exceeds that daily allowance before indexes. No expanded native upload was started. A paid capacity decision or approved retirement/reuse of old staging with staged loading is needed before proceeding. Paid Workers starts at $5/month plus usage; no upgrade was made.

The active copied read preview remains the November 3, 87,866-record checkpoint. Its 37,283 retained Source ACKs remain intact; no new receipts were ACKed today. The fresh local candidate must not replace its durable native checkpoint until upload and exact native verification succeed.

The November 3 archive of 61 files remains verified in private R2. The two newly observed private buckets have not been refreshed/copied today. Storage serving, URL replacement, private rules and upload/delete integration remain unfinished.

Full exit still requires native refreshed-data verification; monitored change synchronization; real Auth import and application/profile/email/reset/session integration; storage integration; application/job/payment writers and equivalent authorization/RPC/trigger behavior; end-to-end testing; final reconciliation, rollback and approved cutover. Synthetic sign-in does not prove all Auth flows or production CPU capacity.

Private evidence is retained under ignored `.d1-private/`; no source rows, passwords, hashes, tokens or object paths are included in this checkpoint.
