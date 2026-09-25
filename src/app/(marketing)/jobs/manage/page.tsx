import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Mail, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { JobStatusButton } from "@/components/jobs/job-forms";
import { getSession } from "@/lib/access/access";
import { getEmployerJobs } from "@/lib/jobs/data";
import { EMPLOYMENT_LABEL, FREE_JOB_LIMIT } from "@/lib/jobs/rules";

export const metadata: Metadata = {
  title: "Hiring",
  robots: { index: false, follow: false },
};

function fmt(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ManageJobsPage({ searchParams }: { searchParams: Promise<{ posted?: string }> }) {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/jobs/manage")}`);
  if (!session.organization) redirect(`/onboarding?next=${encodeURIComponent("/jobs/manage")}`);
  const { posted } = await searchParams;
  const { ready, jobs, applications } = await getEmployerJobs(session.organization.id);
  const today = todayIso();
  const openCount = jobs.filter((j) => j.status === "open" && j.expiresAt >= today).length;

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hiring</h1>
          <p className="mt-1 text-muted-foreground">
            {session.organization.name}: {openCount} open {openCount === 1 ? "job" : "jobs"}
            {session.hasTradeAccess ? "" : ` of ${FREE_JOB_LIMIT} free`}
          </p>
        </div>
        <Link href="/jobs/post" className={buttonVariants({ size: "lg" })}>
          Post a job
        </Link>
      </div>

      {posted && (
        <p className="mt-6 flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm font-medium">
          <Check className="size-4 text-teal-700" /> Your job is live.{" "}
          <Link href={`/jobs/${posted}`} className="text-teal-700 underline">
            See it
          </Link>
        </p>
      )}

      <div className="mt-8">
        {!ready ? (
          <EmptyState title="Jobs are switching on" description="Check back in a few minutes." />
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs yet" description="Post your first job and applications come straight to your inbox.">
            <Link href="/jobs/post" className={buttonVariants()}>
              Post a job
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {jobs.map((j) => {
              const open = j.status === "open" && j.expiresAt >= today;
              const apps = applications.filter((a) => a.jobId === j.id);
              return (
                <li key={j.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/jobs/${j.slug}`} className="font-semibold hover:text-teal-700">
                        {j.title}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {j.city} · {EMPLOYMENT_LABEL[j.employmentType]} ·{" "}
                        {open ? `open until ${fmt(j.expiresAt)}` : j.status === "closed" ? "closed" : `expired ${fmt(j.expiresAt)}`}
                      </p>
                    </div>
                    {open ? <JobStatusButton jobId={j.id} action="close" /> : <JobStatusButton jobId={j.id} action="renew" />}
                  </div>
                  <details className="mt-4" open={apps.length > 0 && apps.length <= 3}>
                    <summary className="cursor-pointer text-sm font-medium">
                      {apps.length} {apps.length === 1 ? "applicant" : "applicants"}
                    </summary>
                    {apps.length > 0 && (
                      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                        {apps.map((a) => (
                          <li key={a.id} className="p-4 text-sm">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-semibold">{a.name}</span>
                              <span className="text-xs text-muted-foreground">{fmt(a.createdAt)}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 hover:text-teal-700">
                                <Mail className="size-3.5" /> {a.email}
                              </a>
                              {a.phone && (
                                <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 hover:text-teal-700">
                                  <Phone className="size-3.5" /> {a.phone}
                                </a>
                              )}
                              {a.experienceYears != null && <span>{a.experienceYears} yrs experience</span>}
                            </div>
                            {a.certifications && <p className="mt-1">Tickets: {a.certifications}</p>}
                            {a.message && <p className="mt-2 whitespace-pre-line text-foreground/90">{a.message}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Container>
  );
}
