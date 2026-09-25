import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HardHat, Users } from "lucide-react";
import { Container } from "@/components/container";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/public/empty-state";
import { JobCard } from "@/components/jobs/job-card";
import { listOpenJobs } from "@/lib/jobs/data";
import { EMPLOYMENT_LABEL, EMPLOYMENT_TYPES, FREE_JOB_LIMIT } from "@/lib/jobs/rules";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { gcFormPath } from "@/lib/gc/packages";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Construction & Trade Jobs in Canada and the U.S.",
  description:
    "Jobs with general contractors, trade companies and property managers: electricians, plumbers, HVAC techs, labourers, apprentices and more. Apply in a minute, no account needed.",
  alternates: { canonical: "/jobs" },
};

const SELECT =
  "h-10 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; region?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const [{ ready, jobs }, trades, regions] = await Promise.all([
    listOpenJobs({ trade: sp.trade, region: sp.region, type: sp.type }),
    getCategories(),
    getRegions(),
  ]);
  const filtered = Boolean(sp.trade || sp.region || sp.type);

  return (
    <>
      <section className="grid-tex relative overflow-hidden bg-indigo text-white [--grid-color:rgba(145,242,207,0.06)]">
        <Container className="relative py-14 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-teal-300">PMRFP Jobs</p>
          <h1 className="mt-3 max-w-3xl text-balance text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            Trade and construction jobs with companies that are winning work.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-indigo-100/80">
            General contractors, trade companies and property managers hiring electricians, plumbers, HVAC techs,
            labourers, apprentices and more. Apply in a minute, no account needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#jobs" className={cn(buttonVariants({ size: "lg", variant: "accent" }), "active:scale-[0.98]")}>
              See open jobs <ArrowRight className="size-4" />
            </a>
            <Link
              href="/jobs/post"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white active:scale-[0.98]",
              )}
            >
              Hiring? Post a job free
            </Link>
          </div>
        </Container>
      </section>

      <Container className="grid gap-10 py-12 lg:grid-cols-[1fr_320px]" >
        <div id="jobs">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Trade
              <select name="trade" defaultValue={sp.trade ?? ""} className={SELECT}>
                <option value="">All trades</option>
                {trades.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Region
              <select name="region" defaultValue={sp.region ?? ""} className={SELECT}>
                <option value="">Anywhere</option>
                {regions.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Type
              <select name="type" defaultValue={sp.type ?? ""} className={SELECT}>
                <option value="">Any type</option>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonVariants()}>
              Show jobs
            </button>
            {filtered && (
              <Link href="/jobs" className="pb-2 text-sm font-medium text-teal-700 hover:underline">
                Clear
              </Link>
            )}
          </form>

          <div className="mt-8">
            {!ready ? (
              <EmptyState title="Jobs are switching on" description="Check back in a few minutes." />
            ) : jobs.length === 0 ? (
              <EmptyState
                title={filtered ? "No open jobs match that yet" : "No open jobs yet"}
                description={
                  filtered
                    ? "Try another trade or region, or clear the filters. New jobs are posted every week."
                    : "Companies on PMRFP are starting to post jobs. Hiring? Yours can be the first one people see."
                }
              >
                <Link href="/jobs/post" className={buttonVariants()}>
                  Post a job free
                </Link>
              </EmptyState>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  {jobs.length} open {jobs.length === 1 ? "job" : "jobs"}
                </p>
                <ul className="space-y-3">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <JobCard job={j} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="size-4 text-teal-700" /> Hiring?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Post a job free and applications come straight to your inbox. Up to {FREE_JOB_LIMIT} open jobs at a time;
              Trade Pro members post unlimited jobs, shown first.
            </p>
            <Link href="/jobs/post" className={cn(buttonVariants(), "mt-4 w-full")}>
              Post a job
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <HardHat className="size-4 text-teal-700" /> General contractor?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Hiring a subcontractor for a job you won, not an employee? Post a sub-trade package and local trades
              send you quotes.
            </p>
            <Link href={gcFormPath()} className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}>
              Post a sub-trade package
            </Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
