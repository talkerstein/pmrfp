# Sealed Auth shadow import review — November 6

The user explicitly approved this import on November 6. It is applied and exactly verified: 76 accounts, zero sessions, zero verification tokens, zero Worker bindings, matching mapped fields/hashes/metadata, valid foreign keys and integrity. Supabase login remains unchanged. Native failure rollback was verified with separate synthetic accounts before the real import.

## Proposed destination and boundary

Create `pmrfp-auth-shadow-20261106` in Licenses@talkerstein.ca's Cloudflare account. Import all 76 supported accounts in one atomic D1 batch. Leave the database unbound to every Worker and mark it `sealed`. It deliberately has no synthetic-serving marker, live login URL, signup handler, sessions, outgoing email or production configuration. Existing Supabase login remains authoritative.

## Data and preservation

The approved expiring Source view supplies IDs, email addresses, bcrypt hashes, verification/ban state and account metadata. No plaintext passwords, active sessions, refresh tokens or MFA secrets are read. IDs exactly match the 76 Auth IDs in the verified native application copy. Hashes remain unchanged; verification and ban state are preserved. Dates are normalized to ISO text for the pinned D1 adapter. Original approved metadata is retained as opaque JSON in `_auth_source_metadata`; it cannot grant administrative privileges. Imported Auth roles are `user`; application roles remain separately governed by application profiles and require integration before cutover.

Only the protected, checksummed owner-readable export is accepted. Its current expiry and capture age (at most 24 hours), complete exact fields, count, duplicate IDs/emails and unsupported account types are checked before preparation. All 76 current accounts have supported bcrypt credentials and no phone, anonymous, SSO or deleted-account cases. Future unsupported cases stop preparation.

The private payload is `.d1-private/auth-shadow-plan-v3-20261106.json`. Do not paste or commit its contents. The plan is generated with `scripts/d1-auth/prepare-shadow.mjs`; `scripts/d1-auth/import-plan.mjs` contains mapping and atomic statement generation. Both export and payload contain sensitive authentication material. A fresh protected export/plan is required if the current one becomes stale.

## Verification and recovery

The native synthetic canary (`pmrfp-auth-shadow-canary-20261106`) proves that a failed final statement rolls back table creation and all inserted credentials/metadata, and that a successful batch preserves mapped fields and hashes exactly. It has zero sessions and no serving marker. Local tests also reject tampered/stale exports and unsupported identities. Real import must be followed by exact readback of each mapped field, metadata and hash, and a check that no Worker binding or live login configuration was added. Reports must expose only counts/checksums/status.

Source credentials and customer rows are unchanged. Importing the real hashes copies sensitive authentication data persistently to Cloudflare; the Source reader's November 12 expiry does not automatically delete the destination copy. No source shutdown or live Auth switch is included. Application/profile integration, mail/verification/reset flows, full native authorization tests, final reconciliation and explicit cutover remain required.
