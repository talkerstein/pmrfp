import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarClock, DollarSign, MapPin } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { JobApplyForm } from "@/components/jobs/job-forms";
import { JsonLd } from "@/lib/seo/jsonld";
import { getJob } from "@/lib/jobs/data";
import { EMPLOYMENT_LABEL, jobPostingJsonLd, payLabel } from "@/lib/jobs/rules";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

type Props = { params: Promise<{ slug: string }> };

function isOpen(job: { status: string; expiresAt: string }): boolean {
  return job.status === "open" && job.expiresAt >= new Date().toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) return { title: "Job not found" };
  const where = [job.city, job.province].filter(Boolean).join(", ");
  return {
    title: `${job.title} — ${job.company.name}, ${where}`,
    description: `${EMPLOYMENT_LABEL[job.employmentType]} ${job.trade ? `${job.trade.toLowerCase()} ` : ""}job with ${job.company.name} in ${where}. ${job.description.slice(0, 120)}`,
    alternates: { canonical: `/jobs/${job.slug}` },
    // Closed jobs stay reachable for old links but drop out of search.
    ...(isOpen(job) ? {} : { robots: { index: false, follow: true } }),
  };
}

function fmt(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function JobPage({ params }: Props) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();
  const open = isOpen(job);
  const pay = payLabel(job.payMin, job.payMax, job.payUnit);
  const where = [job.city, job.province].filter(Boolean).join(", ");
  const listed = job.company.type === "trade_company" || job.company.type === "supplier";

  return (
    <Container className="py-10">
      {open && (
        <JsonLd
          data={jobPostingJsonLd({
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            createdAt: job.createdAt,
            expiresAt: job.expiresAt,
            employmentType: job.employmentType,
            city: job.city,
            province: job.province,
            country: job.country,
            payMin: job.payMin,
            payMax: job.payMax,
            payUnit: job.payUnit,
            company: {
              name: job.company.name,
              url: job.company.website ?? `${BASE}/directory/${job.company.slug}`,
              logo: job.company.logoUrl ? `${BASE}${job.company.logoUrl.startsWith("/") ? "" : "/"}${job.company.logoUrl}` : null,
            },
            url: `${BASE}/jobs/${job.slug}`,
          })}
        />
      )}
      <Link href="/jobs" className="text-sm text-muted-foreground hover:text-foreground">
        ← All jobs
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {job.trade && <Badge variant="secondary">{job.trade}</Badge>}
            <Badge variant="outline">{EMPLOYMENT_LABEL[job.employmentType]}</Badge>
            {job.pro && <Badge className="bg-indigo text-teal-300">Pro employer</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{job.company.name}</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" /> {where}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-4" /> {EMPLOYMENT_LABEL[job.employmentType]}
            </span>
            {pay && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <DollarSign className="size-4" /> {pay}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" /> Posted {fmt(job.createdAt)}
            </span>
          </div>

          {!open && (
            <p className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
              <strong>This job is no longer taking applications.</strong>{" "}
              <Link href={job.tradeSlug ? `/jobs?trade=${job.tradeSlug}` : "/jobs"} className="font-medium text-teal-700 hover:underline">
                See open {job.trade ? job.trade.toLowerCase() : ""} jobs
              </Link>
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">About the job</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{job.description}</p>
          </section>
          {job.requirements && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold tracking-tight">Requirements</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{job.requirements}</p>
            </section>
          )}
          <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
            Posted by {job.company.name} on PMRFP. PMRFP doesn&apos;t employ or vet applicants and isn&apos;t party to any
            hiring decision.
          </p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {open && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Apply to {job.company.name}</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">Takes a minute. They reply to you directly.</p>
              <JobApplyForm slug={job.slug} company={job.company.name} />
            </div>
          )}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white text-sm font-bold text-indigo">
              {job.company.logoUrl ? (
                <Image src={job.company.logoUrl} alt="" fill sizes="48px" className="object-contain p-1" unoptimized={job.company.logoUrl.endsWith(".svg")} />
              ) : (
                job.company.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{job.company.name}</p>
              {listed ? (
                <Link href={`/directory/${job.company.slug}`} className="text-sm font-medium text-teal-700 hover:underline">
                  See their profile and past work
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Hiring on PMRFP</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </Container>
  );
}
