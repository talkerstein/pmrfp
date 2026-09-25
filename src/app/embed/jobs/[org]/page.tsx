import { WidgetEmpty, WidgetRow, WidgetShell, WidgetUnavailable } from "@/components/embed/widget-shell";
import { getActiveOrg } from "@/lib/embed/data";
import { listOpenJobs } from "@/lib/jobs/data";
import { EMPLOYMENT_LABEL, payLabel } from "@/lib/jobs/rules";
import { MAX_ITEMS, outLink } from "@/lib/embed/widgets";
import { SITE } from "@/lib/site";

export const revalidate = 900;
export async function generateStaticParams() {
  return [];
}

/** A company's open jobs, for the careers page on its own site. Applicants apply on PMRFP. */
export default async function JobsWidget({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [org, { ready, jobs }] = await Promise.all([getActiveOrg(slug), listOpenJobs()]);
  if (!org || !ready) return <WidgetUnavailable href={outLink(SITE.url, "/jobs", "jobs")} />;
  const shown = jobs.filter((j) => j.company.id === org.id).slice(0, MAX_ITEMS);

  return (
    <WidgetShell
      kind="jobs"
      eyebrow="We're hiring"
      title={`Open jobs at ${org.name}`}
      subtitle={shown.length > 0 ? "Apply in a minute. No account needed." : null}
      footerLinks={[
        { href: outLink(SITE.url, "/jobs", "jobs"), label: "More trade jobs" },
        { href: outLink(SITE.url, "/jobs/post", "jobs"), label: "Hiring? Post free" },
      ]}
    >
      {shown.length === 0 ? (
        <WidgetEmpty>No open positions right now. Check back soon.</WidgetEmpty>
      ) : (
        shown.map((j) => (
          <WidgetRow
            key={j.slug}
            href={outLink(SITE.url, `/jobs/${j.slug}`, "jobs")}
            title={j.title}
            badge={EMPLOYMENT_LABEL[j.employmentType]}
            meta={[j.city, payLabel(j.payMin, j.payMax, j.payUnit)].filter(Boolean).join(" · ")}
          />
        ))
      )}
    </WidgetShell>
  );
}
