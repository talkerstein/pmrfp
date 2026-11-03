import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, FileText } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { RenewalCalendar, type CalendarRfp, type CalendarRow } from "@/components/contracts/renewal-calendar";
import { getCategories } from "@/lib/data/taxonomy";
import { loadContracts, ownRfps, pmCountry } from "@/lib/contracts/server";
import { availableStarters, contractStatus, currentTerm, isoDay, nextTerm, timelineRange, windowOpens } from "@/lib/contracts/rules";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").contracts.dash.metaTitle };
}

/**
 * /pm-dashboard/contracts — the Contract Renewal Calendar. One list per PM
 * company (RLS); each contract's current term, status chip and renewal
 * window worked out here for today; the list, timeline and forms in
 * RenewalCalendar. Country-first: the company's country picks the
 * currency and the "re-tender" / "rebid" wording.
 */
export default async function ContractsPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("contracts").dash;
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const header = <PageHeader title={t.title} description={t.description} />;

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
  const [loaded, country, categories, rfpList] = await Promise.all([
    loadContracts(db, session.organization.id),
    pmCountry(session),
    getCategories().catch(() => []),
    ownRfps(db, session),
  ]);
  if (!loaded.ready) {
    return (
      <div>
        {header}
        <EmptyState title={t.notReadyTitle} description={t.notReadyBody} />
      </div>
    );
  }

  const today = isoDay(new Date());
  const tradeNames = new Map(categories.map((c) => [c.slug, tradeName(c.name, lang)]));
  const rfp = (id: string | null): CalendarRfp | null => {
    const r = id ? loaded.rfps.get(id) : undefined;
    return r ? { id: r.id, title: r.title, status: r.status } : null;
  };

  const rows: CalendarRow[] = loaded.rows.map((r) => {
    const term = currentTerm(r, today);
    const st = contractStatus(r, today);
    const vendor = r.vendor_organization_id ? loaded.vendors.get(r.vendor_organization_id) : undefined;
    const trade = r.trade_slug ? tradeNames.get(r.trade_slug) ?? null : null;
    return {
      id: r.id,
      building: r.building_name,
      address: r.building_address,
      tradeSlug: r.trade_slug,
      service: trade ?? r.service_detail ?? "—",
      detail: r.service_detail,
      vendorName: r.vendor_name,
      vendorEmail: r.vendor_email,
      linked: vendor ? { name: vendor.name, slug: vendor.slug } : null,
      startDate: r.start_date,
      endDate: r.end_date,
      termStart: term.start,
      termEnd: term.end,
      rolled: Boolean(term.end && r.end_date && term.end !== r.end_date),
      annualValue: r.annual_value == null ? null : Number(r.annual_value),
      currency: r.currency,
      noticeDays: r.notice_days,
      autoRenews: r.auto_renews,
      notes: r.notes,
      sourceRfp: rfp(r.source_rfp_id),
      retenderRfp: rfp(r.retender_rfp_id),
      hasFile: Boolean(r.file_path),
      fileName: r.file_name,
      status: st.status,
      days: st.days,
      windowOpens: term.end ? windowOpens(term.end, r.notice_days) : null,
      nextTerm: nextTerm({ start_date: term.start, end_date: term.end }),
    };
  });
  // Soonest end first; contracts still needing dates last.
  rows.sort((a, b) => (a.termEnd ?? "9999").localeCompare(b.termEnd ?? "9999"));

  const count = (s: CalendarRow["status"]) => rows.filter((r) => r.status === s).length;
  const urgent = count("window") + count("ending") + count("expired");
  const starters = availableStarters(categories, loaded.rows.map((r) => r.starter_key)).map((s) => s.key);
  const rfps: CalendarRfp[] = rfpList.map((r) => ({ id: r.id, title: r.title, status: r.status }));

  return (
    <div>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.stats.total} value={rows.length} />
        <StatCard label={t.stats.window} value={count("window")} />
        <StatCard label={t.stats.ending} value={count("ending")} />
        <StatCard label={t.stats.expired} value={count("expired")} />
      </div>

      <div className="mt-6">
        <RenewalCalendar
          rows={rows}
          country={country}
          trades={categories.map((c) => ({ slug: c.slug, name: tradeNames.get(c.slug) ?? c.name }))}
          rfps={rfps}
          starters={starters}
          timeline={timelineRange(today)}
          today={today}
        />
      </div>

      {/* Every tool ends on PMRFP: a contract coming up for renewal is the moment to post the work. */}
      <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6 ${urgent ? "border-teal-300 bg-teal-50/60" : "border-border bg-card"}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-500 text-indigo">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t.endTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.endBody}</p>
          </div>
        </div>
        <Link href="/pm-dashboard/rfps/new" className={buttonVariants({ size: "lg" })}>
          {t.endCta} <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t.remindersNote}</p>
    </div>
  );
}
