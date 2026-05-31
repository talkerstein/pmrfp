/**
 * Seed founding-cohort suppliers + trades into pmrfp.com from Rishon's
 * real-world network. is_demo=false → counted as real. profile_status=approved
 * + status=active → visible in directory immediately.
 *
 * Usage: node scripts/seed-founding-orgs.mjs
 * Idempotent — upserts by slug.
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
  // ───── Suppliers ─────
  {
    name: "Archimat",
    slug: "archimat",
    organization_type: "supplier",
    website: "https://archimat.ca",
    city: "Laval",
    province: "Quebec",
    short_description:
      "Renovation materials supplier — tiles, flooring, kitchen, bathroom, and heated-floor systems for residential, commercial, and hospitality projects.",
    full_description:
      "Montreal/Laval-based renovation hub stocking tiles, stones, flooring, kitchen cabinets, countertops, bathroom fixtures, and heated-floor systems. Serves residential, commercial, and hospitality customers across Quebec.",
  },
  {
    name: "Liquidation 1740",
    slug: "liquidation-1740",
    organization_type: "supplier",
    website: "https://liquidation1740.com",
    email: "info@liquidation1740.com",
    phone: "450-970-2600",
    city: "Saint-Jérôme",
    province: "Quebec",
    short_description:
      "Liquidation pricing on flooring, kitchen, and bathroom renovation materials. Delivery within 80 km of Montreal.",
    full_description:
      "Discount renovation supplier specializing in ceramics, tiles, vinyl, laminate, countertops, cabinets, faucets, and vanities. Delivery throughout the Greater Montreal region.",
  },
  {
    name: "Kidicare",
    slug: "kidicare",
    organization_type: "supplier",
    website: "https://kidicare.ca",
    email: "info@kidicare.ca",
    phone: "514-774-4250",
    city: "Montreal",
    province: "Quebec",
    short_description:
      "Factory-direct daycare furniture and turnkey childcare-centre setup — Canada-wide shipping + installation.",
    full_description:
      "Daycare furniture supplier offering tables, chairs, cribs, changing tables, kitchen sets, and custom millwork. Turnkey package: consulting, space planning, renovations, design, delivery, and installation for early-childhood facilities across Canada.",
  },
  {
    name: "Inspera",
    slug: "inspera",
    organization_type: "supplier",
    website: "https://inspera.ca",
    email: "info@inspera.ca",
    phone: "514-774-4250",
    address_line_1: "9600 Blvd Saint-Laurent, Suite 200",
    city: "Montreal",
    province: "Quebec",
    postal_code: "H2N 1R1",
    short_description:
      "Commercial-grade furniture + turnkey furnishing for government, institutional, and corporate projects.",
    full_description:
      "National supplier of commercial seating, tables, desks, storage, acoustic furniture, and learning-space outfitting. Specializes in compliant procurement and installation for public-sector and institutional clients across Canada.",
  },
  {
    name: "CleverPays",
    slug: "cleverpays",
    organization_type: "supplier",
    website: "https://cleverpays.ca",
    email: "info@cleverpays.ca",
    phone: "888-220-8060",
    address_line_1: "2285 Av Francis-Hughes",
    city: "Laval",
    province: "Quebec",
    postal_code: "H7S 1N5",
    short_description:
      "Payment processing + POS hardware for Canadian trades and service businesses — no hidden fees, no contracts.",
    full_description:
      "Payment processor offering Clover POS terminals, eCommerce gateways, virtual terminals, inventory + employee management, gift cards, and 500+ integrations. Built for service-based businesses across Canada and the US.",
  },
  {
    name: "Talkerstein Consulting Group",
    slug: "talkerstein-consulting",
    organization_type: "supplier",
    website: "https://talkerstein.com",
    email: "hi@talkerstein.ca",
    phone: "416-937-7676",
    address_line_1: "5050 Dufferin St.",
    city: "Toronto",
    province: "Ontario",
    short_description:
      "Brand, web, and AI strategy partner for high-ticket trades and service businesses.",
    full_description:
      "Toronto consulting firm providing brand strategy, web/UX design, AI implementation, marketing automation, SEO/paid ads, and custom AI agents. Works with trades and service businesses on positioning, lead generation, and operational systems.",
  },
  // ───── Trades ─────
  {
    name: "BathsOnly",
    slug: "baths-only",
    organization_type: "trade_company",
    website: "https://bathsonly.ca",
    phone: "416-712-1119",
    city: "Thornhill",
    province: "Ontario",
    short_description:
      "Bathroom renovation + custom design — owner-led, Thornhill + GTA.",
    full_description:
      "Specialized bathroom renovation contractor offering complete remodeling and custom design. Owner-led by Michael Gabay, serving Thornhill and the Greater Toronto Area.",
  },
  {
    name: "BSD Renovations",
    slug: "bsd-renovations",
    organization_type: "trade_company",
    website: "https://bsdrenovations.ca",
    email: "bsdrenovations@gmail.com",
    phone: "416-712-1119",
    city: "Toronto",
    province: "Ontario",
    short_description:
      "Kitchen, bathroom, condo, and basement renovations across the GTA — 15+ years experience.",
    full_description:
      "Toronto-based renovation company specializing in kitchen, bathroom, condo, and basement remodeling. Serving Toronto, Vaughan, Thornhill, Richmond Hill, North York, Oakville, and surrounding areas.",
  },
  {
    name: "Crystal Ball Windows & Doors",
    slug: "crystal-ball-windows",
    organization_type: "trade_company",
    website: "https://crystal-ball.ca",
    city: "Toronto",
    province: "Ontario",
    short_description: "Premium windows and glass doors — Canadian supplier and installer.",
    full_description:
      "Specialist supplier and installer of premium windows and glass doors for residential and commercial properties.",
  },
];

let okCount = 0, errCount = 0;
for (const o of orgs) {
  const payload = {
    ...o,
    country: "Canada",
    is_demo: false,
    profile_status: "approved",
    verified: false,
    featured: false,
    public_contact_visibility: "show_contact",
    profile_completion_score: 70,
  };

  const { data, error } = await sb
    .from("organizations")
    .upsert(payload, { onConflict: "slug" })
    .select("id,name,slug,organization_type")
    .single();

  if (error) {
    console.error(`✗ ${o.slug}:`, error.message);
    errCount++;
  } else {
    console.log(`✓ ${data.organization_type.padEnd(16)} ${data.slug.padEnd(28)} → ${data.id}`);
    okCount++;
  }
}

console.log(`\nDone: ${okCount} ok, ${errCount} errors.`);
