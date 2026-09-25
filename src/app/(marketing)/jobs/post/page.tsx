import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { Container } from "@/components/container";
import { JobPostForm } from "@/components/jobs/job-forms";
import { getSession } from "@/lib/access/access";
import { getCategories, getRegions } from "@/lib/data/taxonomy";
import { FREE_JOB_LIMIT, JOB_DAYS } from "@/lib/jobs/rules";
import { gcFormPath } from "@/lib/gc/packages";

export const metadata: Metadata = {
  title: "Post a job",
  robots: { index: false, follow: false },
};

export default async function PostJobPage() {
  const session = await getSession();
  // Cold visitors sign up first (as a GC/PM by default: the usual employer
  // who isn't already a trade member) and land back here.
  if (!session) redirect(`/sign-up?role=property_manager&next=${encodeURIComponent("/jobs/post")}`);
  if (!session.organization) redirect(`/onboarding?next=${encodeURIComponent("/jobs/post")}`);
  const [trades, regions] = await Promise.all([getCategories(), getRegions()]);
  const approved = session.organization.profile_status === "approved";

  return (
    <Container size="narrow" className="py-10">
      <Link href="/jobs/manage" className="text-sm text-muted-foreground hover:text-foreground">
        ← Your jobs
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Post a job</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Hiring for {session.organization.name}. Your job is public for {JOB_DAYS} days, and each application is emailed
        to you. Free accounts can have {FREE_JOB_LIMIT} open jobs at a time;{" "}
        {session.hasTradeAccess
          ? "as a Trade Pro member you can post unlimited jobs, shown first."
          : "Trade Pro members post unlimited jobs, shown first."}
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4 text-sm">
        <HardHat className="mt-0.5 size-4 shrink-0 text-teal-700" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Hiring a subcontractor, not an employee?</strong> Post a sub-trade package
          instead, and local trades send you quotes.{" "}
          <Link href={gcFormPath()} className="font-medium text-teal-700 hover:underline">
            Post a package
          </Link>
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 sm:p-8">
        {approved ? (
          <JobPostForm trades={trades} regions={regions} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Your company profile is waiting for approval. Once it&apos;s approved you can post jobs here.{" "}
            <Link href="/contact" className="font-medium text-teal-700 hover:underline">
              Contact us
            </Link>{" "}
            if it&apos;s taking a while.
          </p>
        )}
      </div>
    </Container>
  );
}
