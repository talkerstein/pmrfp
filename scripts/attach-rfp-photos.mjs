/**
 * Download generated property photos from CloudFront, upload them to the
 * Supabase rfp-photos public bucket, and insert rfp_documents rows so they
 * appear on /rfps cards + RFP detail gallery.
 *
 * Usage: edit MAPPING below with {slug, sourceUrl} pairs, then run:
 *   node scripts/attach-rfp-photos.mjs
 *
 * Idempotent: skips RFPs that already have a public image attached.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { lookup as cacheLookup, record as cacheRecord } from "./lib/image-cache.mjs";

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

// EDIT THIS — fill in after image generation completes.
const MAPPING = [
  {
    slug: "condominium-electrical-maintenance-contract",
    sourceUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3AOg24a70rmZTeZNMTlapbCVbca/hf_20260531_141758_cf73c0b1-16ea-4e58-bf96-d7d0163459c4.png",
  },
  {
    slug: "exterior-wall-modification-commercial",
    sourceUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3AOg24a70rmZTeZNMTlapbCVbca/hf_20260531_142102_4f96d2ae-33dd-4bed-bc54-0de54d154918.png",
  },
  {
    slug: "emergency-exit-extension-rbq-compliance",
    sourceUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3AOg24a70rmZTeZNMTlapbCVbca/hf_20260531_142107_bd19dfb3-7fdb-4f09-9a4c-d99b1bab80af.png",
  },
  {
    slug: "flooring-paint-ceiling-renovation",
    sourceUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_3AOg24a70rmZTeZNMTlapbCVbca/hf_20260531_142112_b79da9df-64db-4a08-a79f-bd3958361423.png",
  },
];

const PMRFP_SYSTEM_ORG = "pmrfp-system";

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function findRfpId(slug) {
  const r = await rest(
    "GET",
    `/rest/v1/rfp_posts?slug=eq.${encodeURIComponent(slug)}&select=id`,
  );
  return r.json?.[0]?.id ?? null;
}

async function alreadyHasPublicImage(rfpId) {
  const r = await rest(
    "GET",
    `/rest/v1/rfp_documents?rfp_id=eq.${rfpId}&visibility=eq.public&file_type=like.image*&select=id&limit=1`,
  );
  return (r.json?.length ?? 0) > 0;
}

async function uploadToStorage(slug, sourceUrl) {
  // Pull bytes
  const dl = await fetch(sourceUrl);
  if (!dl.ok) throw new Error(`Download failed ${dl.status}: ${sourceUrl}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  const contentType = dl.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const id = randomUUID();
  const objectPath = `${PMRFP_SYSTEM_ORG}/${slug}/${id}.${ext}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/rfp-photos/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      // Immutable URL (uuid in path means content can't change under this URL),
      // so cache aggressively at every layer.
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false",
    },
    body: buf,
  });
  if (!up.ok) throw new Error(`Upload failed ${up.status}: ${await up.text()}`);
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/rfp-photos/${objectPath}`;
  return { publicUrl, objectPath, contentType };
}

async function insertDocument(rfpId, publicUrl, objectPath, contentType) {
  return rest("POST", "/rest/v1/rfp_documents", {
    rfp_id: rfpId,
    file_url: publicUrl,
    file_path: objectPath,
    file_name: objectPath.split("/").pop() ?? null,
    file_type: contentType,
    visibility: "public",
  });
}

async function main() {
  for (const { slug, sourceUrl, prompt, model } of MAPPING) {
    const rfpId = await findRfpId(slug);
    if (!rfpId) {
      console.warn(`[${slug}] RFP not found — skipping`);
      continue;
    }
    if (await alreadyHasPublicImage(rfpId)) {
      console.log(`[${slug}] already has a public photo — skipping`);
      continue;
    }

    // Cache short-circuit: if this prompt was already uploaded, reuse the
    // existing Supabase URL — don't burn another upload round-trip.
    let publicUrl;
    let objectPath;
    let contentType = "image/png";
    if (prompt) {
      const cached = cacheLookup(prompt);
      if (cached) {
        publicUrl = cached.supabase_url;
        objectPath = cached.supabase_path;
        console.log(`[${slug}] cache hit (prompt already in manifest) → reusing ${publicUrl}`);
      }
    }

    try {
      if (!publicUrl) {
        const uploaded = await uploadToStorage(slug, sourceUrl);
        publicUrl = uploaded.publicUrl;
        objectPath = uploaded.objectPath;
        contentType = uploaded.contentType;
        if (prompt) {
          cacheRecord(prompt, {
            supabase_url: publicUrl,
            supabase_path: objectPath,
            rfp_slug: slug,
            model: model ?? "unknown",
          });
        }
      }
      const ins = await insertDocument(rfpId, publicUrl, objectPath, contentType);
      if (ins.status >= 300) {
        console.error(`[${slug}] insert failed (${ins.status}):`, ins.json);
      } else {
        console.log(`[${slug}] ✓ attached → ${publicUrl}`);
      }
    } catch (e) {
      console.error(`[${slug}] FAILED:`, e.message);
    }
  }
}

await main();
