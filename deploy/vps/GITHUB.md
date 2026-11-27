# PMRFP production deployments

The GitHub default branch drives the [Hostinger deployment workflow](../../.github/workflows/deploy-vps.yml).
Open a pull request against that branch and merge it after review. GitHub
Actions runs the tests, builds the Linux standalone app, and uploads the release
to the VPS. The same workflow can be rerun from the Actions tab.

On the VPS, a dedicated SSH key can only invoke the installed deployment
script. The script confirms that the requested revision is still the default
branch head, checks available disk space, and tests the new container before
switching the live one. It restores the previous release if the replacement
fails its health check.

Use Hostinger hPanel to reach the VPS or add an individual SSH public key.
The production Compose file lives at
`/opt/pmrfp/canonical/canonical-google-rehearsal.compose.yaml` and the release
directories are under `/opt/pmrfp/canonical/releases/`. The active container's
`/app` mount identifies the running release. The Compose filename is historical.

Production configuration stays on the VPS. The GitHub deployment only needs
the dedicated SSH deployment key, VPS host, and pinned SSH host key as
repository secrets. The workflow does not apply database migrations or change
Cloudflare Workers, R2, Stripe, DNS, or systemd timer configuration. Prepare
compatible D1 schema changes before deploying application code that depends on
them. The older Supabase migration workflow can only be dispatched manually.
