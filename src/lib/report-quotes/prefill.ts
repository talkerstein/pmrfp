import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { visitorRegionSlug } from "@/lib/visitor-geo";
import type { RfpPostDefaults } from "@/components/forms/rfp-post-form";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";
import { buildRfpPrefill, groupItems } from "./rules";
import { ITEM_COLUMNS, toItem, type ItemRow, type ReportRow } from "./server";

/**
 * The RFP form's defaults for one reviewed trade group of a report
 * (/pm-dashboard/rfps/new?report=…&trade=…[&address=1]). Read through the
 * user's own client, so only their organization's reports resolve. The
 * street address goes in only with address=1; the report file never does.
 */
export async function reportRfpPrefill(
  reportId: string,
  tradeSlug: string,
  includeAddress: boolean,
  lang: Locale,
  categories: readonly { slug: string; name: string }[],
  regions: readonly { slug: string }[],
): Promise<{ defaults: RfpPostDefaults; notice: string } | null> {
  if (!z.uuid().safeParse(reportId).success || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(tradeSlug)) return null;
  const category = categories.find((c) => c.slug === tradeSlug);
  if (!category) return null;
  const t = getDictionary(lang).reportQuotes;
  const db = await createClient();
  const { data: report } = await db
    .from("quote_reports")
    .select("id,title,report_type,building_name,street_address,city,region,country,reviewed_at")
    .eq("id", reportId)
    .maybeSingle<Pick<ReportRow, "id" | "title" | "report_type" | "building_name" | "street_address" | "city" | "region" | "country" | "reviewed_at">>();
  if (!report) return null;
  // Nothing leaves the editor before the user has reviewed and saved the list.
  if (!report.reviewed_at) return { defaults: {}, notice: t.rfp.needsReview };
  const { data: rows } = await db.from("quote_report_items").select(ITEM_COLUMNS).eq("report_id", reportId).eq("trade_slug", tradeSlug).order("position", { ascending: true });
  const items = ((rows ?? []) as ItemRow[]).map(toItem);
  if (!items.length) return null;

  const name = tradeName(category.name, lang);
  // Page numbers mean nothing without the report, and an RFP never carries it.
  const [group] = groupItems(items.map((i) => ({ ...i, source_page: null })));
  const prefill = buildRfpPrefill(
    group,
    name,
    { buildingName: report.building_name, streetAddress: report.street_address, city: report.city, region: report.region },
    includeAddress,
    { ...t.rfp, urgency: t.urgency, page: t.page, reportType: t.reportTypeInline[report.report_type] },
  );
  const regionSlug = visitorRegionSlug({ country: report.country, province: report.region });
  return {
    defaults: {
      title: prefill.title,
      summary: prefill.summary,
      scope: prefill.scope,
      categories: [tradeSlug],
      ...(report.city ? { city: report.city } : {}),
      ...(report.region ? { province: report.region } : {}),
      ...(regionSlug && regions.some((r) => r.slug === regionSlug) ? { regionSlug } : {}),
      fromReport: { reportId: report.id, tradeSlug },
    },
    notice: fmt(t.rfp.notice, { title: report.title }),
  };
}
