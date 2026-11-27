import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Report → Quotes: remember which RFP a reviewed trade group became, so the
 * Repair Cost Summary can show that group's real quotes. Runs through the
 * poster's own client: RLS only accepts a link between their organization's
 * report and an RFP their organization posted.
 */

const TRADE_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Hidden fields the prefilled RFP form carries (see RfpPostDefaults.fromReport). */
export const FROM_REPORT_FIELD = "fromReport";
export const FROM_REPORT_TRADE_FIELD = "fromReportTrade";

export function readFromReport(formData: FormData): { reportId: string; tradeSlug: string } | null {
  const reportId = String(formData.get(FROM_REPORT_FIELD) ?? "");
  const tradeSlug = String(formData.get(FROM_REPORT_TRADE_FIELD) ?? "");
  if (!z.uuid().safeParse(reportId).success || !TRADE_SLUG.test(tradeSlug)) return null;
  return { reportId, tradeSlug };
}

/** Insert the link. Never throws and never blocks the RFP: a failure only means no link. */
export async function linkReportRfp(db: SupabaseClient, input: { reportId: string; tradeSlug: string; rfpId: string; userId: string }): Promise<boolean> {
  try {
    const { data: report } = await db.from("quote_reports").select("id,organization_id").eq("id", input.reportId).maybeSingle<{ id: string; organization_id: string }>();
    if (!report) return false;
    const { error } = await db.from("quote_report_rfps").insert({
      report_id: report.id,
      organization_id: report.organization_id,
      trade_slug: input.tradeSlug,
      rfp_id: input.rfpId,
      created_by: input.userId,
    });
    if (error && error.code !== "23505") console.warn("[report-quotes] rfp link", error.message);
    return !error;
  } catch (e) {
    console.warn("[report-quotes] rfp link", e instanceof Error ? e.message : e);
    return false;
  }
}

/** createRfpAction's hook: link the new RFP when the form came from a report. */
export async function linkRfpFromForm(db: SupabaseClient, formData: FormData, rfpId: string, userId: string): Promise<void> {
  const from = readFromReport(formData);
  if (from) await linkReportRfp(db, { ...from, rfpId, userId });
}
