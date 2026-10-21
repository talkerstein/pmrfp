import Link from "@/i18n/link";
import { FileText } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TownJobSummary } from "@/lib/town-jobs/server";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";

/**
 * The buyer dashboard's "Quote requests and tenders" card: the latest posts
 * with their status and what's waiting, and the two ways to post.
 */
export function TownPostsCard({ jobs }: { jobs: readonly TownJobSummary[] }) {
  const t = getT("townJobs").home;
  const lang = getLang();
  const day = (d: string | null) => (d ? formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang) : "—");
  return (
    <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2" data-card="town-posts">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground"><FileText className="size-4" /></span>
        {t.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
      {jobs.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {jobs.slice(0, 4).map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/buyer-dashboard/jobs/${j.id}`} className="font-medium hover:text-teal-700">{j.title}</Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={j.status} />
                {day(j.deadline)}
                {j.post_kind !== "tender_mirror" && <span>· {fmt(t.responses, { n: j.responses })}</span>}
                {j.questionsWaiting > 0 && <b className="text-amber-700">· {fmt(t.waiting, { n: j.questionsWaiting })}</b>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/buyer-dashboard/jobs/new?kind=quote_request" className={cn(buttonVariants({ size: "sm" }))}>{t.ctaQuote}</Link>
        <Link href="/buyer-dashboard/jobs/new?kind=tender_mirror" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>{t.ctaMirror}</Link>
        <Link href="/rfp-writer?for=town" className="text-sm text-teal-700 underline">{t.writer}</Link>
        {jobs.length > 0 && <Link href="/buyer-dashboard/jobs" className="ml-auto text-sm text-teal-700 underline">{fmt(t.seeAll, { n: jobs.length })} →</Link>}
      </div>
    </section>
  );
}
