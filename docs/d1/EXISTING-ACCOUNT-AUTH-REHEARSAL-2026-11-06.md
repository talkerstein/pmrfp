# Existing migration test-account login rehearsal — completed and removed

## Prepared result

The existing test account is `d1-preview-20261022@example.invalid`, created for this migration. Its saved private credential matches its current approved Auth export. The prepared importer copies only that account's original UUID, email, verified/ban state and bcrypt credential into a separate database. It excludes every customer account, metadata, Source sessions and refresh tokens. It creates zero sessions during import.

Destination: `pmrfp-existing-test-auth-20261106` (`9f4d876a-e30e-4c7b-b2f1-5060d3cf3297`). It has been created empty; no account import or Worker deployment is applied. The 76-account `pmrfp-auth-shadow-20261106` copy stays sealed and unbound.

Proposed gateway-protected Worker: `pmrfp-existing-test-auth-preview`, configured in `workers/auth-preview/wrangler.existing-account-proposal.jsonc`. It permits only sign-in for this exact email, current-session lookup and sign-out. Signup, reset, mail, admin endpoints, query overrides and other identities are denied. It requires exactly one eligible test user and the expected manifest on every request. It has no Source connection, app D1 binding, R2 binding or live application configuration.

The manifest expires 15 minutes after the plan is generated; every request fails closed after expiry, independently of cookies. Sessions last at most 15 minutes and use a fresh rehearsal-only signing secret with cookie caching disabled. The application does not recognize this provider. No paid trial, customer access, subscription, email delivery or production login switch is involved.

## Approval boundary

The previous real Auth import approval explicitly kept its destination sealed, with zero sessions and no Worker binding. This proposal separately asks to serve the existing test account's copied credential in an isolated, expiring login rehearsal. No customer credential will be served. The copy and deployment require approval before application; preparing code, tests and the empty destination does not activate login.

## Application and validation after approval

1. Revalidate the protected export checksum, age/expiry, saved test credential and exact one-account selection. Regenerate the private atomic plan immediately before applying; do not reuse an expired review plan.
2. Apply the bounded batch to the empty destination only. Verify one user/credential, zero sessions/tokens and no customer records.
3. Configure new private gateway and Auth signing secrets and deploy the proposal Worker.
4. Use the existing private test credential to prove imported-hash sign-in with the original UUID, wrong-password denial, session lookup and logout revocation. Verify customer-email, reset/signup/admin and gateway denials. Do not print credentials, cookies or hashes.
5. Remove the test Worker and test database after recording aggregate proof; retain the sealed 76-account copy unchanged. Remove associated temporary local deployment secrets.

Local validation covers one-account-only atomic plans, unsupported verification/ban/role states, gateway-before-read enforcement, singleton/identity/ban guards, customer/input/endpoint denials and expiry. The prepared Worker is bundled with `wrangler deploy --dry-run`; this does not deploy or bind the account.

This is a snapshot-based credential compatibility test. It does not prove current customer ban synchronization, profile authorization, real email flows or production readiness.


## Applied result

The user explicitly authorized this isolated test-account rehearsal on November 6. The one-account atomic import and Worker deployment completed, with zero customer accounts, emails or Source writes. Native proof passed original credential/UUID preservation, wrong-password denial, customer-email denial, current ban enforcement, session lookup, 15-minute maximum session lifetime, logout revocation, manifest expiry and unavailable signup/reset/admin paths.

After proof, the temporary Worker and database were deleted and their absence verified through the Cloudflare API. Temporary local deployment secrets and import plans were removed. The sealed 76-account copy was independently checked: 76 users, zero sessions and state `sealed`. Proof: `.d1-private/existing-account-native-report-20261106.json`. The configuration below is historical and references the removed rehearsal database; it is not an active login service.
