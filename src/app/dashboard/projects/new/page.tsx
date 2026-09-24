import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { getCategories, getPropertyTypes, getRegions } from "@/lib/data/taxonomy";
import { countActiveProjects, projectsReady } from "@/lib/projects/server";
import { canAddProject, photoLimit } from "@/lib/projects/limits";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { ProjectCapture } from "@/components/projects/project-capture";

export const metadata: Metadata = { title: "Add a project · PMRFP" };

/**
 * Photo-first project capture. Made for a phone on site: snap before /
 * during / after, say what you did in a line, let AI draft the write-up,
 * publish. The long typed form (/dashboard/case-studies/new) still works.
 */
export default async function NewProjectPage() {
  const session = await requireRole(["trade", "supplier"]);
  const org = session.organization;
  if (!org) redirect("/onboarding");
  const demo = isDemoMode();
  const paid = session.hasTradeAccess;

  const [categories, regions, propertyTypes, existing, ready] = await Promise.all([
    getCategories(),
    getRegions(),
    getPropertyTypes(),
    demo ? Promise.resolve(0) : countActiveProjects(org.id),
    demo ? Promise.resolve(true) : projectsReady(),
  ]);

  if (!ready) {
    return (
      <>
        <PageHeader title="Add a project" />
        <p className="max-w-2xl rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Photo projects are switching on soon. Until then you can{" "}
          <Link href="/dashboard/case-studies/new" className="font-medium text-teal-ink hover:underline">
            write up a project as a case study
          </Link>
          .
        </p>
      </>
    );
  }

  if (!canAddProject(paid, existing)) {
    return (
      <>
        <PageHeader title="Add a project" />
        <div className="max-w-2xl rounded-xl border border-teal-300 bg-teal-50/60 p-6">
          <h2 className="text-base font-semibold">You&apos;ve used your free project</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trade Pro lets you add every job you&apos;re proud of, with up to 24 photos each, and ask
            your clients for reviews that show on your profile.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ActivateButton />
            <Link href="/dashboard/projects" className="text-sm font-medium text-teal-ink hover:underline">
              Back to your projects
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader
        title="Add a project"
        description="Photos from the job and a line about what you did. We'll draft the write-up. About two minutes."
        action={
          <Link href="/dashboard/case-studies/new" className="text-sm font-medium text-teal-ink hover:underline">
            Prefer to type it all out?
          </Link>
        }
      />
      <ProjectCapture
        paid={paid}
        photoLimit={photoLimit(paid)}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        propertyTypes={propertyTypes}
        regions={regions.map((r) => ({ slug: r.slug, name: r.name, country: r.country }))}
      />
    </>
  );
}
