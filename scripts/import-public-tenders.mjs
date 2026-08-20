/**
 * Import open public tender notices from CanadaBuys into the RFP board.
 *
 * Source: CanadaBuys "Open tender notices" CSV (all tenders currently open for
 * bidding), published by PWGSC under the Open Government Licence – Canada.
 * https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2
 *
 * WHY THIS IS NARROW ON PURPOSE
 * -----------------------------
 * The raw feed is ~875 open notices and most of it is wrong for us: defence
 * source lists ("Open Construction Source List for CFB Halifax"), goods
 * purchases, and national-scope service contracts. Dumping that on the board
 * would make PMRFP a worse MERX and directly contradict our own positioning —
 * /vs/merx says MERX is for government tenders and we're for commercial
 * property. So we take only building-trade work in the metros we actually
 * serve, and we label it honestly as a public tender.
 *
 * Nothing publishes itself. Rows land as status='pending_review' for admin
 * approval at /admin/rfps. Dry-run is the default.
 *
 *   node scripts/import-public-tenders.mjs            # dry run, prints matches
 *   node scripts/import-public-tenders.mjs --apply    # insert as pending_review
 *   node scripts/import-public-tenders.mjs --limit=25
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FEED =
  "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";
const ATTRIBUTION =
  "Public tender notice from CanadaBuys, reproduced under the Open Government Licence – Canada.";

const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 40);

/** Trade keywords → the PMRFP category slug the work belongs to. */
const TRADE_MAP = [
  [["roof", "roofing", "shingle"], "roofing"],
  [["hvac", "heating", "ventilation", "air conditioning", "boiler", "chiller", "ductwork"], "hvac"],
  [["electrical", "lighting", "generator"], "electrical"],
  [["plumb", "backflow", "washroom"], "plumbing"],
  [["fire alarm", "sprinkler", "fire protection", "fire hydrant"], "fire-safety"],
  [["elevator", "escalator", "lift"], "elevator-services"],
  [["paint", "painting"], "painting"],
  [["floor", "flooring", "carpet"], "flooring"],
  [["window", "glazing", "curtain wall"], "glass-and-windows"],
  [["masonry", "brick", "stone"], "masonry"],
  [["concrete", "asphalt", "paving", "parking lot"], "concrete-and-asphalt"],
  [["asbestos", "hazardous", "abatement"], "environmental-hazardous-materials"],
  [["mould", "mold"], "mold-remediation"],
  [["waterproof", "membrane"], "waterproofing"],
  [["janitorial", "custodial", "cleaning"], "cleaning-janitorial"],
  [["landscap", "grounds maintenance"], "landscaping"],
  [["snow removal", "ice control"], "snow-removal"],
  [["pest control"], "pest-control"],
  [["access control", "surveillance", "security system"], "security-systems"],
  [["demolition"], "demolition"],
  [["renovation", "retrofit", "refurbish", "reconstruction", "building envelope"], "general-contracting"],
];

/**
 * Notices we never want, whatever else they match. The feed is federal, so it
 * is full of ships, aircraft and medical equipment that trip trade keywords —
 * a "VENTILATOR, AIR CIRCULATING" is a medical device, not HVAC work.
 */
const NOISE = [
  "source list", "ship", "vessel", "naval", "aircraft", "runway", "vehicle",
  "ammunition", "weapon", "uniform", "medical", "clinical", "laboratory",
  "translation", "software", "licence", "license", "training course",
  "recruit", "equipment rental", "lawn sign", "forest inventory",
];

/** Only metros we actually have trade density in. Everything else is noise. */
const REGION_MAP = [
  [["toronto", "greater toronto", "gta", "north york", "scarborough", "etobicoke"], "toronto"],
  [["mississauga"], "mississauga"], [["brampton"], "brampton"],
  [["markham"], "markham"], [["vaughan"], "vaughan"],
  [["hamilton"], "hamilton"], [["ottawa", "national capital"], "ottawa"],
  [["montreal", "montréal"], "montreal"], [["laval"], "laval"],
  [["vancouver"], "vancouver"], [["calgary"], "calgary"],
  [["edmonton"], "edmonton"], [["winnipeg"], "winnipeg"],
  [["london"], "london"], [["kitchener", "waterloo"], "kitchener-waterloo"],
];

/** Minimal RFC-4180 CSV parser — the feed has quoted commas and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.replace(/^﻿/, ""));
  return rows
    .filter((r) => r.length >= header.length - 2)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

function classify(notice) {
  const blob = [
    notice["title-titre-eng"],
    notice["tenderDescription-descriptionAppelOffres-eng"],
    notice["unspscDescription-eng"],
  ].join(" ").toLowerCase();

  if (NOISE.some((n) => blob.includes(n))) return null;

  const category = TRADE_MAP.find(([kws]) => kws.some((k) => blob.includes(k)))?.[1];
  if (!category) return null;

  // Region must come from where the work is DELIVERED, never the contracting
  // entity's address. Federal buyers are headquartered in Ottawa, so using the
  // entity address tagged a Yukon roof replacement as Calgary and collapsed
  // half the feed into Ottawa. A wrong region is worse than no listing.
  const place = (notice["regionsOfDelivery-regionsLivraison-eng"] || "").toLowerCase();
  const region = REGION_MAP.find(([kws]) => kws.some((k) => place.includes(k)))?.[1];
  if (!region) return null;

  // The "open" feed still carries notices whose closing date has passed.
  const closing = (notice["tenderClosingDate-appelOffresDateCloture"] || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closing)) return null;
  if (closing < new Date().toISOString().slice(0, 10)) return null;

  return { category, region };
}

function toRfp(notice, { category, region }) {
  const title = (notice["title-titre-eng"] || "").trim();
  const ref = (notice["referenceNumber-numeroReference"] || "").trim();
  const closing = (notice["tenderClosingDate-appelOffresDateCloture"] || "").slice(0, 10);
  const buyer = (notice["contractingEntityName-nomEntitContractante-eng"] || "").trim();
  const body = (notice["tenderDescription-descriptionAppelOffres-eng"] || "").trim();

  return {
    title,
    slug: `${slugify(title)}-${slugify(ref).slice(-8)}`,
    summary: body.slice(0, 400) || `Public tender issued by ${buyer}.`,
    scope: body,
    city: (notice["contractingEntityAddressCity-entiteContractanteAdresseVille-eng"] || "").trim() || null,
    province: (notice["contractingEntityAddressProvince-entiteContractanteAdresseProvince-eng"] || "").trim() || null,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(closing) ? closing : null,
    // Public tenders are answered on the issuing portal — we point there rather
    // than pretending PMRFP mediates contact with a federal buyer.
    contact_visibility: "public_contact",
    source_type: "public_source",
    source_url: (notice["noticeURL-URLavis-eng"] || "").trim() || null,
    source_notes: `${ATTRIBUTION} Issued by ${buyer}. Reference ${ref}.`,
    status: "pending_review",
    is_demo: false,
    _category: category,
    _region: region,
  };
}

// The CDN in front of the feed 403s an unidentified client, and naming
// ourselves is the courteous thing to do on someone else's open data anyway.
const res = await fetch(FEED, {
  headers: { "User-Agent": "PMRFP/1.0 (+https://pmrfp.com; open-data import)" },
});
if (!res.ok) throw new Error(`CanadaBuys feed returned ${res.status}`);
const notices = parseCsv(await res.text());

const matched = [];
for (const n of notices) {
  const hit = classify(n);
  if (hit) matched.push(toRfp(n, hit));
}
// Soonest deadline first — a tender closing in three days is the one a trade
// actually wants to see.
matched.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
const picked = matched.slice(0, LIMIT);

console.log(`Feed notices:      ${notices.length}`);
console.log(`Building-trade in our metros: ${matched.length}`);
console.log(`Taking:            ${picked.length}\n`);
for (const r of picked) {
  console.log(`  [${r._region}/${r._category}] ${r.title.slice(0, 68)}`);
  console.log(`      closes ${r.deadline ?? "—"}  ${r.source_url ?? "(no source url)"}`);
}

if (!APPLY) {
  console.log(`\nDry run. Re-run with --apply to insert as pending_review.`);
  process.exit(0);
}

const raw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  raw.split(/\r?\n/).map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: regions } = await sb.from("regions").select("id,slug");
const { data: cats } = await sb.from("trade_categories").select("id,slug");
const regionId = Object.fromEntries((regions ?? []).map((r) => [r.slug, r.id]));
const catId = Object.fromEntries((cats ?? []).map((c) => [c.slug, c.id]));

let inserted = 0, skipped = 0;
for (const r of picked) {
  const { _category, _region, ...row } = r;
  row.region_id = regionId[_region] ?? null;

  const { data: existing } = await sb
    .from("rfp_posts").select("id").eq("slug", row.slug).maybeSingle();
  if (existing) { skipped++; continue; }

  const { data: post, error } = await sb
    .from("rfp_posts").insert(row).select("id").single();
  if (error) { console.error(`  ✗ ${row.title.slice(0, 50)} — ${error.message}`); continue; }

  if (catId[_category]) {
    await sb.from("rfp_categories").insert({ rfp_id: post.id, category_id: catId[_category] });
  }
  inserted++;
}
console.log(`\nInserted ${inserted} as pending_review, skipped ${skipped} already present.`);
console.log(`Review and publish at /admin/rfps`);
