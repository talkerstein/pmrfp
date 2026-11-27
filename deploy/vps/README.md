# PMRFP VPS application deployment

Production URL: https://pmrfp.com

[GitHub production deployment and handoff](./GITHUB.md)

Cloudflare-backed rehearsal URL: https://pmrfp-vps.talkerstein.ca

The Node application runs on the existing Hostinger KVM2 server. Cloudflare D1 holds the production application and authentication databases. Cloudflare R2 holds customer objects. The VPS stores the application release and protected configuration. Cache directories are RAM-backed and container logs are capped at 2 MB.

`compose.yaml` uses a pinned Node image, non-root user, read-only filesystem, dropped capabilities, resource limits, an isolated Docker network and the existing Traefik TLS ingress. It does not publish an application port. Forwarded headers reserved for Vercel/Cloudflare are stripped at ingress.

## Server paths

- `/opt/pmrfp/current`: symlink to the deployed standalone application release.
- `/opt/pmrfp/runtime.env`: root-only Cloudflare gateway settings; never commit its contents.
- `/opt/pmrfp/smtp.env`: root-only Hostinger SMTP credentials; never commit its contents.
- `/opt/pmrfp/compose.yaml`: installed compose configuration.

Build locally using the pinned package lock and Node 24. For a rehearsal, set both `PMRFP_HOSTINGER_CLOUDFLARE_STAGING=enabled` and `PMRFP_ISOLATED_D1_STAGING=enabled` at build time. For a production candidate, build with `PMRFP_VPS_STANDALONE=enabled` and `NEXT_PUBLIC_GA_ID=G-FEC0QRSEFE`, and leave the rehearsal flags unset. The public GA4 ID is needed at build time for prerendered pages. Supply Linux x64 Sharp/libvips packages for the standalone release. Exclude `.env` files, migration snapshots, database backups and upload archives from the release. Create `.next/cache` before mounting its tmpfs.

Deploy to a new release directory, atomically replace the `current` symlink, then run:

```sh
docker compose -f /opt/pmrfp/compose.yaml up -d --force-recreate --wait --wait-timeout 90
```

A code rollback requires pointing `current` to a previous release and recreating the container. Current VPS releases obtain the validated D1 checkpoint through the gateway. When rolling back to a release that predates checkpoint discovery, set the runtime dataset pin to the currently validated D1 manifest in the same deployment. Database reversal is a separate reviewed migration using its verified backup.

## Canonical hostname

The canonical Nginx ingress serves `pmrfp.com` through the standalone release defined in `canonical-native-auth.compose.yaml`. The live container's `/app` mount identifies the active release. Sign-in, customer writes and public data use D1. Uploads and private files use R2. The ingress forwards `/api/stripe/webhook` to the private billing relay. Versioned static assets from older releases are served from read-only snapshots.

The separate `www-redirect.compose.yaml` service answers `www.pmrfp.com` with an HTTP 308 to `https://pmrfp.com`, preserving the path and query string. Both VPS TLS services use the DNS-validated certificate in `/opt/pmrfp/www-redirect/tls`, which expires on 23 February 2027. Renew it for both hostnames before expiry.

Hostinger DNS points the apex ALIAS to `pmrfp-vps.talkerstein.ca.` and `www` CNAME to `pmrfp.com.`. Both website records have a 300-second TTL. The Vercel project was retired. Roll back application code to a verified VPS release that uses the production D1 databases.

For a rollback of the R2 release only, restore `/opt/pmrfp/canonical/nginx.conf.pre-public-r2` to the mounted `nginx.conf` in place, then validate and reload Nginx. The preceding healthy VPS application still reads the board and taxonomy from D1. The older `nginx.conf.pre-public-d1` points to the original VPS application if the public data adapters also require rollback.

## Retired rehearsal and refresh

The original rehearsal used a 15-minute source refresh from the migration operator’s Mac. The refresh schedule is disabled and the old Vercel project was deleted. The previous recovery procedures below are retained as migration history.

See `docs/d1/VERIFICATION-2026-11-18.md` for this deployment's evidence and limitations.

## Application refresh job

The service `pmrfp-vps-d1-transport` connects the VPS to the two private migration candidates. It accepts calls only from the VPS egress IP and verifies the secret stored in the root-only `/opt/pmrfp/canonical/secrets/d1-transport.env`. Its deployed `readiness` mode allows only the two health probes. A separate isolated D1 write rehearsal passed atomic readback and rollback. The serving mode also checks the destination's authority marker within each batch.

Production sign-in uses `PMRFP_VPS_LIVE_AUTH=enabled`, `PMRFP_VPS_CUSTOMER_ENGINE=d1`, and `PMRFP_CUSTOMER_AUTH_ORIGIN=https://pmrfp.com`. The private in-process gateway and session secrets are stored alongside the transport file. The root-only `production-auth-turnstile.env` and `production-auth-limiter.env` files in the same directory supply the production verification credentials. The production limiter is deployed through the `production` environment in `workers/staging-rate-limit/wrangler.jsonc` and accepts only the VPS application's IPv4 egress.

Company images use the private R2 connection and `deploy/vps/company-media.sql`. Run `read-company-portfolio-inventory.mjs` with the existing source application environment to check historical portfolio coverage. Its `--emit-sql` mode prints the verified D1 links and refuses an import into a database that has taken production authority. Repeat the inventory and import at the final write checkpoint to include late uploads and removals.

The Mac launch agent is `ca.talkerstein.pmrfp-d1-refresh`. Its owner-only state directory holds the active source snapshot, matching D1 snapshot and backup, and exact prepared run for recovery. The tracked entry point is `scripts/d1/sync_vps_copy.py`. Reuse this state if a remote request fails after writing. The next invocation resumes the exact prepared run and verifies both checkpoints before advancing.

The refresh job uses `--atomic-publish`. It verifies the old copy, then checks the changed rows and affected table counts inside the same D1 transaction as publication. A full readback and backup restoration still follow before Supabase receipts are acknowledged. Full readback can withdraw a checkpoint if it detects a mismatch. The VPS keeps one complete RFP board in memory per process and replaces it when it observes a new validated checkpoint. The 15-minute interval is a polling schedule, not a replication latency guarantee. The source readers currently expire on 3 December 2026 at 15:30 IST. The job requires the Mac session to be running and able to reach both providers.


## Application cron

Generate the VPS systemd unit files from the same schedules used in Vercel:

```sh
node deploy/vps/render-cron-units.mjs /tmp/pmrfp-cron-units
```

The timer expressions use UTC. Each service reads `CRON_SECRET` from the application container and calls its route over loopback. The staging app still returns 404 on cron routes. Production ingress rejects a missing secret with 503 and an incorrect bearer with 401.

The production release reads this credential from `/opt/pmrfp/canonical/secrets/production-cron.env`. The 37 VPS timers are installed in systemd. The reference copy of the validated unit definitions is in `/opt/pmrfp/canonical/scheduled-jobs-ready`.

The nine public-tender import routes share the D1 importer when the VPS customer engine is D1. Each run uses the existing feed and permission rules. Listing inserts and category links commit together. Amendments and archives record their history in the same database batch. The Canadian importer uses the existing migrated PMRFP Board forum profile. The D1 bid-check route can report its backlog in dry-run mode before the Gemini credential is installed.

Before activating a timer, verify that its route can complete using the production backends and that the matching Vercel schedule has stopped. Start the timers only on the VPS production release. A restart skips missed occurrences instead of replaying them.

## Production Stripe billing

Stripe sends eight billing event types to `https://pmrfp.com/api/stripe/webhook`. The apex proxy forwards the raw request to the private VPS relay. The relay verifies the signature, checks the event against the live Stripe account, and forwards it to the D1 billing writer. The writer verifies the signature again and records billing receipts and supported entitlements in D1. Both services read the canonical destination's signing secret from `/opt/pmrfp/stripe-production-relay/verify.env`.

The relay requires `PMRFP_STRIPE_RECEIVER=d1` in its root-only `receiver.env`. During a handover, `hold` returns a retryable response for authenticated events. The relay accepts only these two modes.

Apply `stripe-subscription-state.sql` and `stripe-marketplace-state.sql` to the intended D1 billing database before enabling the native handler. Reconcile imported receipts and entitlements before setting billing authority. Run `stripe-d1-writer.compose.yaml` with the validated release. The writer reports HTTP 503 until D1 billing authority is available. Its gateway credential lives in `/opt/pmrfp/canonical/secrets/production-stripe-d1.env`. A rollback must reconcile accepted D1 payments before restoring any other writer.

For a live check without a charge, open Checkout for the authorized operator account, expire it unpaid, and confirm both Stripe's HTTP 200 delivery and the D1 receipt for that event. Verify existing paid events as duplicates. A no-charge receipt check does not verify that a fresh paid Checkout grants an entitlement.

## Account cutover candidate

The VPS signup and reset forms can use the native D1 account gateway. Requests use the existing shared rate limiter and Turnstile. Hostinger SMTP delivers the links. The token is passed to the browser in a fragment and stored in D1 as a hash. Reset consumes the token, replaces the password, and revokes existing sessions in one D1 transaction.

Prepare `customer-auth-authority.sql` and `customer-app-authority.sql` on separate cutover candidates. The current mirror validates its original schema on each sync, so installing the new schema there would interrupt sync. Native auth requires its authority marker and the absence of the old mirror marker. App-profile writes require the separate application marker. Pause source account writes, verify the final account and app sync, and retire the source writers before activating markers on the serving databases. Retain and reconcile all accepted native account writes if a rollback is needed.

Apply `customer-board-revision.sql` to the same private application candidate before deploying the native release. The public tender board in that release reads the authoritative application database. The revision prevents a cached snapshot from overlooking listing updates or combining pages from different revisions.

The candidate uses `PMRFP_VPS_NATIVE_ACCOUNT_RECOVERY=enabled` and, separately, `PMRFP_VPS_NATIVE_ACCOUNT_SIGNUP=enabled`. Use them only with the native gateway and a verified Hostinger sender. Company onboarding writes the company, membership, taxonomy links, consent, and profile completion in one transaction. Before activating signup for customers, verify the full onboarding flow, including join requests, Google/passwordless accounts, public buyer claims, and production mail delivery.

The Google OAuth credentials are in the root-only `production-google-oauth.env` in that same secrets directory. The client uses `https://pmrfp.com/api/auth/callback/google`. The rehearsal restricted the three temporary callbacks to the existing Dev profile and was removed after the authenticated D1 response. Clear `PMRFP_GOOGLE_OAUTH_REHEARSAL_EMAIL` in the serving release so the rehearsal status route is disabled.
