import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isServiceConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { townJobsFor, type TownJobSummary } from "@/lib/town-jobs/server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").townJobs.list.title };
}

/**
 * A town's posts on PMRFP: each with its status, closing date, responses,
 * questions waiting, addenda and invitations, and a link to manage it. Read
 * with the service role after the session check (the organization's own posts).
 */
export default async function TownJobsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("townJobs").list;
  const session = await requireRole(["public_buyer"]);
  const demo = isDemoMode();
  if (!demo && !session.organization) redirect(localizePath("/onboarding", lang));
  const jobs: TownJobSummary[] = !demo && session.organization && isServiceConfigured() ? await townJobsFor(createServiceClient(), session.organization.id) : [];
  const day = (d: string | null) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");

  const ctas = (
    <div className="flex flex-wrap gap-2">
      <Link href="/buyer-dashboard/jobs/new?kind=quote_request" className={cn(buttonVariants({ size: "sm" }))}>{t.ctaQuote}</Link>
      <Link href="/buyer-dashboard/jobs/new?kind=tender_mirror" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>{t.ctaMirror}</Link>
    </div>
  );

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader title={t.title} description={t.description} action={ctas} />
      {jobs.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody}>{ctas}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm" data-list="town-jobs">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t.columns.job}</th>
                <th className="px-3 py-3 font-semibold">{t.columns.status}</th>
                <th className="px-3 py-3 font-semibold">{t.columns.closes}</th>
                <th className="px-3 py-3 text-right font-semibold">{t.columns.responses}</th>
                <th className="px-3 py-3 text-right font-semibold">{t.columns.questions}</th>
                <th className="px-3 py-3 text-right font-semibold">{t.columns.addenda}</th>
                <th className="px-3 py-3 text-right font-semibold">{t.columns.invites}</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0" data-kind={j.post_kind ?? ""}>
                  <td className="px-4 py-3">
                    <Link href={`/buyer-dashboard/jobs/${j.id}`} className="font-medium hover:text-teal-700">{j.title}</Link>
                    <div className="text-xs text-muted-foreground">
                      {j.post_kind === "tender_mirror" ? t.kind.tender_mirror : t.kind.quote_request}
                      {j.sealedBox && !j.sealedBox.opened ? <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground" data-sealed="yes">{getT("townResults").list.sealed}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-3 py-3 text-muted-foreground">{day(j.deadline)}</td>
                  <td className="px-3 py-3 text-right">{j.post_kind === "tender_mirror" ? <span className="text-xs text-muted-foreground">{t.official}</span> : j.responses}</td>
                  <td className={cn("px-3 py-3 text-right", j.questionsWaiting > 0 && "font-semibold text-amber-700")}>{j.questionsWaiting}</td>
                  <td className="px-3 py-3 text-right">{j.addenda}</td>
                  <td className="px-3 py-3 text-right">{j.invites}</td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/buyer-dashboard/jobs/${j.id}`} className="text-sm font-medium text-teal-700 hover:underline">{t.manage}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
