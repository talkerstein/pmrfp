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

## Completed bootstrap checkpoint

Native validation and restored backup gates passed. All 67,518 captured receipts were acknowledged in bounded transactions; durable consumer-state readback passes. Retained Source acknowledgement history now contains 104,801 events. Older/late events not captured by this consistent snapshot remain pending. A normal follow-up cycle transferred 172 row packets (68,557 bytes), without a full-source transfer, and reconstructed 143,973 source records. Its approved candidate contains 143,788 records. The 175-change journal passed local exact forward/reverse/reapply, native forward replay and exact readback, and restored before/after native backups. A fresh native synthetic staged-journal failure/forward/reversal canary also passed. All 131 captured follow-up receipts were acknowledged; retained history is 104,932 and the durable checkpoint was advanced. Current candidate SHA: `1b2e5b5397d64151aa5aae3df4b94b937a853c81d077f627ed6ddb131a14e3bc`. Public listing/taxonomy parity still passes.

## Native application and file rehearsal

`pmrfp-native-auth-app-sandbox` uses a private service binding to the synthetic Auth Worker, a separate synthetic application D1 database and a separate R2 sandbox bucket. No Supabase Auth is configured. Signed native sessions authorize save/read/unsave, isolate users, deny current profile suspension and Auth bans, and immediately deny reads/writes after logout. Auth metadata roles cannot substitute for current D1 profile/ownership checks. Missing synthetic markers and the Source-dependent private-detail endpoint fail closed.

Native private-image tests pass for owner upload/read/HEAD/delete with byte-hash comparison, non-member denial, current unlisted/private visibility checks, denied non-member writes, immediate membership/visibility revocation and idempotent deletion. Real migration files were not touched. The read/write route is synthetic-only; it does not integrate real application uploads, Sharp processing, share/reviewer access or anonymous serving. Its asynchronous authorization errors are caught at the Worker boundary and return controlled status codes.

## Hostinger SMTP preparation

The user identified the existing active `info@pmrfp.com` Hostinger mailbox and supplied its credential through an owner-only local input form. Verified TLS authentication succeeds from this computer with Python and the Node transport; zero emails were sent. Credential values are not displayed, logged or committed.

Hostinger currently resolves to Cloudflare IP ranges. Workers [block outbound TCP to Cloudflare addresses](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/), so direct native socket and Node-compatible probes could not connect. The temporary unused SMTP secrets were removed from the synthetic Auth Worker. The existing Vercel/Node application is the selected SMTP transport, without a Supabase dependency.

A new preview-only, gateway-protected `/api/migration/auth-mail` handler verifies SMTP only; sending is not enabled. Its exact Proxy exemption avoids a Source Auth refresh; production is always denied. SMTP/password/gateway/mode configuration is scoped to the migration branch's Preview environment, not Production. Local transport and authorization tests pass. The exact `ab44eca` Vercel Preview successfully authenticated with Hostinger using verified TLS on port 465 and returned `authenticated: true, emailsSent: 0`. Protected proof: `.d1-private/vercel-smtp-verification-20261106.json`. Controlled delivery testing is still pending; real Auth email callbacks are not enabled.

## Tests and limits

93 Python migration/storage tests, 170 Worker/application contracts, 18 isolated Auth tests, root typecheck and targeted lint pass. Native synthetic reset and sealed-import rollback/readback checks pass. New Auth imports use no plaintext passwords, sessions, refresh tokens or MFA secrets. Private exports/plans/readbacks are ignored and excluded from Git.

Full exit remains unfinished: monitored change sync, application Auth/profile/verification/reset/mail/mobile flows, current native authorization at application boundaries, R2 serving/ownership/private rules/upload/delete flows, application/job/payment writers and RPC/trigger parity, full end-to-end testing, final reconciliation/rollback and approved cutover. The sealed account copy is not a serving Auth replacement.


## Generated Auth email callbacks and native link proof

The user confirmed delivery of the single explicitly authorized test from `info@pmrfp.com` to `dev@talkerstein.ca`. No additional SMTP messages were sent. The Vercel verification bridge remains verify-only; live Auth delivery is not connected.

`synthetic-mail.mjs` replaces the reset callback's discarded message with a bounded private synthetic outbox. It accepts only pinned fixture UUIDs, `@example.invalid` recipients, the exact Auth origin, recognized generated paths and same-origin callback URLs. Reset and verification validity are 15 minutes. The outbox retains only the last message per fixture and kind in the isolated Auth D1 verification table; it is not publicly readable and emits no URLs/tokens in responses or logs.

All 26 Auth tests pass, including actual Better Auth callbacks and generated links, verification expiry, reset expiry, replay rejection, old-password denial and session revocation. The deployed native Worker version `4300662c-158e-459a-bf6a-e58716ce0b96` also passed generated verification-link confirmation, unverified/verified login checks, expired reset denial, successful reset, session revocation and reset replay denial. Fixture verification state was restored, test sessions and outbox/reset records removed. Evidence: `.d1-private/auth-mail-outbox-native-report-20261106.json`. No real accounts, Source rows or external email messages were involved in this proof.

The existing Vercel Preview is deployment-protected. SMTP authentication and local test delivery are proven independently; Cloudflare-to-relay authorization and actual Auth message delivery remain separate unfinished work. No protection setting was disabled.


## Cloudflare-to-Vercel synthetic dry run

The private synthetic Auth Worker successfully forwarded its actual verification/reset callback envelopes to the protected Vercel Preview using a temporary same-project development OIDC token. The relay accepts only pinned fixture IDs, `@example.invalid` recipients, exact generated Auth paths, same-origin callbacks, bounded bodies and fixed templates. It returns only `validated: true, emailsSent: 0`; SMTP sending is disabled. Arbitrary recipients, redirect origins, duplicate link parameters and text overrides are denied.

The native test passed verification confirmation, verified/unverified sign-in checks, expired-reset denial, reset completion, session revocation and replay denial with the relay enabled. Evidence: `.d1-private/auth-mail-relay-native-report-20261106.json`. A Workers runtime incompatibility with `redirect: error` was corrected to `manual`, and every non-success status including redirects is rejected; a regression test covers redirects and the fetch receiver. No deployment protection was disabled or trusted-source rule broadened. Temporary Worker relay mode/gateway/OIDC secrets are removed after the proof; the default private synthetic outbox remains available. This proves the protected dry-run path, not SMTP delivery from Auth callbacks or a production mail rollout.

Validation for this follow-up: 26 Auth tests, 139 API contracts, root typecheck and targeted lint pass. Commit `92872f5` passed both GitHub CI runs and the full Vercel Preview build. Later small hardening/evidence changes are checked separately.


## Existing test-account native credential rehearsal

After separate explicit authorization, exactly the pre-existing migration test account was copied into a separate D1 database and served through a short-lived gateway-protected login-only Worker. Its original bcrypt password and UUID worked; wrong passwords, customer identities, active bans, expired manifest, signup/reset/admin paths were denied. Session lookup and logout revocation passed, with at most 15-minute sessions. No application provider or production setting switched.

The Worker, database and temporary deployment secrets were removed after proof and resource absence verified. The 76-account shadow remains sealed with zero sessions. Evidence: `.d1-private/existing-account-native-report-20261106.json`; design and applied result: [EXISTING-ACCOUNT-AUTH-REHEARSAL-2026-11-06.md](EXISTING-ACCOUNT-AUTH-REHEARSAL-2026-11-06.md). All 31 Auth tests pass, including five additional import/identity/ban/expiry contract tests. This snapshot credential proof does not establish customer ban synchronization or application-wide native Auth integration.
