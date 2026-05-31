/**
 * Image-cache helper. Keyed by SHA-256 of the brand-prompt; value points at a
 * persistent Supabase Storage URL. See briefs/image-workflow.md for the full
 * workflow design.
 *
 * Cache is committed to git (manifest.json) so re-runs on any machine know
 * about existing images. Binary bytes live in Supabase Storage only.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MANIFEST_PATH = "briefs/image-cache/manifest.json";

export function hashPrompt(prompt) {
  return createHash("sha256").update(prompt).digest("hex");
}

export function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      description:
        "Image cache. Key = SHA-256 of the brand-prompt. Value = persistent Supabase Storage URL + metadata. See briefs/image-workflow.md.",
      generated_with: { default: "chatgpt_image_2_browser", fallback_with_approval: "gpt_image_2_api" },
      entries: {},
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

export function saveManifest(manifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/**
 * Look up a prompt in the cache. Returns the cached entry (with supabase_url)
 * or null if not cached.
 */
export function lookup(prompt) {
  const manifest = loadManifest();
  const hash = hashPrompt(prompt);
  return manifest.entries[hash] ?? null;
}

/**
 * Record a new image in the cache.
 */
export function record(prompt, entry) {
  const manifest = loadManifest();
  const hash = hashPrompt(prompt);
  manifest.entries[hash] = {
    ...entry,
    prompt,
    generated_at: entry.generated_at ?? new Date().toISOString(),
  };
  saveManifest(manifest);
  return hash;
}

/**
 * Summary stats for telemetry.
 */
export function stats() {
  const manifest = loadManifest();
  const entries = Object.values(manifest.entries);
  const byModel = {};
  for (const e of entries) {
    byModel[e.model] = (byModel[e.model] ?? 0) + 1;
  }
  return { total: entries.length, byModel };
}
