import { requireRole } from "@/lib/access/access";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { visitorRegionSlug } from "@/lib/visitor-geo";
import { PageHeader } from "@/components/dashboard/stat-card";
import { RfpPostForm, type RfpPostDefaults } from "@/components/forms/rfp-post-form";
import { getRfpTemplate } from "@/lib/seo/rfp-templates";

export const metadata = { title: "Post an RFP" };

export default async function NewRfpPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; draft?: string }>;
}) {
  const session = await requireRole(["property_manager"]);
  const [{ template: templateSlug, draft }, categories, regions, propertyTypes, geo] = await Promise.all([
    searchParams,
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    getVisitorGeo(),
  ]);
  // Where the manager is browsing from: a starting point for province/region.
  const home = visitorRegionSlug(geo);
  const geoDefaults: RfpPostDefaults = {
    ...(geo.province ? { province: geo.province } : {}),
    ...(home && regions.some((r) => r.slug === home) ? { regionSlug: home } : {}),
  };

  const template = templateSlug ? getRfpTemplate(templateSlug) : undefined;
  const defaults: RfpPostDefaults | undefined = template
    ? {
        title: template.titleSample,
        summary: template.summarySample,
        scope: template.scope,
        requirements: template.requirements,
        categories: [template.tradeSlug],
        templateSlug: template.slug,
        templateName: template.name.replace(/ RFP Template$/, ""),
        ...geoDefaults,
      }
    : geoDefaults;

  return (
    <div>
      <PageHeader
        title="Post an RFP"
        description={
          template
            ? `Pre-filled from the "${defaults?.templateName}" template. Edit any field before submitting.`
            : "Describe your project so qualified trades can express interest. We review every listing before it goes live."
        }
      />
      <RfpPostForm
        categories={categories}
        regions={regions}
        propertyTypes={propertyTypes}
        defaults={defaults}
        organizationId={session.organization?.id ?? null}
        loadWriterDraft={draft === "1"}
      />
    </div>
  );
}
