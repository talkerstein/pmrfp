import type { Metadata } from "next";
import Link from "@/i18n/link";
import { redirect } from "next/navigation";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { listPublishedReviews } from "@/lib/data/projects";
import { getProjectSession } from "@/lib/projects/server";
import { loadMyProject, type EditableProject } from "@/lib/projects/manage";
import { willAutoPublish } from "@/lib/projects/publish";
import { photoLimit } from "@/lib/projects/limits";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { CaseStudyBuilder } from "@/components/projects/case-study-builder";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: getDictionary(hasLocale(lang) ? lang : "en").portfolio.builder.metaTitle,
    robots: { index: false, follow: false },
  };
}

/** Demo preview only (no Supabase): an empty project, so the steps can be looked at. */
const DEMO_PROJECT: EditableProject = {
  id: "00000000-0000-4000-8000-000000000000",
  slug: "demo",
  status: "published",
  title: "",
  summary: "",
  visibility: "public",
  clientType: "",
  scope: "",
  challenge: "",
  approach: "",
  outcome: "",
  results: [],
  categorySlug: "",
  regionSlug: "",
  propertyTypeName: null,
  city: "",
  startedOn: "",
  completedOn: "",
  valueBand: "",
  legacyBudget: null,
  timeline: null,
  photos: [],
  heroUrl: null,
  aiAssisted: false,
};

/**
 * The case-study builder for one project. The company's own members only:
 * the project is read through their RLS-bound client and saved by a server
 * action that re-checks ownership (lib/projects/manage).
 */
export default async function CaseStudyBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("portfolio").builder;
  const { id } = await params;
  const role = await requireRole(["trade", "supplier"]);
  if (!role.organization) redirect(localizePath("/onboarding", lang));
  const demo = isDemoMode();

  const session = demo ? null : await getProjectSession();
  if (!demo && !session) redirect(localizePath("/dashboard", lang));
  const paid = role.hasTradeAccess;

  const [{ project, ready }, categories, regions, propertyTypes, reviews] = await Promise.all([
    demo ? Promise.resolve({ project: DEMO_PROJECT, ready: true }) : loadMyProject(session!, id),
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    demo ? Promise.resolve([]) : listPublishedReviews({ caseStudyId: id }),
  ]);

  const back = (
    <Link href="/dashboard/projects" className="text-sm font-medium text-teal-ink hover:underline">
      {t.back}
    </Link>
  );

  if (!project || project.status === "archived" || !ready) {
    return (
      <>
        <PageHeader title={t.title} action={back} />
        <p className="max-w-2xl rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {!project ? t.notFound : project.status === "archived" ? t.archived : t.notReady}
        </p>
      </>
    );
  }

  const propertyTypeSlug = propertyTypes.find((p) => p.name === project.propertyTypeName)?.slug ?? "";

  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader title={t.title} description={t.description} action={back} />
      <CaseStudyBuilder
        project={{
          id: project.id,
          status: project.status,
          title: project.title,
          summary: project.summary,
          visibility: project.visibility,
          clientType: project.clientType,
          scope: project.scope,
          challenge: project.challenge,
          approach: project.approach,
          outcome: project.outcome,
          results: project.results,
          categorySlug: project.categorySlug,
          regionSlug: project.regionSlug,
          propertyTypeSlug,
          city: project.city,
          startedOn: project.startedOn,
          completedOn: project.completedOn,
          valueBand: project.valueBand,
          legacyBudget: project.legacyBudget,
          photos: project.photos,
          heroUrl: project.heroUrl,
        }}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        propertyTypes={propertyTypes}
        regions={regions.map((r) => ({ slug: r.slug, name: r.name, country: r.country }))}
        paid={paid}
        autoPublish={session ? willAutoPublish(session) : false}
        photoLimit={Math.max(photoLimit(paid), project.photos.length)}
        reviewCount={reviews.length}
      />
    </>
  );
}
