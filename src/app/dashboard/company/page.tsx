import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";
import { PageHeader } from "@/components/dashboard/stat-card";
import { CompanyProfileForm, type CompanyDefaults } from "@/components/forms/company-profile-form";

export const metadata = { title: "Company Profile" };

export default async function CompanyProfilePage() {
  const session = await requireRole(["trade"]);
  const [categories, regions, propertyTypes] = await Promise.all([
    getCategories(),
    getRegions(),
    getPropertyTypes(),
  ]);

  let defaults: CompanyDefaults = {};
  let selectedCategories: string[] = [];
  let selectedRegions: string[] = [];
  let selectedPropertyTypes: string[] = [];

  const org = session.organization;
  if (org) {
    defaults = {
      name: org.name ?? undefined,
      website: org.website ?? undefined,
      phone: org.phone ?? undefined,
      email: org.email ?? undefined,
      addressLine1: org.address_line_1 ?? undefined,
      city: org.city ?? undefined,
      province: org.province ?? undefined,
      postalCode: org.postal_code ?? undefined,
      shortDescription: org.short_description ?? undefined,
      fullDescription: org.full_description ?? undefined,
      yearsInBusiness: org.years_in_business,
      employeeCountRange: org.employee_count_range ?? undefined,
      insuranceStatus: org.insurance_status ?? undefined,
      wsibStatus: org.wsib_status ?? undefined,
      emergencyService: org.emergency_service,
      publicContactVisibility: org.public_contact_visibility ?? undefined,
      logoUrl: org.logo_url ?? null,
    };
  }

  if (!isDemoMode() && org) {
    const supabase = await createClient();
    const [cats, regs, props] = await Promise.all([
      supabase.from("organization_categories").select("trade_categories(slug)").eq("organization_id", org.id),
      supabase.from("organization_regions").select("regions(slug)").eq("organization_id", org.id),
      supabase.from("organization_property_types").select("property_types(slug)").eq("organization_id", org.id),
    ]);
    selectedCategories = slugs(cats.data, "trade_categories");
    selectedRegions = slugs(regs.data, "regions");
    selectedPropertyTypes = slugs(props.data, "property_types");
  }

  return (
    <div>
      <PageHeader
        title="Company Profile"
        description="Keep your details current so property managers can find and trust you."
      />
      <CompanyProfileForm
        defaults={defaults}
        organizationId={session.organization?.id ?? null}
        categories={categories}
        regions={regions}
        propertyTypes={propertyTypes}
        selectedCategories={selectedCategories}
        selectedRegions={selectedRegions}
        selectedPropertyTypes={selectedPropertyTypes}
      />
    </div>
  );
}

function slugs(rows: unknown, key: string): string[] {
  const list = (rows as Array<Record<string, { slug: string } | { slug: string }[] | null>> | null) ?? [];
  const out: string[] = [];
  for (const row of list) {
    const rel = row[key];
    if (Array.isArray(rel)) {
      for (const r of rel) if (r?.slug) out.push(r.slug);
    } else if (rel?.slug) {
      out.push(rel.slug);
    }
  }
  return out;
}
