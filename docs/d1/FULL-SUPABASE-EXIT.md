# Complete Supabase exit

On November 3 the user explicitly selected moving **everything** off Supabase,
including authentication and file storage. A database-only rollout is not the
completion target. Production remains on Supabase until the replacement passes
its cutover gates; no project deletion, billing change or traffic switch is implied.

## Live inventory, November 3

The aggregate-only read-only dashboard query is
`d1/auth-storage-inventory-2026-11-03.sql`; its result contains no emails, password
hashes, tokens or object paths.

- 69 users and 69 email identities; all 69 have bcrypt passwords.
- 61 email-confirmed accounts and three currently banned accounts.
- No anonymous/SSO accounts, phone confirmations, soft-deleted users, MFA factors,
  passkeys, SAML providers, OAuth clients or OAuth consents were found.
- Eight buckets with 61 recorded objects: 54 logos, four RFP photos, and three
  **private** project photos. Metadata records 47,617,486 bytes. Object contents,
  All 61 objects (47,617,486 bytes) have checksummed local backups and matching
  native R2 readbacks. Public downloads validated Source ETags, length and MIME;
  the three private files were downloaded through the authenticated dashboard
  and matched captured Source sizes/checksums.
- Preserve bucket MIME/size constraints, organization ownership, object paths and
  public/private separation. Existing Supabase URLs require a serving/remapping
  strategy; the old Supabase hostname cannot be redirected by this application.

## Auth replacement and rehearsal

Better Auth is the selected candidate for a separate isolated rehearsal. Its
[official D1 support](https://better-auth.com/blog/1-5) accepts a native D1 binding.
The [Supabase migration guide](https://better-auth.com/docs/guides/supabase-migration-guide)
describes bcrypt verification and warns that existing sessions are invalidated.
The [SQLite adapter](https://better-auth.com/docs/adapters/sqlite) also supports
Node's built-in SQLite for local tests. These are library capabilities, not proof
of this application's Cloudflare deployment or completed migration.

`scripts/d1-auth` pins Better Auth 1.7.15 and bcryptjs 3.0.3 in its own package.
Five tests exercise real local sign-in/session/logout with an imported synthetic
bcrypt hash and unchanged UUID; reject wrong passwords, unverified users and
active bans; permit expired bans; prevent editable metadata from granting admin;
and prove atomic import rollback. The importer deliberately accepts **only
@example.invalid fixtures**, not real accounts. No email sender, production configuration or live Auth deployment exists.
After explicit approval, the tested expiring private Auth view was installed and
a checksummed 69-account local export was saved with mode 0600 in ignored private
artifacts. No hashes were printed, committed or uploaded to Cloudflare.

Before real import, prepare and review the bounded credential-export path.
The reader now has approved access through `d1_migration.auth_export_v1` only,
with its unchanged November 5 expiry and a hard view cutoff. It still has no
direct `auth.users` password-column grant, table writes, refresh-token/session or
MFA-secret access. Preserve IDs,
verification/ban state and source metadata; do not infer app administration from
editable metadata. Port signup/profile creation, verification/reset emails,
sessions, sign-out, deletion, mobile login and all authorization helpers. Test
session revocation and account bans through every protected application boundary.
A local SQLite rehearsal does not prove native D1 reset/session atomicity.

## File replacement

Use Cloudflare R2 with separate private/public boundaries and a typed Worker
storage gateway that checks the current user and organization before each private
operation. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
are bearer access until expiry; choose short expiry or authenticated streaming
where immediate revocation is required. Do not enable public access to private
project photos. The copied files remain in a private bucket; application serving and
upload/download/delete flows still need to be built and verified. Preserve all
original files through the cutover/rollback window.

Read-only API preflight confirms access to four existing R2 buckets. Migration
bucket upload/readback passed a synthetic canary. The new migration bucket
`pmrfp-storage-migration-20261103` has its development URL disabled and no custom
domains. Application bindings and domain/CORS configuration remain to be built. No R2 permission expansion or paid plan
has been applied.

## Remaining release gates

1. Repeatable capture/replay operations and monitored scheduling with reviewed
   credentials beyond the current November 5 expiry.
2. Replacement typed reads/writes, RLS-equivalent ownership/role checks,
   privileged-field guards, triggers, RPCs, importers, cron jobs and billing hooks.
3. Auth and storage migration with isolated native and end-to-end tests.
4. Full source backup including Auth, verified storage backups, final write freeze
   and reconciliation, reverse-write/rollback plan, and approved cutover.
5. Verify no live code, cron, mobile, email link, storage URL or auth flow still
   depends on Supabase before reviewing project shutdown separately.

No reliable completion time is established for these remaining gates. The full
exit is not a same-day commitment.
