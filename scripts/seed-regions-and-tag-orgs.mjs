/**
 * Region taxonomy expansion + service-area tagging for the 9 founding orgs.
 *
 * Adds Quebec province + Laval + Saint-Jérôme + USA, re-parents Montreal
 * under Quebec, then links each of the 9 founding-cohort orgs to the regions
 * they actually serve (per their public website copy).
 *
 * Usage: node scripts/seed-regions-and-tag-orgs.mjs
 * Idempotent.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  raw.split(/\r?\n/).map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ─────────────────────────────────────────────────────────────
// 1. Look up existing region IDs
// ─────────────────────────────────────────────────────────────
const { data: existingRegions } = await sb.from("regions").select("id,slug,parent_id,name");
const bySlug = Object.fromEntries(existingRegions.map((r) => [r.slug, r]));
const canadaId = bySlug["canada"].id;

// ─────────────────────────────────────────────────────────────
// 2. Add Quebec province + Quebec cities + USA
// ─────────────────────────────────────────────────────────────
const newRegions = [
  { slug: "quebec", name: "Quebec", parent_id: canadaId, province: "Quebec" },
  // Laval + Saint-Jérôme are added under Quebec
  { slug: "laval", name: "Laval", parent_id: null /* fixed below */, province: "Quebec" },
  { slug: "saint-jerome", name: "Saint-Jérôme", parent_id: null, province: "Quebec" },
  // United States as a parallel root (not under Canada)
  { slug: "united-states", name: "United States", parent_id: null, province: null, country: "USA" },
];

// First insert Quebec so we have its id
for (const r of newRegions) {
  if (r.slug !== "quebec") continue;
  const { data, error } = await sb
    .from("regions")
    .upsert({ slug: r.slug, name: r.name, parent_id: r.parent_id, province: r.province }, { onConflict: "slug" })
    .select("id,slug").single();
  if (error) throw error;
  bySlug[r.slug] = data;
  console.log(`✓ region: ${r.slug} → ${data.id}`);
}
const quebecId = bySlug["quebec"].id;

// Now insert Laval + Saint-Jérôme under Quebec
for (const r of newRegions) {
  if (r.slug === "quebec") continue;
  const parent = r.slug === "united-states" ? null : quebecId;
  const payload = { slug: r.slug, name: r.name, parent_id: parent, province: r.province };
  if (r.country) payload.country = r.country;
  const { data, error } = await sb
    .from("regions")
    .upsert(payload, { onConflict: "slug" })
    .select("id,slug").single();
  if (error) throw error;
  bySlug[r.slug] = data;
  console.log(`✓ region: ${r.slug} → ${data.id}`);
}

// Re-parent Montreal under Quebec (was under Canada root)
const montreal = bySlug["montreal"];
if (montreal && montreal.parent_id !== quebecId) {
  await sb.from("regions").update({ parent_id: quebecId, province: "Quebec" }).eq("id", montreal.id);
  console.log(`✓ region: montreal re-parented under quebec`);
}

// ─────────────────────────────────────────────────────────────
// 3. Tag the 9 founding orgs with their service regions
//    Based on their public website service-area copy.
// ─────────────────────────────────────────────────────────────
const orgRegionMap = {
  // ── Suppliers ──
  "archimat": ["montreal", "laval", "quebec"],
  "liquidation-1740": ["montreal", "laval", "saint-jerome", "quebec"],
  "kidicare": ["canada"], // Canada-wide shipping
  "inspera": ["canada"], // national coverage
  "cleverpays": ["canada", "united-states"], // Canada + USA
  "talkerstein-consulting": ["canada", "united-states"], // Toronto-based, serves worldwide → captured as Canada+USA
  // ── Trades ──
  "baths-only": ["greater-toronto-area", "toronto", "markham", "vaughan"],
  "bsd-renovations": [
    "greater-toronto-area", "toronto", "vaughan", "markham",
    "richmond-hill", "north-york", "oakville",
  ],
  "crystal-ball-windows": ["greater-toronto-area", "toronto"],
};

// Resolve org slugs → ids
const slugs = Object.keys(orgRegionMap);
const { data: orgs } = await sb.from("organizations").select("id,slug").in("slug", slugs);
const orgIdBySlug = Object.fromEntries(orgs.map((o) => [o.slug, o.id]));

for (const [orgSlug, regionSlugs] of Object.entries(orgRegionMap)) {
  const orgId = orgIdBySlug[orgSlug];
  if (!orgId) { console.error(`✗ org not found: ${orgSlug}`); continue; }

  const rows = regionSlugs
    .map((rs) => {
      const r = bySlug[rs];
      if (!r) { console.error(`  ✗ region not found: ${rs}`); return null; }
      return { organization_id: orgId, region_id: r.id };
    })
    .filter(Boolean);

  // Clear existing then insert fresh
  await sb.from("organization_regions").delete().eq("organization_id", orgId);
  const { error } = await sb.from("organization_regions").insert(rows);
  if (error) { console.error(`✗ tag ${orgSlug}:`, error.message); continue; }

  const display = regionSlugs.length > 4
    ? `${regionSlugs.slice(0, 3).join(", ")}, +${regionSlugs.length - 3} more`
    : regionSlugs.join(", ");
  console.log(`✓ ${orgSlug.padEnd(28)} → ${display}`);
}

console.log("\nDone. Region tree expanded + 9 orgs tagged.");
