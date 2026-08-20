/**
 * Sync Google ratings onto vendor profiles — the "smart programmatic reviews"
 * lane, done the compliant way.
 *
 * HOW: each org stores a google_place_id. We call the official Places API
 * (New) for rating + userRatingCount and cache them on the org row. The site
 * displays "★ 4.8 · 127 Google reviews" with attribution and a link out.
 *
 * WHAT WE DELIBERATELY DON'T DO:
 *  - No scraping. Scraped Google reviews violate ToS and get API-less sites
 *    burned; the official API is cheap at our volume (pennies per run).
 *  - No review TEXT storage. Places ToS limits caching of content; rating +
 *    count are the stable fields, refreshed on each run (≤30-day cache rule).
 *  - No schema.org aggregateRating from this data. Google's rich-result rules
 *    require FIRST-PARTY reviews; marking up imported ratings is a spam-action
 *    risk. First-party reviews live in vendor_reviews and earn markup later.
 *
 * MODES
 *   node scripts/sync-google-ratings.mjs              # refresh orgs that have a place_id
 *   node scripts/sync-google-ratings.mjs --discover   # suggest place_ids for orgs missing one (prints, never writes)
 *   node scripts/sync-google-ratings.mjs --dry-run    # show what would be written
 *
 * ENV (.env.local): GOOGLE_MAPS_API_KEY (Places API New enabled)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  raw.split(/\r?\n/).map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
const KEY = env.GOOGLE_MAPS_API_KEY;
const DRY = process.argv.includes("--dry-run");
const DISCOVER = process.argv.includes("--discover");

if (!KEY) {
  console.error("GOOGLE_MAPS_API_KEY missing from .env.local — create one with Places API (New) enabled.");
  process.exit(1);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function placeDetails(placeId) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "rating,userRatingCount,displayName",
    },
  });
  if (!r.ok) return { error: `${r.status} ${await r.text().then((t) => t.slice(0, 120))}` };
  return await r.json();
}

async function searchPlace(text) {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: text, maxResultCount: 3 }),
  });
  if (!r.ok) return [];
  return (await r.json()).places ?? [];
}

if (DISCOVER) {
  // Suggest-only: a wrong place_id would show another company's rating on a
  // vendor's profile, so a human confirms every match before it's stored.
  const { data: orgs } = await sb
    .from("organizations")
    .select("id,name,city,province")
    .in("organization_type", ["trade_company", "supplier"])
    .eq("is_demo", false)
    .is("google_place_id", null);
  console.log(`Orgs missing a place_id: ${orgs?.length ?? 0}\n`);
  for (const o of orgs ?? []) {
    const hits = await searchPlace(`${o.name} ${o.city ?? ""} ${o.province ?? ""}`.trim());
    console.log(`■ ${o.name} (${o.city ?? "?"})   org=${o.id}`);
    if (!hits.length) console.log("    no candidates");
    for (const h of hits) {
      console.log(`    ${h.id}  ★${h.rating ?? "—"} (${h.userRatingCount ?? 0})  ${h.displayName?.text ?? ""} — ${h.formattedAddress ?? ""}`);
    }
    console.log(`    accept: update organizations set google_place_id='<ID>' where id='${o.id}';\n`);
  }
  process.exit(0);
}

const { data: orgs } = await sb
  .from("organizations")
  .select("id,name,google_place_id")
  .not("google_place_id", "is", null);

console.log(`Orgs with a place_id: ${orgs?.length ?? 0}`);
let updated = 0;
for (const o of orgs ?? []) {
  const d = await placeDetails(o.google_place_id);
  if (d.error) { console.log(`  ✗ ${o.name}: ${d.error}`); continue; }
  const rating = d.rating ?? null;
  const count = d.userRatingCount ?? null;
  console.log(`  ${DRY ? "[dry] " : ""}${o.name}: ★${rating ?? "—"} (${count ?? 0})`);
  if (DRY) continue;
  const { error } = await sb
    .from("organizations")
    .update({
      google_rating: rating,
      google_review_count: count,
      google_ratings_synced_at: new Date().toISOString(),
    })
    .eq("id", o.id);
  if (error) console.log(`    write failed: ${error.message}`);
  else updated++;
}
console.log(`\nUpdated ${updated}. Re-run on a weekly cron to stay inside the 30-day cache window.`);
