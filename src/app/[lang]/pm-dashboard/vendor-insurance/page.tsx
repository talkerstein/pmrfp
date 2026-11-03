import type { Metadata } from "next";
import Link from "@/i18n/link";
import { ArrowRight, FileText } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, DemoBanner } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { VendorCertTracker, type TrackerRow } from "@/components/vendor-certs/tracker";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { loadCertificates, orgCertCountry } from "@/lib/vendor-certs/server";
import { CERT_TYPES_BY_COUNTRY, certStatus, certTypeFor, daysUntil, isoDay, type CertCountry } from "@/lib/vendor-certs/rules";
import { getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").certs.dash.metaTitle };
}

/**
 * /pm-dashboard/vendor-insurance — the Vendor Insurance & WSIB Certificate
 * Tracker. One list per PM company (RLS), status chips worked out here for
 * today, the table and forms in VendorCertTracker. Country-first: the
 * company's country picks the certificate types and the wording.
 */
export default async function VendorInsurancePage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const t = getT("certs").dash;
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const geo = await getAccountGeo(session).catch(() => null);
  const country: CertCountry = geo?.country === "US" || geo?.country === "CA" ? geo.country : orgCertCountry(session.organization);
  const header = <PageHeader title={t.title[country]} description={t.description[country]} />;

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

  const { ready, rows, linked } = await loadCertificates(await createClient(), session.organization.id);
  if (!ready) {
    return (
      <div>
        {header}
        <EmptyState title={t.notReadyTitle} description={t.notReadyBody} />
      </div>
    );
  }

  const today = isoDay(new Date());
  const tracker: TrackerRow[] = rows.map((r) => {
    const org = r.vendor_organization_id ? linked.get(r.vendor_organization_id) : undefined;
    return {
      id: r.id,
      vendorName: r.vendor_name,
      contactEmail: r.contact_email,
      trade: r.trade,
      certType: certTypeFor(r.cert_type, country),
      insurer: r.insurer,
      policyNumber: r.policy_number,
      coverage: r.coverage_amount == null ? null : Number(r.coverage_amount),
      expiresOn: r.expires_on,
      notes: r.notes,
      remindVendor: r.remind_vendor,
      hasFile: Boolean(r.file_path),
      fileName: r.file_name,
      uploadedBy: r.uploaded_by,
      requestSentAt: r.request_sent_at,
      status: certStatus(r.expires_on, today),
      days: r.expires_on ? daysUntil(r.expires_on, today) : null,
      linked: org ? { name: org.name, slug: org.approved ? org.slug : null, profileStatus: (country === "US" ? org.insurance_status : org.wsib_status || org.insurance_status) ?? null } : null,
    };
  });
  const count = (s: TrackerRow["status"]) => tracker.filter((r) => r.status === s).length;
  const lapsed = count("expired");

  return (
    <div>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.stats.total} value={tracker.length} />
        <StatCard label={t.stats.expiring} value={count("expiring")} />
        <StatCard label={t.stats.expired} value={lapsed} />
        <StatCard label={t.stats.missing} value={count("missing")} />
      </div>

      <div className="mt-6">
        <VendorCertTracker rows={tracker} country={country} types={[...CERT_TYPES_BY_COUNTRY[country]]} />
      </div>

      {/* Every tool ends on PMRFP: a lapsed vendor is the moment to post the work. */}
      <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6 ${lapsed ? "border-teal-300 bg-teal-50/60" : "border-border bg-card"}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-500 text-indigo">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{t.replaceTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t.replaceBody}</p>
          </div>
        </div>
        <Link href="/pm-dashboard/rfps/new" className={buttonVariants({ size: "lg" })}>
          {t.replaceCta} <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t.remindersNote}</p>
    </div>
  );
}
