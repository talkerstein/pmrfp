import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "@/i18n/link";
import { BadgeCheck, Clock, Code2, FileText, Globe, Landmark } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { JoinRequestsCard } from "@/components/dashboard/join-requests-card";
import { TownWidgetCode } from "@/components/towns/blocks";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listYourTendersHref } from "@/lib/buyers/source-links";
import { buyerDisplayName } from "@/lib/towns/claimable";
import { loadBuyerDashboard } from "@/lib/towns/dashboard-data";
import { BUYER_PAGE_EDIT_PATH, claimOnboardingHref } from "@/lib/towns/paths";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").towns.meta.dashboard };
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">{icon}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </section>
  );
}

/**
 * The public buyer's home: its page status (verified, under review, not
 * verified), whether the page shows in Google, the website widget's code,
 * whether PMRFP lists its tenders (the permission registry), requests from
 * colleagues to join, and what posting tenders will look like (Part B).
 */
export default async function BuyerDashboardHome({ params, searchParams }: { params: Promise<object>; searchParams?: Promise<{ join?: string }> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("towns").dashboard;
  const session = await requireRole(["public_buyer"]);
  const demo = isDemoMode();
  if (!demo && !session.organization) redirect(localizePath("/onboarding", lang));
  const { own, claim, page, extras } = demo ? { own: null, claim: null, page: null, extras: null } : await loadBuyerDashboard(session);
  const name = own?.buyer_name ?? (page ? buyerDisplayName(page, lang) : claim?.buyer_name ?? session.organization?.name ?? "");
  const status: "verified" | "pending" | "rejected" | "none" = own ? "verified" : claim?.status === "pending" ? "pending" : claim?.status === "rejected" ? "rejected" : "none";
  const permission = extras?.permission ?? null;
  const day = (d: string) => formatDate(`${d.slice(0, 10)}T12:00:00Z`, lang);

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader title={t.title} description={name} />

      {!demo && <JoinRequestsCard session={session} back="/buyer-dashboard" flash={(await searchParams)?.join} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={status === "verified" ? <BadgeCheck className="size-4" /> : <Clock className="size-4" />} title={status === "verified" ? fmt(t.status.verified, { name }) : t.status[status]}>
          <p data-status={status}>
            {status === "verified" ? t.status.verifiedBody : status === "pending" ? fmt(t.status.pendingBody, { name }) : status === "rejected" ? t.status.rejectedBody : t.status.noneBody}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {page && <Link href={page.path} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{t.viewPage}</Link>}
            {status === "verified" && <Link href={BUYER_PAGE_EDIT_PATH} className={cn(buttonVariants({ size: "sm" }))}>{t.editPage}</Link>}
            {status === "none" && <Link href={claimOnboardingHref(null)} className={cn(buttonVariants({ size: "sm" }))}>{t.status.noneBtn}</Link>}
          </div>
        </Card>

        <Card icon={<Globe className="size-4" />} title={extras?.indexable ? t.google.yes : t.google.no}>
          {!extras?.indexable && <p className="text-muted-foreground">{t.google.noBody}</p>}
          {page && <p className="text-xs text-muted-foreground">pmrfp.com{page.path}</p>}
        </Card>

        {page && (
          <Card icon={<Code2 className="size-4" />} title={t.widgetTitle}>
            <TownWidgetCode provinceSlug={page.provinceSlug} slug={page.buyer.slug} lang={lang} title={t.widgetTitle} body={t.widgetBody} />
            <p><Link href={`/widgets?w=town-bids&town=${encodeURIComponent(`${page.provinceSlug}/${page.buyer.slug}`)}`} className="text-teal-700 underline">{t.widgetMore} →</Link></p>
          </Card>
        )}

        <Card icon={<Landmark className="size-4" />} title={t.permissionTitle}>
          {permission?.status === "yes" ? (
            <>
              <p>{fmt(t.permission.yes, { date: permission.grantedOn ? day(permission.grantedOn) : "—" })}</p>
              <p className="text-muted-foreground">{permission.method ? t.permission[permission.method] : t.permission.linkOnly}</p>
            </>
          ) : permission?.status === "no" ? (
            <p>{t.permission.no}</p>
          ) : (
            <>
              <p>{t.permission.none}</p>
              {page && (
                <p>
                  <Link href={listYourTendersHref({ buyerSlug: page.buyer.slug, provinceCode: page.buyer.provinceCode })} className="text-teal-700 underline">{t.permission.noneLink} →</Link>
                </p>
              )}
            </>
          )}
        </Card>

        <Card icon={<FileText className="size-4" />} title={t.postTitle}>
          <p className="text-muted-foreground">{t.postBody}</p>
        </Card>
      </div>
    </div>
  );
}
