import { requireRole } from "@/lib/access/access";
import { getCategories, getRegions, getPropertyTypes } from "@/lib/data/taxonomy";
import { getVisitorGeo } from "@/lib/visitor-geo.server";
import { visitorRegionSlug } from "@/lib/visitor-geo";
import { PageHeader } from "@/components/dashboard/stat-card";
import { RfpPostForm, type RfpPostDefaults } from "@/components/forms/rfp-post-form";
import { GcPackageForm, type GcPackageDefaults } from "@/components/forms/gc-package-form";
import { getRfpTemplate } from "@/lib/seo/rfp-templates";
import { localizeRfpTemplate } from "@/lib/seo/rfp-templates.fr";
import { getLang } from "@/i18n/server";
import { getLinkableAward, regionSlugById } from "@/lib/gc/data";
import { parseAwardRef } from "@/lib/gc/packages";
import { SITE } from "@/lib/site";
import type { Metadata } from "next";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { reportRfpPrefill } from "@/lib/report-quotes/prefill";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").pm.newRfp.metaTitle };
}

export default async function NewRfpPage({
  searchParams, params }: {
  searchParams: Promise<{ template?: string; draft?: string; kind?: string; award?: string; report?: string; trade?: string; address?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("pm").newRfp;
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const [{ template: templateSlug, draft, kind, award: awardParam, report: reportParam, trade: tradeParam, address: addressParam }, categories, regions, propertyTypes, geo] = await Promise.all([
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
            relatedContractLabel: `${award.title}${award.winner ? fmt(t.gcWonBy, { winner: award.winner }) : ""}${award.value ? ` (${award.value})` : ""}`,
            ...(award.province ? { province: award.province } : {}),
            ...(awardRegion && regions.some((r) => r.slug === awardRegion) ? { regionSlug: awardRegion } : {}),
          }
        : {}),
    };
    return (
      <div>
        <PageHeader
          title={t.gcTitle}
          description={t.gcDescription}
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

  // The draft opens in the page's language (the stored trade slug stays English).
  const rawTemplate = templateSlug ? getRfpTemplate(templateSlug) : undefined;
  const template = rawTemplate ? localizeRfpTemplate(rawTemplate, getLang()) : undefined;
  // Report → Quotes hands over one reviewed trade group (?report=&trade=[&address=1]).
  const fromReport = reportParam && tradeParam ? await reportRfpPrefill(reportParam, tradeParam, addressParam === "1", getLang(), categories, regions) : null;
  const defaults: RfpPostDefaults | undefined = template
    ? {
        title: template.titleSample,
        summary: template.summarySample,
        scope: template.scope,
        requirements: template.requirements,
        categories: [template.tradeSlug],
        templateSlug: template.slug,
        templateName: template.shortName,
        ...geoDefaults,
      }
    : { ...geoDefaults, ...fromReport?.defaults };

  return (
    <div>
      <PageHeader
        title={t.title}
        description={template ? fmt(t.descriptionTemplate, { name: defaults?.templateName ?? "" }) : t.description}
      />
      {fromReport && <p className="mb-4 rounded-lg border border-teal-300 bg-teal-50/60 p-3 text-sm">{fromReport.notice}</p>}
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
