/**
 * Seed two REAL Concord, Ontario electrical businesses into pmrfp.com:
 *
 *   - Maple Electric Supply  (supplier)      mapleelectricsupply.ca
 *   - Hetz Electrical Inc.   (trade_company) hetzelectrical.com
 *
 * Every field below was read off each company's own public website on
 * 2026-07-29. Nothing here is inferred, rounded, or invented — if a site did
 * not state something (employee count, WSIB standing, insurer), the column is
 * left null rather than filled with a plausible-looking value.
 *
 * ── Why `verified: false` ─────────────────────────────────────────────────
 * Neither company has claimed its profile or submitted credentials to PMRFP.
 * Hetz publishes ECRA/ESA #7018294 and Maple publishes "15+ years"; those are
 * *self-reported* facts recorded in the description, not PMRFP verifications.
 * Badging either as "Verified" would assert a review that never happened.
 *
 * ── Why the Maple upsert restates every column ────────────────────────────
 * `maple-electric-supply` is already taken by an INVENTED fixture company in
 * supabase/seed.sql (is_demo=true, verified=true, city 'Toronto', "20 years",
 * "Fully insured", WSIB "Active"). It shares a name with this real business.
 * upsert(onConflict:'slug') only overwrites columns present in the payload, so
 * every fabricated value is restated explicitly below — otherwise the real
 * company inherits the fixture's fake credentials. Reusing the slug is
 * deliberate: /directory/maple-electric-supply is already indexed, so this
 * replaces the fabrication in place instead of leaving a 404 behind.
 *
 * Usage: node scripts/seed-electrical-orgs.mjs
 * Idempotent — safe to re-run.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const raw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  raw.split(/\r?\n/).map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const orgs = [
  {
    name: "Maple Electric Supply",
    slug: "maple-electric-supply",
    organization_type: "supplier",
    website: "https://mapleelectricsupply.ca",
    email: "sales@mapleelectricsupply.ca",
    phone: "905-553-7171",
    address_line_1: "8520 Jane St #5",
    city: "Concord",
    province: "Ontario",
    postal_code: "L4K 5A9",
    short_description:
      "Canadian-owned electrical distributor — lighting, controls, power distribution, wire, conduit, and safety equipment.",
    full_description:
      "Concord-based electrical supply distributor serving contractors, builders, and property-maintenance teams across Ontario. Stocks lighting, controls and automation, sensors, power distribution, conduit, wire, devices, HVAC tools, and safety equipment for commercial, industrial, and residential projects. Counter pick-up plus same-day or next-day delivery across much of Southern Ontario, and shipping Canada-wide. The company states it has served Ontario's electrical market for over 15 years.",
    years_in_business: 15,
    // Not published by the company — left null rather than guessed.
    employee_count_range: null,
    insurance_status: null,
    wsib_status: null,
    emergency_service: false,
    categories: ["electrical", "lighting", "building-automation"],
    regions: ["vaughan", "greater-toronto-area", "toronto", "canada"],
    propertyTypes: ["commercial-office", "industrial-building", "apartment-building", "retail-plaza"],
  },
  {
    name: "Hetz Electrical",
    slug: "hetz-electrical",
    organization_type: "trade_company",
    website: "https://hetzelectrical.com",
    email: "info@hetzelectrical.com",
    phone: "647-879-4389",
    address_line_1: "328 N Rivermede Rd, Unit 11",
    city: "Concord",
    province: "Ontario",
    postal_code: "L4K 3N2",
    short_description:
      "Licensed electrical contractor — commercial, industrial, and residential. EV chargers, panel and service upgrades, backup power.",
    full_description:
      "Concord-based electrical contractor working across commercial, industrial, and residential properties in the Greater Toronto Area. Services include panel and service upgrades (100A to 200A, 200A to 400A), lighting, EV charger installation, whole-building backup power, and 24/7 emergency call-out. The company publishes ECRA/ESA licence #7018294 and describes itself as a Tesla Certified Installer, an authorized Generac dealer, and licensed and insured, with three generations of master electricians.",
    // Site says "three generations" but states no founding year — not inferred.
    years_in_business: null,
    employee_count_range: null,
    // The company states it is insured; PMRFP has not seen a certificate, so
    // this stays null and the claim lives in the description as self-reported.
    insurance_status: null,
    wsib_status: null,
    emergency_service: true,
    categories: ["electrical", "ev-charging", "lighting"],
    regions: [
      "vaughan", "greater-toronto-area", "toronto", "north-york",
      "richmond-hill", "markham", "mississauga",
    ],
    propertyTypes: ["commercial-office", "industrial-building", "condominium", "apartment-building", "retail-plaza"],
  },
];

// ── Resolve taxonomy slugs → ids ────────────────────────────────────────
const [{ data: cats }, { data: regions }, { data: propTypes }] = await Promise.all([
  sb.from("trade_categories").select("id,slug"),
  sb.from("regions").select("id,slug"),
  sb.from("property_types").select("id,slug"),
]);
const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
const regionId = Object.fromEntries(regions.map((r) => [r.slug, r.id]));
const propId = Object.fromEntries(propTypes.map((p) => [p.slug, p.id]));

let okCount = 0, errCount = 0;

for (const { categories, regions: regionSlugs, propertyTypes, ...o } of orgs) {
  const payload = {
    ...o,
    country: "Canada",
    // Real businesses — must count toward public stats.
    is_demo: false,
    // Not reviewed by PMRFP. Do not flip this without an actual review.
    verified: false,
    // Not a paid placement.
    featured: false,
    profile_status: "approved",
    status: "active",
    // Both companies publish their phone + email on their own websites.
    public_contact_visibility: "show_contact",
    profile_completion_score: 70,
  };

  const { data: org, error } = await sb
    .from("organizations")
    .upsert(payload, { onConflict: "slug" })
    .select("id,name,slug,organization_type")
    .single();

  if (error) {
    console.error(`✗ ${o.slug}:`, error.message);
    errCount++;
    continue;
  }

  // Re-link taxonomy from scratch so a re-run can't leave a stale row behind
  // (the Maple fixture was tagged Toronto/GTA; the real company is in Concord).
  const links = [
    ["organization_categories", "category_id", categories, catId],
    ["organization_regions", "region_id", regionSlugs, regionId],
    ["organization_property_types", "property_type_id", propertyTypes, propId],
  ];

  let linkErr = false;
  for (const [table, fk, slugs, lookup] of links) {
    const rows = slugs
      .map((s) => {
        if (!lookup[s]) { console.error(`  ✗ ${table}: unknown slug '${s}'`); return null; }
        return { organization_id: org.id, [fk]: lookup[s] };
      })
      .filter(Boolean);
    if (rows.length !== slugs.length) linkErr = true;
    await sb.from(table).delete().eq("organization_id", org.id);
    const { error: e } = await sb.from(table).insert(rows);
    if (e) { console.error(`  ✗ ${table}:`, e.message); linkErr = true; }
  }

  if (linkErr) errCount++;
  else {
    console.log(
      `✓ ${org.organization_type.padEnd(14)} ${org.slug.padEnd(24)} ` +
      `${categories.length} cats · ${regionSlugs.length} regions · ${propertyTypes.length} property types`,
    );
    okCount++;
  }
}

console.log(`\nDone: ${okCount} ok, ${errCount} errors.`);
console.log("Both seeded with verified=false — neither company has claimed its profile.");
