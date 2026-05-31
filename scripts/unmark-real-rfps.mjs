/**
 * One-shot: flip is_demo=false on the 7 real ported WordPress RFPs so they
 * stop showing the "SAMPLE" badge. The 5 actual demo seeds keep their badge.
 *
 * Identification by slug (memory: 7 real opportunities from the legacy
 * pmrfp.com WordPress site — exterior/compliance, HVAC, electrical,
 * renovations, mold in Toronto + Québec).
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

const REAL_SLUGS = [
  "exterior-wall-modification-commercial",
  "emergency-exit-extension-rbq-compliance",
  "flooring-paint-ceiling-renovation",
  "hvac-system-replacement-montreal",
  "kitchen-bathroom-renovations",
  "mold-remediation-specialist",
  "electrical-service-contractor-gta",
];

const url = `${SUPABASE_URL}/rest/v1/rfp_posts?slug=in.(${REAL_SLUGS.join(",")})`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({ is_demo: false }),
});

const updated = await res.json();
if (!res.ok) {
  console.error("FAILED:", updated);
  process.exit(1);
}
console.log(`✓ Updated ${updated.length} real RFPs to is_demo=false:`);
for (const r of updated) console.log(`  - ${r.slug}`);
