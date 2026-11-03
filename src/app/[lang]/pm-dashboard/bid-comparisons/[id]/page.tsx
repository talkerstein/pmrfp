import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/i18n/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileText, Users } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { SheetSummary } from "@/components/bid-compare/sheet-grid";
import { BidsPanel, DetailsEditor, ImportResponses, InviteButton, RecommendationForm, ScopeEditor, SharePanel } from "@/components/bid-compare/workspace";
import { bidderOrgs, loadComparison, myRfps, trackerCerts } from "@/lib/bid-compare/server";
import { buildSheet } from "@/lib/bid-compare/view";
import { MAX_BIDS } from "@/lib/bid-compare/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").bidCompare.dash.metaTitle };
}

const LIST = "/pm-dashboard/bid-comparisons";

/**
 * /pm-dashboard/bid-comparisons/[id] — one comparison: the sheet, the bids,
 * scope items, recommendation, share link and award. Read through the PM's
 * own client (RLS), so another company's id is a 404. Once awarded, the
 * page ends on PMRFP: close the RFP, post the next one, invite the bidders.
 */
export default async function BidComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  await setLangFrom(params);
  const m = getT("bidCompare");
  const t = m.sheet;
  const lang = getLang();
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const { id } = await params;

  if (isDemoMode()) {
    return (
      <div>
        <DemoBanner />
        <PageHeader title={m.dash.title} />
        <EmptyState title={m.dash.notReadyTitle} description={m.dash.demoBody} />
      </div>
    );
  }
  if (!session.organization) {
    return (
      <div>
        <PageHeader title={m.dash.title} />
        <EmptyState title={m.dash.noOrgTitle} description={m.dash.noOrgBody}>
          <Link href="/onboarding" className={buttonVariants()}>{m.dash.noOrgCta}</Link>
        </EmptyState>
      </div>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = await createClient();
  const { ready, comparison: c, bids } = await loadComparison(db, id);
  if (!ready) {
    return (
      <div>
        <PageHeader title={m.dash.title} />
        <EmptyState title={m.dash.notReadyTitle} description={m.dash.notReadyBody} />
      </div>
    );
  }
  if (!c) notFound();

  const [certs, orgs, rfps] = await Promise.all([
    trackerCerts(db, c.organization_id),
    bidderOrgs(db, bids.map((b) => b.bidder_organization_id)),
    myRfps(db, { userId: session.userId, orgId: session.organization.id }),
  ]);
  let rfpTitle = c.rfp_id ? (rfps.find((r) => r.id === c.rfp_id)?.title ?? null) : null;
  if (c.rfp_id && !rfpTitle) {
    const { data } = await db.from("rfp_posts").select("title").eq("id", c.rfp_id).maybeSingle<{ title: string }>();
    rfpTitle = data?.title ?? null;
  }
  const view = buildSheet({ scopeItems: c.scope_items, bids, certs, orgs });
  const country = c.country;
  const awarded = Boolean(c.awarded_at);
  const responsesHref = c.rfp_id ? `/pm-dashboard/rfps/${c.rfp_id}/interests` : null;
  const invitable = view.bids.filter((b) => !b.onPmrfp && b.contactEmail && !b.invitedAt).length;
  const subtitle = [c.building_name, c.building_address, c.trade].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <Link href={LIST} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeft className="size-4" /> {t.back}
        </Link>
        <PageHeader title={c.title} description={subtitle || undefined} />
        <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {c.rfp_id && rfpTitle && responsesHref && (
            <span className="text-muted-foreground">
              {t.linkedRfp}: <span className="font-medium text-foreground">{rfpTitle}</span>{" "}
              <Link href={responsesHref} className="inline-flex items-center gap-1 font-medium text-teal-ink hover:underline">
                {t.viewResponses} <ExternalLink className="size-3" />
              </Link>
            </span>
          )}
        </div>
        <div className="mt-3">
          <DetailsEditor
            comparison={{ id: c.id, title: c.title, building_name: c.building_name, building_address: c.building_address, trade: c.trade, rfp_id: c.rfp_id }}
            rfps={rfps.map((r) => ({ id: r.id, title: r.title }))}
            t={t}
            form={m.newForm}
          />
        </div>
      </div>

      {awarded && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success" data-state="awarded">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-4" /> {fmt(t.award.banner, { company: c.awarded_company ?? "", date: formatDate(c.awarded_at!, lang) })}
          </p>
          <p className="mt-1">
            {c.award_rfp_recorded
              ? fmt(t.award.rfpRecorded, { company: c.awarded_company ?? "" })
              : c.award_notified_at
                ? fmt(t.award.notified, { company: c.awarded_company ?? "" })
                : fmt(t.award.notNotified, { company: c.awarded_company ?? "" })}
          </p>
        </div>
      )}

      <SheetSummary view={view} country={country} lang={lang} t={t} />

      {c.rfp_id && rfpTitle && !awarded && view.bids.length < MAX_BIDS && <ImportResponses comparisonId={c.id} rfpTitle={rfpTitle} t={t} />}

      <ScopeEditor key={JSON.stringify(view.items)} comparisonId={c.id} items={view.items} t={t} locked={false} />

      <BidsPanel comparisonId={c.id} country={country} t={t} view={view} recommendedId={c.recommended_bid_id} awardedId={c.awarded_bid_id} rfpLinked={Boolean(c.rfp_id)} />

      {view.bids.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <RecommendationForm
            key={`${c.recommended_bid_id ?? ""}:${c.updated_at}`}
            comparisonId={c.id}
            bids={view.bids.map((b) => ({ id: b.id, company: b.company }))}
            recommendedId={c.recommended_bid_id}
            recommendation={c.recommendation}
            t={t}
          />
          <SharePanel comparisonId={c.id} shareCreatedAt={c.share_created_at} boardHref={`/bid-sheet/${c.id}`} t={t} />
        </div>
      )}

      {awarded && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t.next.title}</h2>
          {c.rfp_id && !c.award_rfp_recorded && responsesHref && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <span>{t.next.closeRfp}</span>
              <Link href={responsesHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
                {t.next.closeRfpCta} <ArrowRight className="size-3.5" />
              </Link>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-teal-500 text-indigo">
                  <FileText className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">{t.next.postTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t.next.postBody}</p>
                </div>
              </div>
              <Link href="/pm-dashboard/rfps/new" className={`${buttonVariants({ size: "lg" })} self-start`}>
                {t.next.postCta} <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-indigo text-white">
                  <Users className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">{t.next.inviteTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t.next.inviteBody}</p>
                </div>
              </div>
              <div className="self-start">
                <InviteButton comparisonId={c.id} t={t} eligible={invitable} />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
