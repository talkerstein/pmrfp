import type { Metadata } from "next";
import Image from "next/image";
import Link from "@/i18n/link";
import { notFound } from "next/navigation";
import { Briefcase, CalendarClock, DollarSign, MapPin } from "lucide-react";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { JobApplyForm } from "@/components/jobs/job-forms";
import { JsonLd } from "@/lib/seo/jsonld";
import { getJob } from "@/lib/jobs/data";
import { getOrgLinkOrg } from "@/lib/links/data";
import { structuredDataUrl } from "@/lib/links/policy";
import { jobPostingJsonLd, payLabelIn } from "@/lib/jobs/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, type Locale } from "@/i18n/config";
import { alternatesFor } from "@/i18n/metadata";
import { fmt, formatDate } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

type Props = { params: Promise<{ lang: string; slug: string }> };

function isOpen(job: { status: string; expiresAt: string }): boolean {
  return job.status === "open" && job.expiresAt >= new Date().toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const l = hasLocale(lang) ? lang : "en";
  const dict = getDictionary(l);
  const t = dict.jobs.detail.meta;
  const job = await getJob(slug);
  if (!job) return { title: t.notFound };
  const where = [job.city, job.province && regionName(job.province, l)].filter(Boolean).join(", ");
  const vars = {
    type: dict.jobsClient.employment[job.employmentType],
    company: job.company.name,
    where,
    excerpt: job.description.slice(0, 120),
  };
  return {
    title: `${job.title} — ${job.company.name}, ${where}`,
    description: job.trade
      ? fmt(t.descriptionTrade, { ...vars, trade: l === "en" ? job.trade.toLowerCase() : tradeName(job.trade, l) })
      : fmt(t.description, vars),
    alternates: alternatesFor(l, `/jobs/${job.slug}`),
    // Closed jobs stay reachable for old links but drop out of search.
    ...(isOpen(job) ? {} : { robots: { index: false, follow: true } }),
  };
}

function day(d: string, lang: Locale) {
  return formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang, { month: "long", day: "numeric", year: "numeric" });
}

export default async function JobPage({ params }: Props) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("jobs");
  const labels = getT("jobsClient");
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job) notFound();
  const open = isOpen(job);
  // The employer's own website goes into the JobPosting markup only when PMRFP's link to it is earned (lib/links/policy).
  const employerSite = open ? structuredDataUrl({ ...((await getOrgLinkOrg(job.company.slug)) ?? {}), website: job.company.website }) : undefined;
  const pay = payLabelIn(lang, labels.pay, job.payMin, job.payMax, job.payUnit);
  const where = [job.city, job.province && regionName(job.province, lang)].filter(Boolean).join(", ");
  const listed = job.company.type === "trade_company" || job.company.type === "supplier";
  const type = labels.employment[job.employmentType];

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
              url: employerSite ?? `${BASE}/directory/${job.company.slug}`,
              logo: job.company.logoUrl ? `${BASE}${job.company.logoUrl.startsWith("/") ? "" : "/"}${job.company.logoUrl}` : null,
            },
            url: `${BASE}/jobs/${job.slug}`,
          })}
        />
      )}
      <Link href="/jobs" className="text-sm text-muted-foreground hover:text-foreground">
        {t.detail.allJobs}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {job.trade && <Badge variant="secondary">{tradeName(job.trade, lang)}</Badge>}
            <Badge variant="outline">{type}</Badge>
            {job.pro && <Badge className="bg-indigo text-teal-300">{t.detail.proEmployer}</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{job.company.name}</p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" /> {where}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-4" /> {type}
            </span>
            {pay && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <DollarSign className="size-4" /> {pay}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" /> {fmt(t.detail.posted, { date: day(job.createdAt, lang) })}
            </span>
          </div>

          {!open && (
            <p className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
              <strong>{t.detail.closed}</strong>{" "}
              <Link href={job.tradeSlug ? `/jobs?trade=${job.tradeSlug}` : "/jobs"} className="font-medium text-teal-700 hover:underline">
                {job.trade ? fmt(t.detail.seeOpenTrade, { trade: job.trade.toLowerCase() }) : t.detail.seeOpenAll}
              </Link>
            </p>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">{t.detail.about}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{job.description}</p>
          </section>
          {job.requirements && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold tracking-tight">{t.detail.requirements}</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/90">{job.requirements}</p>
            </section>
          )}
          <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
            {fmt(t.detail.disclaimer, { company: job.company.name })}
          </p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {open && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">{fmt(t.detail.applyTo, { company: job.company.name })}</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">{t.detail.applyNote}</p>
              <JobApplyForm slug={job.slug} company={job.company.name} />
            </div>
          )}
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {t.common.lookingForWork}{" "}
            <Link href="/talent/edit" className="font-medium text-teal-700 hover:underline">
              {t.detail.profileLink}
            </Link>{" "}
            {t.detail.profileAfter}
          </p>
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
                  {t.detail.seeCompany}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">{t.detail.hiringOnPmrfp}</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </Container>
  );
}
