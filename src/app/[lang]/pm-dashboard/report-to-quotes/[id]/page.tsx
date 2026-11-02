import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { ReviewEditor, type EditorItem, type SendSummary, type TrustedOption } from "@/components/report-quotes/review-editor";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data/taxonomy";
import { getMyTrustedList } from "@/lib/trusted/data";
import { CA_PROVINCES, US_STATE_NAMES } from "@/lib/geo";
import { isPastRetention, isStaleRun } from "@/lib/report-quotes/rules";
import { loadReport } from "@/lib/report-quotes/server";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, localizePath } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").reportQuotes.dash.metaTitle };
}

const DASH = "/pm-dashboard/report-to-quotes";

/**
 * /pm-dashboard/report-to-quotes/[id] — the review screen for one report.
 * Read through the user's own client: another company's report is a 404.
 */
export default async function ReportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ read?: string }>;
}) {
  await setLangFrom(params);
  const lang = getLang();
  const r = getT("reportQuotes");
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  if (isDemoMode() || !session.organization) redirect(localizePath(DASH, lang));
  const [{ id }, { read }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();

  const db = await createClient();
  const isRealtor = session.profile.primary_role === "real_estate_agent";
  const [loaded, categories, trustedList] = await Promise.all([
    loadReport(db, id),
    getCategories(),
    isRealtor ? getMyTrustedList(session.userId) : Promise.resolve(null),
  ]);
  if (!loaded) notFound();
  const { report, items, sends } = loaded;
  const country = report.country;

  const trades = categories.map((c) => ({ slug: c.slug, name: tradeName(c.name, lang) }));
  const slugByName = new Map(categories.map((c) => [c.name, c.slug]));
  // Country first: only trusted trades that work in the report's country (or haven't said).
  const trusted: TrustedOption[] = (trustedList?.trades ?? [])
    .filter((x) => !x.vendor.countries?.length || x.vendor.countries.includes(country))
    .map((x) => ({
      organizationId: x.organizationId,
      name: x.vendor.name,
      city: x.vendor.city,
      tradeSlugs: x.vendor.categories.map((n) => slugByName.get(n)).filter((s): s is string => Boolean(s)),
    }));

  const fileAvailable = Boolean(report.file_path) && !isPastRetention(report.report_deleted_after);
  const fileNote =
    report.source !== "upload"
      ? null
      : fileAvailable
        ? fmt(r.review.fileUntil, { date: formatDate(report.report_deleted_after, lang) })
        : r.review.fileGone;

  // updated_at moves when the read starts, so a stuck "running" read shows as failed (with a retry).
  const staleRunning = isStaleRun(report.extraction_status, report.updated_at);
  const readNotice =
    report.source !== "upload"
      ? null
      : report.extraction_status === "unavailable"
        ? "unavailable"
        : report.extraction_status === "failed" || staleRunning || read === "failed"
          ? "failed"
          : report.extraction_status === "running"
            ? "running"
            : null;

  const editorItems: EditorItem[] = items.map((i) => ({
    key: i.id,
    trade_slug: i.trade_slug,
    item: i.item,
    location: i.location ?? "",
    urgency: i.urgency,
    source_page: i.source_page,
    origin: i.origin,
  }));
  const sendSummaries: SendSummary[] = sends.map((x) => ({
    tradeSlug: x.trade_slug,
    date: formatDate(x.initiated_at, lang),
    count: x.recipient_organization_ids.length,
    attached: x.attach_report,
  }));
  const regions = country === "US" ? US_STATE_NAMES : [...CA_PROVINCES];
  const signature = [session.profile.full_name?.trim(), session.organization.name].filter(Boolean).join("\n");

  return (
    <div>
      <PageHeader title={report.title} description={r.dash.description} />
      <ReviewEditor
        // A fresh read (Try again) remounts the editor with the new items.
        key={report.extracted_at ?? "none"}
        reportId={report.id}
        country={country}
        initialDetails={{
          title: report.title,
          reportType: report.report_type,
          buildingName: report.building_name ?? "",
          streetAddress: report.street_address ?? "",
          city: report.city ?? "",
          region: report.region ?? "",
        }}
        initialItems={editorItems}
        initialReviewedAt={report.reviewed_at}
        trades={trades}
        regions={regions}
        fileAvailable={fileAvailable}
        fileNote={fileNote}
        isRealtor={isRealtor}
        trusted={trusted}
        sends={sendSummaries}
        signature={signature}
        readNotice={readNotice}
        canRetry={fileAvailable && report.extraction_status !== "done"}
        s={{
          review: r.review,
          urgency: r.urgency,
          reportTypes: r.reportTypes,
          reportTypeInline: r.reportTypeInline,
          unassigned: r.unassigned,
          page: r.page,
          quote: { intro: r.quote.intro, area: r.quote.area, address: r.quote.address, ask: r.quote.ask },
        }}
      />
    </div>
  );
}
