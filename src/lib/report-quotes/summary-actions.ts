"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { linkReportRfp } from "./rfp-link";
import { createSummaryShare, revokeSummaryShare, setSummaryAddress } from "./summary-server";

/**
 * Repair Cost Summary actions: the share link (on / replace / off), the
 * street-address opt-in, and linking a trade group to an RFP by hand. The
 * report is always read through the user's own client first (RLS: their
 * organization's reports only); the settings row is then written by the
 * service role. Errors come back as keys the page translates.
 */

const ROLES = ["property_manager", "real_estate_agent"];
const DASH = "/pm-dashboard/report-to-quotes";
const reportId = z.uuid();
const tradeSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);

type Err = "signIn" | "role" | "noOrg" | "notFound" | "unavailable" | "failed";

async function ownReport(id: string): Promise<{ userId: string; db: Awaited<ReturnType<typeof createClient>>; report: { id: string; organization_id: string } } | { error: Err }> {
  if (!reportId.safeParse(id).success) return { error: "notFound" };
  const session = await getSession();
  if (!session) return { error: "signIn" };
  if (!ROLES.includes(session.profile.primary_role)) return { error: "role" };
  if (!session.organization) return { error: "noOrg" };
  const db = await createClient();
  const { data: report } = await db.from("quote_reports").select("id,organization_id").eq("id", id).maybeSingle<{ id: string; organization_id: string }>();
  if (!report) return { error: "notFound" };
  return { userId: session.userId, db, report };
}

const summaryPath = (id: string) => `${DASH}/${id}/summary`;

export type ShareResult = { ok: true; token: string | null } | { ok: false; error: Err };

/** "on" makes a new token (returned once; it replaces any earlier link); "off" clears it. */
export async function shareSummaryAction(id: string, mode: "on" | "off"): Promise<ShareResult> {
  const own = await ownReport(id);
  if ("error" in own) return { ok: false, error: own.error };
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const admin = createServiceClient();
  if (mode === "off") {
    const ok = await revokeSummaryShare(admin, own.report, own.userId);
    if (!ok) return { ok: false, error: "failed" };
    revalidatePath(summaryPath(id));
    return { ok: true, token: null };
  }
  const token = await createSummaryShare(admin, own.report, own.userId);
  if (!token) return { ok: false, error: "failed" };
  revalidatePath(summaryPath(id));
  return { ok: true, token };
}

export type SimpleResult = { ok: true } | { ok: false; error: Err | "invalid" };

export async function setSummaryAddressAction(id: string, include: boolean): Promise<SimpleResult> {
  const own = await ownReport(id);
  if ("error" in own) return { ok: false, error: own.error };
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const ok = await setSummaryAddress(createServiceClient(), own.report, own.userId, Boolean(include));
  if (!ok) return { ok: false, error: "failed" };
  revalidatePath(summaryPath(id));
  return { ok: true };
}

/** Link a trade group to one of the organization's RFPs (RLS checks both belong to it). */
export async function linkGroupRfpAction(id: string, trade: string, rfpId: string): Promise<SimpleResult> {
  if (!tradeSlug.safeParse(trade).success || !z.uuid().safeParse(rfpId).success) return { ok: false, error: "invalid" };
  const own = await ownReport(id);
  if ("error" in own) return { ok: false, error: own.error };
  const ok = await linkReportRfp(own.db, { reportId: id, tradeSlug: trade, rfpId, userId: own.userId });
  if (!ok) return { ok: false, error: "failed" };
  revalidatePath(summaryPath(id));
  return { ok: true };
}

export async function unlinkGroupRfpAction(id: string, linkId: string): Promise<SimpleResult> {
  if (!z.uuid().safeParse(linkId).success) return { ok: false, error: "invalid" };
  const own = await ownReport(id);
  if ("error" in own) return { ok: false, error: own.error };
  const { error } = await own.db.from("quote_report_rfps").delete().eq("id", linkId).eq("report_id", id);
  if (error) return { ok: false, error: "failed" };
  revalidatePath(summaryPath(id));
  return { ok: true };
}
