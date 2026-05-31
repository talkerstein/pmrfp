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
    .eq("status", "active");
  if (filters.verified) query = query.eq("verified", true);
  if (filters.q) query = query.ilike("name", `%${filters.q}%`);
  const { data } = await query.limit(200);
  let rows = ((data as unknown as OrgRow[]) ?? []).filter((r) => {
    const cats = r.organization_categories.map((c) => c.trade_categories?.slug).filter(Boolean);
    const regs = r.organization_regions.map((c) => c.regions?.slug).filter(Boolean);
    const props = r.organization_property_types.map((c) => c.property_types?.slug).filter(Boolean);
    if (filters.category && !cats.includes(filters.category)) return false;
    if (filters.region && !regs.includes(filters.region)) return false;
    if (filters.propertyType && !props.includes(filters.propertyType)) return false;
    return true;
  });
  if (filters.sort === "alpha") rows = rows.sort((a, b) => a.name.localeCompare(b.name));
  else rows = rows.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.verified) - Number(a.verified));
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    shortDescription: r.short_description,
    logoUrl: r.logo_url,
    verified: r.verified,
    featured: r.featured,
    categories: r.organization_categories.map((c) => c.trade_categories?.name).filter(Boolean) as string[],
    regions: r.organization_regions.map((c) => c.regions?.name).filter(Boolean) as string[],
  }));
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
    };
  }
  const supabase = createReadClient();
  const { data } = await supabase
    .from("organizations")
    .select(ORG_SELECT)
    .eq("slug", slug)
    .eq("profile_status", "approved")
    .maybeSingle();
  const r = data as unknown as OrgRow | null;
  if (!r) return null;
  const showContact = r.public_contact_visibility === "show_contact";
  const portfolioPhotos = await getPortfolioPhotos(r.id);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    province: r.province,
    shortDescription: r.short_description,
    logoUrl: r.logo_url,
    verified: r.verified,
    featured: r.featured,
    categories: r.organization_categories.map((c) => c.trade_categories?.name).filter(Boolean) as string[],
    regions: r.organization_regions.map((c) => c.regions?.name).filter(Boolean) as string[],
    fullDescription: r.full_description,
    yearsInBusiness: r.years_in_business,
    employeeCountRange: r.employee_count_range,
    insuranceStatus: r.insurance_status,
    wsibStatus: r.wsib_status,
    emergencyService: r.emergency_service,
    propertyTypes: r.organization_property_types.map((c) => c.property_types?.name).filter(Boolean) as string[],
    contactVisibility: r.public_contact_visibility,
    website: showContact ? r.website : null,
    email: showContact ? r.email : null,
    phone: showContact ? r.phone : null,
    portfolioPhotos,
  };
}
