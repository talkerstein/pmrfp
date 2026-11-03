import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, FileText } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { NewComparisonForm } from "@/components/bid-compare/workspace";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { companyCountry, listComparisons, myRfps } from "@/lib/bid-compare/server";
import type { BidCountry } from "@/lib/bid-compare/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").bidCompare.dash.metaTitle };
}

/**
 * /pm-dashboard/bid-comparisons — the PM company's bid comparisons (RLS)
 * and the form to start one. ?rfp=<id> (the "Compare bids" button on an
 * RFP's responses page) preselects that RFP and pulls in its responses.
 */
export default async function BidComparisonsPage({ params, searchParams }: { params: Promise<object>; searchParams: Promise<{ rfp?: string }> }) {
  await setLangFrom(params);
  const m = getT("bidCompare");
  const t = m.dash;
  const lang = getLang();
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const geo = await getAccountGeo(session).catch(() => null);
  const country: BidCountry = geo?.country === "US" || geo?.country === "CA" ? geo.country : companyCountry(session.organization);
  const header = <PageHeader title={t.title} description={t.description[country]} />;

  if (isDemoMode()) {
    return (
      <div>
        <DemoBanner />
        {header}
        <EmptyState title={t.notReadyTitle} description={t.demoBody} />
      </div>
    );
  }
  if (!session.organization) {
    return (
      <div>
        {header}
        <EmptyState title={t.noOrgTitle} description={t.noOrgBody}>
          <Link href="/onboarding" className={buttonVariants()}>{t.noOrgCta}</Link>
        </EmptyState>
      </div>
    );
  }

  const db = await createClient();
  const [{ ready, rows }, rfps, { rfp }] = await Promise.all([
    listComparisons(db, session.organization.id),
    myRfps(db, { userId: session.userId, orgId: session.organization.id }),
    searchParams,
  ]);
  if (!ready) {
    return (
      <div>
        {header}
        <EmptyState title={t.notReadyTitle} description={t.notReadyBody} />
      </div>
    );
  }
  const defaultRfp = rfp && rfps.some((r) => r.id === rfp) ? rfp : null;

  return (
    <div>
      {header}

      <h2 className="mb-3 text-base font-semibold">{t.newTitle}</h2>
      <NewComparisonForm t={m.newForm} errors={m.sheet.errors} rfps={rfps.map((r) => ({ id: r.id, title: r.title }))} defaultRfp={defaultRfp} />

      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyBody} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">{t.cols.title}</th>
                  <th className="px-4 py-2.5">{t.cols.building}</th>
                  <th className="px-4 py-2.5">{t.cols.bids}</th>
                  <th className="px-4 py-2.5">{t.cols.status}</th>
                  <th className="px-4 py-2.5">{t.cols.updated}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <Link href={`/pm-dashboard/bid-comparisons/${r.id}`} className="font-medium hover:text-teal-700">
                        {r.title}
                      </Link>
                      {r.trade && <div className="text-xs text-muted-foreground">{r.trade}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.building_name ?? "—"}</td>
                    <td className="px-4 py-3">{r.bids}</td>
                    <td className="px-4 py-3">
                      {r.awarded_at ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          {t.status.awarded}
                          {r.awarded_company ? ` · ${r.awarded_company}` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{t.status.draft}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.updated_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Every tool ends on PMRFP: still collecting quotes means post the job. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-500 text-indigo">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t.nextTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.nextBody}</p>
          </div>
        </div>
        <Link href="/pm-dashboard/rfps/new" className={buttonVariants({ size: "lg" })}>
          {t.nextCta} <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
