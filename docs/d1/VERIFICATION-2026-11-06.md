# November 6 migration checkpoint

Production remains on Supabase. No application traffic or live login switch occurred.

## Verified results

- User approved Workers Paid and its final legal/billing agreements. Cloudflare confirmed the subscription active at $5/month plus usage. No unrelated paid add-ons were purchased.
- Live source catalog matches the November 5 post-extension catalog for columns, constraints, indexes, policies, functions, triggers, event triggers, views and publications. Reader/ACK/Auth-view expiry remains November 12, 15:30 India; 116 public tables and 232 enabled capture triggers remain covered, without app-table writes.
- Fresh consistent source snapshot: 143,904 records across 117 tables, including Auth IDs; 67,518 captured pending receipts. Approved rebuilt candidate: 143,719 records. All authoritative fields are preserved. Source SHA `59485c9310e1e8ebc2bf3cb2ac908f7df35bf22bcc9635c2b2ebcf829989eacf`; candidate SHA `20a63ef88efd2c83915049f0eeb82aa84ba8b7432e94c8955a7b1c442a772863`.
- New isolated database `pmrfp-rebuilt-staging-20261106` has all 143,719 records. Exact native field/schema/FK/integrity validation passes. A backup built from native readback has been restored and exactly validated. The previous copied preview/database was preserved.
- Packed bootstrap reuses byte-bounded JSON scalar vectors while retaining FK row order, complete partial-target verification and a loading-checkpoint guard per batch. An interrupted initial small-batch load was safely resumed after exact partial readback. Local typed/Unicode/pagination/resume/tamper tests and native synthetic packed resume pass.
- Separate gateway-protected read-only Worker `pmrfp-d1-expanded-read-preview` serves the new copy. All 1,786 published listing projections, 45 categories, 88 regions and 21 property types match the captured source. Existing application preview selection is unchanged at this checkpoint.
- Refreshed protected Auth export: 76 accounts. Native synthetic reset tests prove token/password/session atomic failure rollback, successful retry, old-password denial, session revocation, token replay denial and a single winner under concurrent reset attempts. The transport is a synthetic sink; no real emails were sent.
- After explicit approval, 76 real Auth accounts were atomically copied to sealed `pmrfp-auth-shadow-20261106`. Every mapped field, hash and opaque metadata value matches; all IDs match the native application copy. Zero sessions, verification tokens and Worker bindings. No synthetic serving marker exists. Supabase login stays authoritative. See [AUTH-SHADOW-REVIEW-2026-11-06.md](AUTH-SHADOW-REVIEW-2026-11-06.md).
- Source storage inventory: ten buckets, 64 objects, 49,339,181 bytes. Three new public logos were copied to the existing private R2 migration bucket. All 61 public objects and three private objects have matching current native R2 readbacks. The three private source metadata revisions are unchanged from their verified source backups. Both newer document buckets are empty. R2 development URL remains disabled and no custom domains exist; application storage URLs are unchanged.

## Checkpoint advancement in progress

Native validation and restored backup gates passed. Bounded acknowledgements of this bootstrap's 67,518 captured receipts are in progress. Do not treat the new copy as a durable incremental baseline until the acknowledgement report and native capture-state readback are complete. Older/late events not captured by this consistent snapshot remain pending.

## Tests and limits

93 Python migration/storage tests, 154 Worker contracts, 18 isolated Auth tests, root typecheck and targeted lint pass. Native synthetic reset and sealed-import rollback/readback checks pass. New Auth imports use no plaintext passwords, sessions, refresh tokens or MFA secrets. Private exports/plans/readbacks are ignored and excluded from Git.

Full exit remains unfinished: monitored change sync, application Auth/profile/verification/reset/mail/mobile flows, current native authorization at application boundaries, R2 serving/ownership/private rules/upload/delete flows, application/job/payment writers and RPC/trigger parity, full end-to-end testing, final reconciliation/rollback and approved cutover. The sealed account copy is not a serving Auth replacement.
