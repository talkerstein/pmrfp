import type { Metadata } from "next";
import Link from "@/i18n/link";
import { FileText, ListChecks } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { NewReport } from "@/components/report-quotes/new-report";
import { ForwardingCard } from "@/components/report-quotes/forwarding-card";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { inboundConfig } from "@/lib/report-quotes/inbound";
import { getOrCreateInbox, loadInboundLog, type Inbox, type InboundLogRow } from "@/lib/report-quotes/inbound-server";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { accountGeo } from "@/lib/visitor-geo";
import { DAILY_UPLOAD_LIMIT, isPastRetention, uploadsLeft } from "@/lib/report-quotes/rules";
import { countRecentUploads, loadReports, orgCountry } from "@/lib/report-quotes/server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate, plural } from "@/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").reportQuotes.dash.metaTitle };
}

/**
 * /pm-dashboard/report-to-quotes — upload an inspection / condition report
 * (or type a list), and every report the company has started. Realtors,
 * landlords and property managers; reports belong to the organization.
 */
export default async function ReportQuotesPage({ params }: { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const r = getT("reportQuotes");
  const t = r.dash;
  const session = await requireRole(["property_manager", "real_estate_agent"]);

  const header = (
    <PageHeader
      title={t.title}
      description={t.description}
      action={
        <Link href="/inspection-report-to-quotes" className="text-sm font-medium text-teal-700 hover:underline">
          {t.howItWorks}
        </Link>
      }
    />
  );

  if (isDemoMode()) {
    return (
      <div>
        {header}
        <EmptyState title={t.title} description={t.demoBody} />
      </div>
    );
  }
  const org = session.organization;
  if (!org) {
    return (
      <div>
        {header}
        <EmptyState title={t.noOrgTitle} description={t.noOrgBody}>
          <Link href="/onboarding" className={buttonVariants()}>
            {t.noOrgCta}
          </Link>
        </EmptyState>
      </div>
    );
  }

  const db = await createClient();
  const [{ ready, rows }, used] = await Promise.all([loadReports(db, org.id), countRecentUploads(db, org.id)]);
  if (!ready) {
    return (
      <div>
        {header}
        <EmptyState title={t.notReadyTitle} description={t.notReadyBody} />
      </div>
    );
  }

  const country = orgCountry(org);
  const regions = country === "US" ? US_STATE_NAMES : [...CA_PROVINCES];
  const home = accountGeo(org)?.province ?? "";
  const left = uploadsLeft(used);
  const u = r.upload;
  const ib = r.inbound;
  // Forwarding by email: shown only when INBOUND_EMAIL_DOMAIN / INBOUND_EMAIL_SECRET are set.
  const inboundCfg = inboundConfig();
  const [inbox, inboundLog]: [Inbox | null, InboundLogRow[]] =
    inboundCfg && isServiceConfigured()
      ? await Promise.all([getOrCreateInbox(createServiceClient(), inboundCfg, org.id, session.userId), loadInboundLog(db, session.userId)])
      : [null, []];

  return (
    <div className="space-y-8">
      {header}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{t.newTitle}</h2>
          <span className="text-xs text-muted-foreground">{fmt(t.capLeft, { n: left, limit: DAILY_UPLOAD_LIMIT })}</span>
        </div>
        <NewReport
          s={{
            fileLabel: u.fileLabel,
            fileHint: u.fileHint,
            typeLabel: u.typeLabel,
            cityLabel: u.cityLabel,
            regionLabel: u.regionLabel[country],
            regionPlaceholder: u.regionPlaceholder,
            areaHint: u.areaHint,
            submit: u.submit,
            uploading: u.uploading,
            reading: u.reading,
            privacy: u.privacy,
            capReached: u.capReached,
            manualTitle: u.manualTitle,
            manualBody: u.manualBody,
            manualNameLabel: u.manualNameLabel,
            manualNameDefault: u.manualNameDefault,
            manualCta: u.manualCta,
            errors: u.errors,
            reportTypes: r.reportTypes,
          }}
          regions={regions}
          country={country}
          uploadsLeft={left}
          limit={DAILY_UPLOAD_LIMIT}
          defaultRegion={regions.includes(home) ? home : ""}
        />
        <p className="mt-3 text-xs text-muted-foreground">{t.disclaimer}</p>
      </section>

      {inbox && (
        <ForwardingCard
          address={inbox.address}
          s={{
            title: ib.title,
            body: ib.body,
            addressLabel: ib.addressLabel,
            copy: ib.copy,
            copied: ib.copied,
            steps: ib.steps.map((step) => fmt(step, { limit: DAILY_UPLOAD_LIMIT })),
            private: ib.private,
            rotate: ib.rotate,
            rotateNote: ib.rotateNote,
            rotated: ib.rotated,
            errors: ib.errors,
          }}
        >
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">{ib.logTitle}</h3>
            {inboundLog.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{ib.logEmpty}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {inboundLog.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                    <span className="min-w-0 truncate">{[row.subject, row.from_address].filter(Boolean).join(" · ") || "—"}</span>
                    <span className={`text-xs ${row.outcome === "created" ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {row.outcome === "created" ? plural(row.report_ids.length, ib.outcome.created) : ib.outcome[row.outcome]} · {formatDate(row.received_at, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ForwardingCard>
      )}

      <section>
        <h2 className="text-lg font-semibold">{t.listTitle}</h2>
        {rows.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
            {rows.map((row) => {
              const status =
                row.extraction_status === "running"
                  ? t.status.reading
                  : row.reviewed_at
                    ? t.status.reviewed
                    : row.source === "manual"
                      ? t.status.manual
                      : row.extraction_status === "failed" || row.extraction_status === "unavailable"
                        ? t.status.failed
                        : t.status.draft;
              const file =
                row.source !== "upload"
                  ? null
                  : row.file_path && !isPastRetention(row.report_deleted_after)
                    ? fmt(t.fileUntil, { date: formatDate(row.report_deleted_after, lang) })
                    : t.fileGone;
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {row.source === "upload" ? <FileText className="size-4 shrink-0 text-muted-foreground" /> : <ListChecks className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{row.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[r.reportTypes[row.report_type], [row.city, row.region].filter(Boolean).join(", "), formatDate(row.created_at, lang), plural(row.itemCount, t.items), status, file]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Link href={`/pm-dashboard/report-to-quotes/${row.id}/summary`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      {r.summary.rowLink}
                    </Link>
                    <Link href={`/pm-dashboard/report-to-quotes/${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {t.open}
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
