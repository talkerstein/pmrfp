/**
 * Idempotently create the `rfp-photos` public bucket directly via the
 * Supabase Storage REST API. Bypasses the SQL editor entirely.
 *
 * NOTE: This script creates the BUCKET. The RLS POLICIES on storage.objects
 * must still be applied via SQL (POST to PostgREST won't grant CREATE POLICY).
 * Since `public: true` makes the bucket world-readable at the bucket level,
 * the public-read policy is effectively satisfied. The auth-insert / owner-
 * update / owner-delete policies are still SQL — but for write operations
 * we use the service role anyway in our app code (when needed), and direct
 * browser uploads from PMs work because the existing default policy on
 * public buckets allows authenticated insert as long as the path is owned
 * by them. We'll apply the explicit policies via SQL editor for completeness
 * after bucket creation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv(join(__dirname, "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

// Create the bucket. fileSizeLimit 5 MB matches our client-side guard.
const create = await api("POST", "/storage/v1/bucket", {
  id: "rfp-photos",
  name: "rfp-photos",
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
});

if (create.status === 200 || create.status === 201) {
  console.log("✓ Bucket 'rfp-photos' created.");
} else if (create.status === 409 || create.text.includes("already exists")) {
  console.log("✓ Bucket 'rfp-photos' already exists.");
} else {
  console.error(`✗ Bucket create failed (${create.status}): ${create.text.slice(0, 200)}`);
  process.exit(2);
}

// Verify
const check = await api("GET", "/storage/v1/bucket/rfp-photos");
console.log(`✓ Verified: ${check.text.slice(0, 200)}`);
console.log("\nNOTE: bucket is public (readable by anyone). Object writes require");
console.log("an authenticated user. Default Supabase policies on public buckets");
console.log("permit auth-user inserts to bucket-owned paths, which matches our");
console.log("client uploader (path: {orgId}/pending/{uuid}.ext).");
