# Public image serving rehearsal

This rehearsal uses a dedicated private R2 bucket, `pmrfp-public-assets-preview-20261109`. It does not bind the migration archive or any private project photos. The R2 development URL is disabled and no custom domain is attached.

`prepare_public_assets.py` selects the approved public logo and listing image namespaces from the verified local backup. For every selected file it rechecks the local SHA-256 and confirms that the original Source URL still responds publicly with the matching revision, type and size via unauthenticated HEAD. It does not download Source image bodies. Any mismatch stops preparation.

The private deployment entry imports `assetReader` from `workers/storage-preview/worker.mjs` and passes the prepared manifest without local file paths. Copy only those checked files to immutable `verified-public/<opaque-id>/<sha256>` keys in the dedicated bucket. The Worker only reads keys from its allowlist, confirms their size, type and R2 ETag, and streams the bytes. Write methods, ranges, private selectors and arbitrary keys are refused. The direct native rehearsal checked all 61 images against their full backup SHA-256, including a 9.6 MB file. [Cloudflare documents that R2 reads provide a stream](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

The separate app route is Preview-only. It can ask the Worker to issue a 90-second link for a known image; the private signing key stays on the Worker, and the redirect contains no application session token or gateway key. The signature is bound to the image and its verified revision. The browser downloads from the Worker directly. The app's existing image selections and production settings are unchanged.

Do not deploy an allowlist derived from a private or mixed bucket. Keep the generated manifest, deployment entry and secrets out of Git. Before production, refresh the public inventory, decide the stable URL and cache behavior, integrate existing image fields and test the private-file access paths separately.
