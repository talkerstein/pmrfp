"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { REPORT_TYPES, cleanEditorItems, itemSchema, reviewSchema, type ReviewInput } from "./rules";
import { isMissingTable, orgCountry, removeReportFile, sendReportQuotes, type SendQuotesError } from "./server";

/**
 * Report → Quotes server actions. Every read and write goes through the
 * signed-in user's own client, so RLS keeps each organization to its own
 * reports; only the stored file and the quote-request send use the service
 * role. Errors come back as keys the editor translates.
 */

const ROLES = ["property_manager", "real_estate_agent"];
const DASH = "/pm-dashboard/report-to-quotes";

type Member = { session: SessionContext & { organization: NonNullable<SessionContext["organization"]> }; db: Awaited<ReturnType<typeof createClient>> };

async function member(): Promise<Member | { error: "signIn" | "role" | "noOrg" }> {
  const session = await getSession();
  if (!session) return { error: "signIn" };
  if (!ROLES.includes(session.profile.primary_role)) return { error: "role" };
  if (!session.organization) return { error: "noOrg" };
  return { session: session as Member["session"], db: await createClient() };
}

const reportId = z.uuid();
const savedItem = itemSchema.extend({ origin: z.enum(["ai", "manual"]).default("manual") });
const saveInput = reviewSchema.extend({ items: z.array(savedItem).max(150) });

export type SaveReviewResult = { ok: true; reviewedAt: string } | { ok: false; error: "signIn" | "role" | "noOrg" | "invalid" | "notFound" | "unavailable" | "failed" };

/**
 * Save the reviewed list and the property details, and mark the report as
 * reviewed (nothing can be sent before this). The new item set is written
 * first and the old rows deleted after, so a failed save loses nothing.
 */
export async function saveReviewAction(id: string, input: ReviewInput & { items: (ReviewInput["items"][number] & { origin?: "ai" | "manual" })[] }): Promise<SaveReviewResult> {
  if (!reportId.safeParse(id).success) return { ok: false, error: "notFound" };
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const m = await member();
  if ("error" in m) return { ok: false, error: m.error };
  const { db } = m;

  const { data: report, error: readErr } = await db.from("quote_reports").select("id,organization_id").eq("id", id).maybeSingle<{ id: string; organization_id: string }>();
  if (readErr) return { ok: false, error: isMissingTable(readErr) ? "unavailable" : "failed" };
  if (!report) return { ok: false, error: "notFound" };

  const trades = await getCategories();
  const v = parsed.data;
  const cleaned = cleanEditorItems(v.items, trades);
  const reviewedAt = new Date().toISOString();

  const { data: oldRows } = await db.from("quote_report_items").select("id").eq("report_id", id);
  const oldIds = ((oldRows ?? []) as { id: string }[]).map((r) => r.id);

  if (cleaned.length) {
    const { error: insErr } = await db.from("quote_report_items").insert(
      cleaned.map((item, position) => ({
        report_id: id,
        organization_id: report.organization_id,
        trade_slug: item.trade_slug,
        item: item.item,
        location: item.location || null,
        urgency: item.urgency,
        source_page: item.source_page,
        position,
        origin: v.items[position]?.origin ?? "manual",
      })),
    );
    if (insErr) return { ok: false, error: "failed" };
  }
  if (oldIds.length) await db.from("quote_report_items").delete().in("id", oldIds);

  const { error: upErr } = await db
    .from("quote_reports")
    .update({
      title: v.title,
      report_type: v.reportType,
      building_name: v.buildingName || null,
      street_address: v.streetAddress || null,
      city: v.city || null,
      region: v.region || null,
      reviewed_at: reviewedAt,
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: "failed" };
  revalidatePath(`${DASH}/${id}`);
  revalidatePath(DASH);
  return { ok: true, reviewedAt };
}

const manualInput = z.object({
  title: z.string().trim().min(1).max(160),
  reportType: z.enum(REPORT_TYPES),
  city: z.string().trim().max(120).default(""),
  region: z.string().trim().max(60).default(""),
});

export type CreateManualResult = { ok: true; id: string } | { ok: false; error: "signIn" | "role" | "noOrg" | "invalid" | "unavailable" | "failed" };

/** Start a list without a file: the same editor, items typed by hand. */
export async function createManualReportAction(input: z.input<typeof manualInput>): Promise<CreateManualResult> {
  const parsed = manualInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const m = await member();
  if ("error" in m) return { ok: false, error: m.error };
  const { session, db } = m;
  const { data, error } = await db
    .from("quote_reports")
    .insert({
      organization_id: session.organization.id,
      created_by: session.userId,
      title: parsed.data.title,
      report_type: parsed.data.reportType,
      source: "manual",
      city: parsed.data.city || null,
      region: parsed.data.region || null,
      country: orgCountry(session.organization),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { ok: false, error: error && isMissingTable(error) ? "unavailable" : "failed" };
  revalidatePath(DASH);
  return { ok: true, id: data.id };
}

export type DeleteReportResult = { ok: true } | { ok: false; error: "signIn" | "role" | "noOrg" | "notFound" | "failed" };

/** Delete a report, its items, its send log and the stored file. */
export async function deleteReportAction(id: string): Promise<DeleteReportResult> {
  if (!reportId.safeParse(id).success) return { ok: false, error: "notFound" };
  const m = await member();
  if ("error" in m) return { ok: false, error: m.error };
  const { db } = m;
  const { data: report } = await db.from("quote_reports").select("id,file_path").eq("id", id).maybeSingle<{ id: string; file_path: string | null }>();
  if (!report) return { ok: false, error: "notFound" };
  if (report.file_path && isServiceConfigured()) await removeReportFile(createServiceClient(), report.file_path);
  const { error } = await db.from("quote_reports").delete().eq("id", id);
  if (error) return { ok: false, error: "failed" };
  revalidatePath(DASH);
  return { ok: true };
}

const sendInput = z.object({
  reportId: z.uuid(),
  tradeSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  recipientIds: z.array(z.uuid()).min(1).max(50),
  message: z.string().trim().min(1).max(4000),
  includeAddress: z.boolean(),
  attachReport: z.boolean(),
  lang: z.string(),
});

export type SendQuoteRequestsResult =
  | { ok: true; sent: number; skipped: number; suppressed: number }
  | { ok: false; error: SendQuotesError | "signIn" | "role" | "noOrg" | "invalid" | "realtorOnly" };

/**
 * Realtors: send one reviewed trade group as quote requests to trades on
 * their own trusted-trades list. Only ever runs when the user clicks Send.
 */
export async function sendQuoteRequestsAction(input: z.input<typeof sendInput>): Promise<SendQuoteRequestsResult> {
  const parsed = sendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const m = await member();
  if ("error" in m) return { ok: false, error: m.error };
  const { session, db } = m;
  if (session.profile.primary_role !== "real_estate_agent") return { ok: false, error: "realtorOnly" };
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const v = parsed.data;
  const lang = hasLocale(v.lang) ? v.lang : "en";
  const result = await sendReportQuotes(db, createServiceClient(), {
    userId: session.userId,
    requester: {
      name: (session.profile.full_name?.trim() || session.organization.name).slice(0, 120),
      email: session.profile.email,
      phone: session.profile.phone ?? null,
    },
    reportId: v.reportId,
    tradeSlug: v.tradeSlug,
    recipientIds: v.recipientIds,
    message: v.message,
    includeAddress: v.includeAddress,
    attachReport: v.attachReport,
    attachTemplate: getDictionary(lang).reportQuotes.quote.attach,
    formatDate: (iso) => formatDate(iso, lang),
  });
  if (result.ok) revalidatePath(`${DASH}/${v.reportId}`);
  return result;
}
