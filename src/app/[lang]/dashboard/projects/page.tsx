import type { Metadata } from "next";
import Link from "@/i18n/link";
import { redirect } from "next/navigation";
import { Camera, CheckCircle2, Clock, FileText, ImageIcon, Sparkles } from "lucide-react";
import { isDemoMode, requireRole } from "@/lib/access/access";
import { listMyInvites, listMyProjects, projectsReady, type MyInvite } from "@/lib/projects/server";
import { listShareLinks, portfolioReady } from "@/lib/projects/manage";
import { canAddProject, FREE_PHOTO_LIMIT, FREE_PROJECT_LIMIT, PAID_PHOTO_LIMIT } from "@/lib/projects/limits";
import { opensBySlug } from "@/lib/projects/visibility";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ReviewRequestForm } from "@/components/projects/review-request-form";
import { CopyButton, ShareLinks, VisibilityControl } from "@/components/projects/portfolio-controls";
import { SITE } from "@/lib/site";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { fmt, formatDate } from "@/i18n/format";
import { getDictionary, type Messages } from "@/i18n/dictionaries";
import { hasLocale, localizePath, type Locale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.projects };
}

type Strings = Messages["dash"]["projects"];

/**
 * The company's projects (photo captures and typed case studies alike):
 * who can see each one, how far its case study is, private links for bids,
 * and "Ask for a review" on each published one. Review requests and private
 * projects are Trade Pro; free plans see the upgrade link instead.
 */
export default async function ProjectsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ published?: string; submitted?: string; saved?: string; state?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("dash").projects;
  const p = getT("portfolio").dash;
  const pc = getT("portfolioClient");
  const session = await requireRole(["trade", "supplier"]);
  const org = session.organization;
  if (!org) redirect(localizePath("/onboarding", lang));
  const demo = isDemoMode();
  const paid = session.hasTradeAccess;
  const { published, submitted, saved, state } = await searchParams;
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || SITE.url).replace(/\/$/, "");

  const [projects, invites, ready, portfolio, links] = demo
    ? ([[], [], false, false, []] as const)
    : await Promise.all([listMyProjects(org.id), listMyInvites(org.id), projectsReady(), portfolioReady(), listShareLinks(org.id)]);

  const activeCount = projects.filter((x) => x.status !== "rejected" && x.status !== "archived").length;
  const canAdd = canAddProject(paid, activeCount);
  const invitesFor = (id: string) => invites.filter((i) => i.caseStudyId === id);
  const linksFor = (id: string) => links.filter((l) => l.caseStudyId === id && !l.revokedAt);
  const anyPublished = projects.some((x) => x.status === "published");

  return (
    <>
      {demo && <DemoBanner />}
      <PageHeader
        title={t.title}
        description={t.description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {anyPublished && (
              <Link href="/dashboard/projects/capability-sheet" className={buttonVariants({ variant: "outline", size: "lg" })}>
                <FileText /> {p.sheet}
              </Link>
            )}
            {ready && canAdd && (
              <Link href="/dashboard/projects/new" className={buttonVariants({ size: "lg" })}>
                <Camera /> {t.add}
              </Link>
            )}
          </div>
        }
      />

      {published && (
        <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm">
          <span className="flex items-center gap-2 font-medium text-teal-ink">
            <CheckCircle2 className="size-4" /> {t.live}
          </span>
          <Link href={`/case-studies/${encodeURIComponent(published)}`} className="font-medium text-teal-ink underline">
            {t.seeIt}
          </Link>
        </div>
      )}
      {submitted && (
        <div role="status" className="mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="size-4" /> {t.sent}
        </div>
      )}
      {saved && (
        <div
          role="status"
          className={
            state === "live"
              ? "mb-6 flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 p-4 text-sm font-medium text-teal-ink"
              : "mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          }
        >
          {state === "live" ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
          {state === "live" ? p.savedLive : p.savedReview}
        </div>
      )}

      {!ready && !demo && (
        <p className="mb-6 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t.notReady}{" "}
          <Link href="/dashboard/case-studies/new" className="font-medium text-teal-ink hover:underline">
            {t.notReadyLink}
          </Link>
          .
        </p>
      )}

      {/* What projects are for: shown above the list so the payoff is the first thing read. */}
      <section aria-labelledby="payoff-h" className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 id="payoff-h" className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-teal-600" /> {p.payoffTitle}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {p.payoff.map((x) => (
            <li key={x.h} className="text-sm">
              <span className="font-semibold">{x.h}</span>
              <span className="mt-0.5 block text-muted-foreground">{x.p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {paid
            ? fmt(p.planPro, { photos: PAID_PHOTO_LIMIT })
            : fmt(p.planFree, { limit: FREE_PROJECT_LIMIT, photos: FREE_PHOTO_LIMIT })}{" "}
          {!paid && (
            <Link href="/pricing" className="font-medium text-teal-ink hover:underline">
              {p.upgrade}
            </Link>
          )}
        </p>
      </section>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <Camera className="mx-auto size-8 text-teal-600" />
          <h2 className="mt-3 text-lg font-semibold">{t.emptyTitle}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t.emptyBody}</p>
          {ready && (
            <Link href="/dashboard/projects/new" className={buttonVariants({ size: "lg", className: "mt-5" })}>
              {t.addFirst}
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {projects.map((x) => {
            const live = x.status === "published";
            const editable = x.status !== "archived";
            const url = `${siteBase}${localizePath(`/case-studies/${x.slug}`, lang)}`;
            return (
              <li key={x.id} id={`p-${x.id}`} className="scroll-mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-secondary sm:size-24">
                    {x.heroUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dashboard thumbnail
                      <img src={x.heroUrl} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <ImageIcon className="absolute inset-0 m-auto size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={x.status} />
                      {portfolio && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {pc.visibility[x.visibility]}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(x.createdAt, lang)}</span>
                    </div>
                    <h2 className="mt-1 font-semibold leading-snug">{x.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {[x.city, x.province].filter(Boolean).join(", ")}
                      {live && opensBySlug(x.visibility) && (
                        <>
                          {x.city || x.province ? " · " : ""}
                          <Link href={`/case-studies/${x.slug}`} className="font-medium text-teal-ink hover:underline">
                            {t.view}
                          </Link>
                        </>
                      )}
                    </p>
                    {x.status === "pending_review" && <p className="mt-2 text-xs text-muted-foreground">{t.checking}</p>}
                    {x.status === "rejected" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.rejected} <Link href="/contact" className="text-teal-ink hover:underline">{t.askWhy}</Link>.
                      </p>
                    )}
                    {portfolio && editable && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2" aria-label={fmt(pc.builder.progress, { done: x.progress.done, total: x.progress.total })}>
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                            <span
                              className="block h-full rounded-full bg-teal-500"
                              style={{ width: `${Math.round((x.progress.done / x.progress.total) * 100)}%` }}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {x.progress.complete ? p.complete : fmt(pc.builder.progress, { done: x.progress.done, total: x.progress.total })}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/projects/${x.id}/case-study`}
                          className={buttonVariants({ size: "sm", variant: x.progress.complete ? "outline" : "default" })}
                        >
                          {x.progress.complete ? p.edit : x.progress.done > 0 ? p.continue : p.build}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {portfolio && editable && (
                  <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <div>
                      <VisibilityControl id={x.id} value={x.visibility} paid={paid} />
                      {live && x.visibility === "unlisted" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{p.unlistedLink}</span>
                          <CopyButton text={url} label={pc.share.copy} done={pc.share.copied} />
                        </div>
                      )}
                    </div>
                    <ShareLinks
                      caseStudyId={x.id}
                      links={linksFor(x.id).map((l) => ({
                        id: l.id,
                        token: l.token,
                        label: l.label,
                        createdAt: l.createdAt,
                        lastViewedAt: l.lastViewedAt,
                        viewCount: l.viewCount,
                      }))}
                      paid={paid}
                      published={live}
                      siteBase={siteBase}
                    />
                  </div>
                )}

                {live && ready && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h3 className="text-sm font-semibold">{t.askReview}</h3>
                    {paid ? (
                      <>
                        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{t.askReviewHint}</p>
                        <ReviewRequestForm caseStudyId={x.id} />
                        <InviteList invites={invitesFor(x.id)} t={t} lang={lang} />
                      </>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.reviewsUpsell}{" "}
                        <Link href="/pricing" className="font-medium text-teal-ink hover:underline">
                          {t.reviewsUpsellLink}
                        </Link>{" "}
                        {t.reviewsUpsellAfter}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {anyPublished && (
        <p className="mt-6 text-sm text-muted-foreground">
          {t.sheetBefore}{" "}
          <Link href="/dashboard/projects/capability-sheet" className="font-medium text-teal-ink hover:underline">
            {t.sheetLink}
          </Link>{" "}
          {t.sheetAfter}
        </p>
      )}

      {ready && !canAdd && (
        <p className="mt-6 text-sm text-muted-foreground">
          {t.freeLimit}{" "}
          <Link href="/pricing" className="font-medium text-teal-ink hover:underline">Trade Pro</Link> {t.freeLimitAfter}
        </p>
      )}
    </>
  );
}

function InviteList({ invites, t, lang }: { invites: MyInvite[]; t: Strings; lang: Locale }) {
  if (invites.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
      {invites.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-foreground">{i.clientName}</span>
          <span>{i.clientEmail}</span>
          <span>·</span>
          {i.usedAt ? (
            <span className="text-teal-ink">{fmt(t.reviewed, { date: formatDate(i.usedAt, lang) })}</span>
          ) : (
            <span>{fmt(t.asked, { date: formatDate(i.createdAt, lang) })}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
