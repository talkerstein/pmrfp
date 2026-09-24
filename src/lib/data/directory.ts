import { createReadClient } from "@/lib/supabase/read";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEMO_SUPPLIERS,
  DEMO_VENDORS,
  categoryName,
  regionName,
  type DemoVendor,
} from "@/lib/demo-data";
import type { VendorDetail, VendorFilters, VendorListItem } from "@/lib/data/types";

function demoToListItem(v: DemoVendor): VendorListItem {
  return {
    slug: v.slug,
    name: v.name,
    city: v.city,
    province: v.province,
    shortDescription: v.shortDescription,
    logoUrl: null,
    verified: v.verified,
    featured: v.featured,
    yearsInBusiness: v.yearsInBusiness,
    insuranceStatus: v.insuranceStatus,
    wsibStatus: v.wsibStatus,
    categories: v.categories.map(categoryName),
    regions: v.regions.map(regionName),
  };
}

function applyDemoFilters(list: DemoVendor[], f: VendorFilters): DemoVendor[] {
  let out = [...list];
  if (f.category) out = out.filter((v) => v.categories.includes(f.category!));
  if (f.region) out = out.filter((v) => v.regions.includes(f.region!));
  if (f.propertyType) out = out.filter((v) => v.propertyTypes.includes(f.propertyType!));
  if (f.verified) out = out.filter((v) => v.verified);
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.shortDescription.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q),
    );
  }
  if (f.sort === "alpha") out.sort((a, b) => a.name.localeCompare(b.name));
  else out.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.verified) - Number(a.verified));
  return out;
}

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  short_description: string | null;
  full_description: string | null;
  logo_url: string | null;
  verified: boolean;
  featured: boolean;
  years_in_business: number | null;
  employee_count_range: string | null;
  insurance_status: string | null;
  wsib_status: string | null;
  emergency_service: boolean;
  public_contact_visibility: VendorDetail["contactVisibility"];
  website: string | null;
  email: string | null;
  phone: string | null;
  organization_categories: { trade_categories: { name: string; slug: string } | null }[];
  organization_regions: { regions: { name: string; slug: string } | null }[];
  organization_property_types: { property_types: { name: string; slug: string } | null }[];
}

const ORG_SELECT =
  "id,slug,name,city,province,short_description,full_description,logo_url,verified,featured,years_in_business,employee_count_range,insurance_status,wsib_status,emergency_service,public_contact_visibility,website,email,phone," +
  "organization_categories(trade_categories(name,slug))," +
  "organization_regions(regions(name,slug))," +
  "organization_property_types(property_types(name,slug))";

/**
 * List public portfolio photos for an org. Convention: any object in
 * logos/{orgId}/portfolio-*.{ext} is a portfolio photo. We list by prefix
 * via the anon client (`logos` bucket is public).
 */
async function getPortfolioPhotos(orgId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    const supabase = createReadClient();
    const { data } = await supabase.storage.from("logos").list(orgId, {
      limit: 100,
      search: "portfolio-",
      sortBy: { column: "created_at", order: "asc" },
    });
    return (data ?? [])
      .filter((o) => o.name.startsWith("portfolio-"))
      .map((o) => `${SUPABASE_URL}/storage/v1/object/public/logos/${orgId}/${o.name}`);
  } catch {
    return [];
  }
}

/**
 * Slugs on the Platinum tier. Queried separately from ORG_SELECT (same
 * pattern as the Google-rating columns) so a database without the
 * `platinum` column degrades to "nobody is Platinum" instead of breaking
 * every directory query on the site.
 */
async function platinumSlugs(supabase: ReturnType<typeof createReadClient>): Promise<Set<string>> {
  const { data, error } = await supabase.from("organizations").select("slug").eq("platinum", true);
  if (error || !data) return new Set();
  return new Set((data as { slug: string }[]).map((r) => r.slug));
}

/** Platinum, then featured, then verified. */
function tierRank(v: { platinum?: boolean; featured: boolean; verified: boolean }): number {
  return (v.platinum ? 4 : 0) + (v.featured ? 2 : 0) + (v.verified ? 1 : 0);
}

export async function listVendors(filters: VendorFilters = {}): Promise<VendorListItem[]> {
  const orgType = filters.orgType ?? "trade_company";
  if (!isSupabaseConfigured()) {
    const source = orgType === "supplier" ? DEMO_SUPPLIERS : DEMO_VENDORS;
    return applyDemoFilters(source, filters).map(demoToListItem);
  }
  const supabase = createReadClient();
  let query = supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("organization_type", orgType)
    .eq("profile_status", "approved")
    .eq("status", "active")
    // Seeded sample companies never appear on the live site — the directory
    // must only list real businesses.
    .eq("is_demo", false);
  if (filters.verified) query = query.eq("verified", true);
  if (filters.q) query = query.ilike("name", `%${filters.q}%`);
  const [{ data }, platinum] = await Promise.all([query.limit(200), platinumSlugs(supabase)]);
  const rows = ((data as unknown as OrgRow[]) ?? []).filter((r) => {
    const cats = r.organization_categories.map((c) => c.trade_categories?.slug).filter(Boolean);
    const regs = r.organization_regions.map((c) => c.regions?.slug).filter(Boolean);
    const props = r.organization_property_types.map((c) => c.property_types?.slug).filter(Boolean);
    if (filters.category && !cats.includes(filters.category)) return false;
    if (filters.region && !regs.includes(filters.region)) return false;
    if (filters.propertyType && !props.includes(filters.propertyType)) return false;
    return true;
  });
  const out: VendorListItem[] = rows.map((r) => toListItem(r, platinum));
  if (filters.sort === "alpha") return out.sort((a, b) => a.name.localeCompare(b.name));
  return out.sort((a, b) => tierRank(b) - tierRank(a));
}

function toListItem(r: OrgRow, platinum: Set<string>): VendorListItem {
  return {
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    shortDescription: r.short_description,
    logoUrl: r.logo_url,
    verified: r.verified,
    featured: r.featured || platinum.has(r.slug),
    platinum: platinum.has(r.slug),
    yearsInBusiness: r.years_in_business,
    insuranceStatus: r.insurance_status,
    wsibStatus: r.wsib_status,
    categories: r.organization_categories.map((c) => c.trade_categories?.name).filter(Boolean) as string[],
    regions: r.organization_regions.map((c) => c.regions?.name).filter(Boolean) as string[],
  };
}

/** Live, approved trades by organization id, keyed by id (trusted-trades pages). */
export async function listVendorsByIds(ids: string[]): Promise<Map<string, VendorListItem>> {
  const out = new Map<string, VendorListItem>();
  if (!ids.length || !isSupabaseConfigured()) return out;
  const supabase = createReadClient();
  const [{ data }, platinum] = await Promise.all([
    supabase
      .from("organizations")
      .select(ORG_SELECT)
      .in("id", ids)
      .eq("profile_status", "approved")
      .eq("status", "active")
      .eq("is_demo", false),
    platinumSlugs(supabase),
  ]);
  for (const r of (data as unknown as OrgRow[]) ?? []) out.set(r.id, toListItem(r, platinum));
  return out;
}

/**
 * Where a retired listing's URL should permanently redirect, or null if the
 * slug never existed (→ plain 404). Retired = a seeded demo company or a
 * suspended/deleted one. Sends the URL's search equity to the closest real
 * page: its trade's page, else the directory.
 */
export async function retiredVendorRedirect(slug: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createReadClient();
  const { data } = await supabase
    .from("organizations")
    .select("organization_type,organization_categories(trade_categories(slug))")
    .eq("slug", slug)
    .maybeSingle();
  const r = data as unknown as {
    organization_type: string;
    organization_categories: { trade_categories: { slug: string } | null }[];
  } | null;
  if (!r) return null;
  const cat = r.organization_categories.map((c) => c.trade_categories?.slug).find(Boolean);
  if (r.organization_type === "supplier") return "/suppliers";
  return cat ? `/trades/${cat}` : "/directory";
}

export async function getVendor(slug: string): Promise<VendorDetail | null> {
  if (!isSupabaseConfigured()) {
    const v = [...DEMO_VENDORS, ...DEMO_SUPPLIERS].find((x) => x.slug === slug);
    if (!v) return null;
    const showContact = v.contactVisibility === "show_contact";
    return {
      ...demoToListItem(v),
      id: v.slug,
      fullDescription: v.fullDescription,
      yearsInBusiness: v.yearsInBusiness,
      employeeCountRange: v.employeeCountRange,
      insuranceStatus: v.insuranceStatus,
      wsibStatus: v.wsibStatus,
      emergencyService: v.emergencyService,
      propertyTypes: v.propertyTypes.map((p) => p),
      contactVisibility: v.contactVisibility,
      website: showContact ? v.website : null,
      email: showContact ? v.email : null,
      phone: showContact ? v.phone : null,
      portfolioPhotos: [],
      googleRating: null,
      googleReviewCount: null,
    };
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("slug", slug)
    .eq("profile_status", "approved")
    .eq("is_demo", false)
    .maybeSingle();
  const r = data as unknown as OrgRow | null;
  if (!r) return null;
  const showContact = r.public_contact_visibility === "show_contact";
  const portfolioPhotos = await getPortfolioPhotos(r.id);
  // Google rating columns arrive with the 20260819 migration. Queried
  // separately from ORG_SELECT so a not-yet-migrated database degrades to
  // "no rating shown" instead of breaking every vendor query on the site.
  let googleRating: number | null = null;
  let googleReviewCount: number | null = null;
  {
    const { data: g } = await supabase
      .from("organizations")
      .select("google_rating,google_review_count")
      .eq("id", r.id)
      .maybeSingle();
    const gr = g as { google_rating: number | null; google_review_count: number | null } | null;
    googleRating = gr?.google_rating ?? null;
    googleReviewCount = gr?.google_review_count ?? null;
  }
  const isPlatinum = (await platinumSlugs(supabase)).has(r.slug);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    shortDescription: r.short_description,
    logoUrl: r.logo_url,
    verified: r.verified,
    featured: r.featured || isPlatinum,
    platinum: isPlatinum,
    categories: r.organization_categories.map((c) => c.trade_categories?.name).filter(Boolean) as string[],
    regions: r.organization_regions.map((c) => c.regions?.name).filter(Boolean) as string[],
    fullDescription: r.full_description,
    yearsInBusiness: r.years_in_business,
    employeeCountRange: r.employee_count_range,
    insuranceStatus: r.insurance_status,
    wsibStatus: r.wsib_status,
    emergencyService: r.emergency_service,
    propertyTypes: r.organization_property_types.map((c) => c.property_types?.name).filter(Boolean) as string[],
    googleRating,
    googleReviewCount,
    contactVisibility: r.public_contact_visibility,
    website: showContact ? r.website : null,
    email: showContact ? r.email : null,
    phone: showContact ? r.phone : null,
    portfolioPhotos,
  };
}
