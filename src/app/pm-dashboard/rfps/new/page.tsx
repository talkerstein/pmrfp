import { requireRole } from "@/lib/access/access";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { visitorRegionSlug } from "@/lib/visitor-geo";
import { PageHeader } from "@/components/dashboard/stat-card";
import { RfpPostForm, type RfpPostDefaults } from "@/components/forms/rfp-post-form";
import { GcPackageForm, type GcPackageDefaults } from "@/components/forms/gc-package-form";
import { getRfpTemplate } from "@/lib/seo/rfp-templates";
import { getLinkableAward, regionSlugById } from "@/lib/gc/data";
import { parseAwardRef } from "@/lib/gc/packages";
import { SITE } from "@/lib/site";

export const metadata = { title: "Post an RFP" };

export default async function NewRfpPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; draft?: string; kind?: string; award?: string }>;
}) {
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const [{ template: templateSlug, draft, kind, award: awardParam }, categories, regions, propertyTypes, geo] = await Promise.all([
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

  // General contractors post sub-trade packages. ?kind=gc asks for that form;
  // a builder organization gets it by default (?kind=rfp for a plain RFP).
  const isGc = kind === "gc" || (kind !== "rfp" && session.organization?.organization_type === "builder");
  if (isGc) {
    const award = await getLinkableAward(parseAwardRef(awardParam));
    const awardRegion = await regionSlugById(award?.regionId ?? null);
    const gcDefaults: GcPackageDefaults = {
      ...geoDefaults,
      ...(award
        ? {
            projectName: award.title,
            relatedContract: `${SITE.url}/rfps/${award.slug}`,
            relatedContractLabel: `${award.title}${award.winner ? ` — won by ${award.winner}` : ""}${award.value ? ` (${award.value})` : ""}`,
            ...(award.province ? { province: award.province } : {}),
            ...(awardRegion && regions.some((r) => r.slug === awardRegion) ? { regionSlug: awardRegion } : {}),
          }
        : {}),
    };
    return (
      <div>
        <PageHeader
          title="Post a sub-trade package"
          description="One package per trade. Local trades in that trade and region get it in their daily email. Free for contractors. We review every package before it goes live."
        />
        <GcPackageForm
          categories={categories}
          regions={regions}
          defaults={gcDefaults}
          organizationId={session.organization?.id ?? null}
        />
      </div>
    );
  }

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
