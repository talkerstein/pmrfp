import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReviewToken, hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { accountGeo, regionCountry } from "@/lib/visitor-geo";
import { sendTrustedQuoteRequest } from "@/lib/email/send";
import { EVENT, trackEvent } from "@/lib/analytics";
import { extractReportItems } from "./ai";
import {
  MAX_QUOTE_RECIPIENTS,
  MAX_REPORT_BYTES,
  REPORT_BUCKET,
  attachLine,
  capWindowStart,
  isPastRetention,
  notRecentlySent,
  reportPath,
  stripNames,
  type ReportCountry,
  type ReportItem,
  type ReportType,
  type TradeOption,
  type Urgency,
} from "./rules";

/**
 * Report → Quotes: everything that touches the database, storage or email.
 * The user's own reads and edits go through their signed-in client (RLS:
 * their organization's rows only); the stored file, the extraction result,
 * the send log and the 90-day purge go through the service role here.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

export const REPORT_COLUMNS =
  "id,organization_id,title,report_type,source,building_name,street_address,city,region,country,reviewed_at,file_path,file_name,file_size,extraction_status,extraction_model,extracted_at,report_deleted_after,file_deleted_at,created_at,updated_at";
export const ITEM_COLUMNS = "id,report_id,trade_slug,item,location,urgency,source_page,position,origin";
const SEND_COLUMNS = "id,trade_slug,recipient_organization_ids,item_count,include_address,attach_report,initiated_at,open_count";

export interface ReportRow {
  id: string;
  organization_id: string;
  title: string;
  report_type: ReportType;
  source: "upload" | "manual";
  building_name: string | null;
  street_address: string | null;
  city: string | null;
  region: string | null;
  country: ReportCountry;
  reviewed_at: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  extraction_status: "none" | "running" | "done" | "failed" | "unavailable";
  extraction_model: string | null;
  extracted_at: string | null;
  report_deleted_after: string;
  file_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  report_id: string;
  trade_slug: string | null;
  item: string;
  location: string | null;
  urgency: Urgency;
  source_page: number | null;
  position: number;
  origin: "ai" | "manual";
}

export interface SendRow {
  id: string;
  trade_slug: string;
  recipient_organization_ids: string[];
  item_count: number;
  include_address: boolean;
  attach_report: boolean;
  initiated_at: string;
  open_count: number;
}

/** The migration hasn't been applied yet (table or column missing). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /does not exist|could not find the table|schema cache/i.test(error.message ?? "");
}

/** A company's country from its province/state (else its country column). Canada when nothing says. */
export function orgCountry(org: { province?: string | null; country?: string | null } | null | undefined): ReportCountry {
  const geo = accountGeo(org);
  if (geo?.country === "US" || geo?.country === "CA") return geo.country;
  return org?.country ? regionCountry({ country: org.country }) : "CA";
}

export function toItem(r: Pick<ItemRow, "trade_slug" | "item" | "location" | "urgency" | "source_page">): ReportItem {
  return { trade_slug: r.trade_slug, item: r.item, location: r.location ?? "", urgency: r.urgency, source_page: r.source_page };
}

// ── Reads (RLS client) ───────────────────────────────────────────────

export async function loadReports(db: Db, orgId: string): Promise<{ ready: boolean; rows: (ReportRow & { itemCount: number })[] }> {
  const { data, error } = await db.from("quote_reports").select(REPORT_COLUMNS).eq("organization_id", orgId).order("created_at", { ascending: false }).limit(100);
  if (error) {
    if (!isMissingTable(error)) console.error("[report-quotes] load", error.message);
    return { ready: false, rows: [] };
  }
  const rows = (data ?? []) as ReportRow[];
  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: items } = await db.from("quote_report_items").select("report_id").in("report_id", rows.map((r) => r.id));
    for (const i of (items ?? []) as { report_id: string }[]) counts.set(i.report_id, (counts.get(i.report_id) ?? 0) + 1);
  }
  return { ready: true, rows: rows.map((r) => ({ ...r, itemCount: counts.get(r.id) ?? 0 })) };
}

export async function loadReport(db: Db, id: string): Promise<{ report: ReportRow; items: ItemRow[]; sends: SendRow[] } | null> {
  const { data: report, error } = await db.from("quote_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle<ReportRow>();
  if (error || !report) return null;
  const [{ data: items }, { data: sends }] = await Promise.all([
    db.from("quote_report_items").select(ITEM_COLUMNS).eq("report_id", id).order("position", { ascending: true }).limit(500),
    db.from("quote_report_sends").select(SEND_COLUMNS).eq("report_id", id).order("initiated_at", { ascending: false }).limit(50),
  ]);
  return { report, items: (items ?? []) as ItemRow[], sends: (sends ?? []) as SendRow[] };
}

/** Uploads this organization made in the last 24 hours (the daily cap). */
export async function countRecentUploads(db: Db, orgId: string, now: Date = new Date()): Promise<number> {
  const { count, error } = await db
    .from("quote_reports")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("source", "upload")
    .gte("created_at", capWindowStart(now));
  if (error) return 0;
  return count ?? 0;
}

// ── Files (service role) ─────────────────────────────────────────────

let bucketChecked = false;

/** Create the private bucket if the migration couldn't (never public). */
async function ensureBucket(admin: Db): Promise<boolean> {
  if (bucketChecked) return true;
  const { data } = await admin.storage.getBucket(REPORT_BUCKET);
  if (data) {
    if (data.public) await admin.storage.updateBucket(REPORT_BUCKET, { public: false });
    bucketChecked = true;
    return true;
  }
  const { error } = await admin.storage.createBucket(REPORT_BUCKET, { public: false, allowedMimeTypes: ["application/pdf"], fileSizeLimit: MAX_REPORT_BYTES });
  if (error && !/already exists/i.test(error.message)) {
    console.error("[report-quotes] bucket", error.message);
    return false;
  }
  bucketChecked = true;
  return true;
}

/** Store the PDF and point the report at it. */
export async function storeReportFile(admin: Db, report: { id: string; organization_id: string }, data: Buffer, name: string | null): Promise<boolean> {
  if (!(await ensureBucket(admin))) return false;
  const path = reportPath(report.organization_id, report.id, randomBytes(9).toString("base64url"));
  const up = await admin.storage.from(REPORT_BUCKET).upload(path, data, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error("[report-quotes] upload", up.error.message);
    return false;
  }
  const { error } = await admin.from("quote_reports").update({ file_path: path, file_name: name, file_size: data.byteLength }).eq("id", report.id);
  if (error) {
    await admin.storage.from(REPORT_BUCKET).remove([path]);
    return false;
  }
  return true;
}

/** A 2-minute signed link to a stored report. Never a public URL. */
export async function signReportFile(admin: Db, path: string, seconds = 120): Promise<string | null> {
  const { data, error } = await admin.storage.from(REPORT_BUCKET).createSignedUrl(path, seconds);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/** Delete a report's stored file (the user's delete, or the 90-day purge). */
export async function removeReportFile(admin: Db, path: string | null): Promise<void> {
  if (path) await admin.storage.from(REPORT_BUCKET).remove([path]);
}

// ── Extraction ───────────────────────────────────────────────────────

export type ExtractionOutcome =
  | { status: "done"; count: number }
  | { status: "manual"; reason: "unavailable" | "quota" | "failed" | "noFile" | "expired" };

/**
 * Read the stored PDF with the model and save the items (origin 'ai').
 * Anything that goes wrong leaves the report open for typing items by hand.
 */
export async function runExtraction(admin: Db, report: ReportRow, trades: readonly TradeOption[]): Promise<ExtractionOutcome> {
  if (!report.file_path) return { status: "manual", reason: "noFile" };
  if (isPastRetention(report.report_deleted_after)) return { status: "manual", reason: "expired" };
  await admin.from("quote_reports").update({ extraction_status: "running" }).eq("id", report.id);
  const { data: blob, error } = await admin.storage.from(REPORT_BUCKET).download(report.file_path);
  if (error || !blob) {
    await admin.from("quote_reports").update({ extraction_status: "failed" }).eq("id", report.id);
    return { status: "manual", reason: "failed" };
  }
  const result = await extractReportItems(Buffer.from(await blob.arrayBuffer()), { trades, country: report.country, reportType: report.report_type });
  if (!result.ok) {
    console.warn("[report-quotes] extraction", result.reason, result.error);
    await admin.from("quote_reports").update({ extraction_status: result.reason === "unavailable" ? "unavailable" : "failed" }).eq("id", report.id);
    return { status: "manual", reason: result.reason };
  }
  // Re-running replaces the earlier AI items; anything the user typed stays.
  await admin.from("quote_report_items").delete().eq("report_id", report.id).eq("origin", "ai");
  if (result.items.length) {
    const { error: insErr } = await admin.from("quote_report_items").insert(
      result.items.map((i, position) => ({ ...i, location: i.location || null, report_id: report.id, organization_id: report.organization_id, position, origin: "ai" })),
    );
    if (insErr) {
      console.error("[report-quotes] items", insErr.message);
      await admin.from("quote_reports").update({ extraction_status: "failed" }).eq("id", report.id);
      return { status: "manual", reason: "failed" };
    }
  }
  await admin
    .from("quote_reports")
    .update({ extraction_status: "done", extraction_model: result.model.slice(0, 80), extracted_at: new Date().toISOString() })
    .eq("id", report.id);
  return { status: "done", count: result.items.length };
}

// ── Retention ────────────────────────────────────────────────────────

/** Daily cron: delete stored PDFs whose 90 days are up. Items and the send log stay. */
export async function purgeExpiredReports(admin: Db, now: Date = new Date()): Promise<{ ready: boolean; deleted: number; errors: number }> {
  const { data, error } = await admin
    .from("quote_reports")
    .select("id,file_path")
    .not("file_path", "is", null)
    .lte("report_deleted_after", now.toISOString())
    .limit(500);
  if (error) return { ready: !isMissingTable(error), deleted: 0, errors: isMissingTable(error) ? 0 : 1 };
  const rows = (data ?? []) as { id: string; file_path: string }[];
  let deleted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: rmErr } = await admin.storage.from(REPORT_BUCKET).remove(batch.map((r) => r.file_path));
    if (rmErr) {
      errors++;
      continue;
    }
    const { error: upErr } = await admin
      .from("quote_reports")
      .update({ file_path: null, file_name: null, file_size: null, file_deleted_at: now.toISOString() })
      .in("id", batch.map((r) => r.id));
    if (upErr) errors++;
    else deleted += batch.length;
  }
  if (deleted) await admin.from("quote_report_sends").update({ share_token_hash: null }).in("report_id", rows.map((r) => r.id));
  return { ready: true, deleted, errors };
}

// ── Shared report links (sent with a quote request) ─────────────────

/**
 * A trade opens the report link from a quote request: the token's sha256
 * must match a send whose report still has its file and whose link hasn't
 * expired. Returns a fresh 2-minute signed URL, or null.
 */
export async function resolveShare(admin: Db, token: string, now: Date = new Date()): Promise<string | null> {
  if (!isWellFormedToken(token)) return null;
  const { data: send } = await admin
    .from("quote_report_sends")
    .select("id,report_id,share_expires_at,open_count")
    .eq("share_token_hash", hashReviewToken(token))
    .maybeSingle<{ id: string; report_id: string; share_expires_at: string | null; open_count: number }>();
  if (!send || !send.share_expires_at || isPastRetention(send.share_expires_at, now)) return null;
  const { data: report } = await admin
    .from("quote_reports")
    .select("file_path,report_deleted_after")
    .eq("id", send.report_id)
    .maybeSingle<{ file_path: string | null; report_deleted_after: string }>();
  if (!report?.file_path || isPastRetention(report.report_deleted_after, now)) return null;
  await admin.from("quote_report_sends").update({ open_count: (send.open_count ?? 0) + 1, last_opened_at: now.toISOString() }).eq("id", send.id);
  return signReportFile(admin, report.file_path);
}

// ── Quote requests to trusted trades (realtors) ─────────────────────

export interface SendQuotesInput {
  userId: string;
  requester: { name: string; email: string; phone: string | null };
  reportId: string;
  tradeSlug: string;
  recipientIds: string[];
  message: string;
  includeAddress: boolean;
  attachReport: boolean;
  /** "The inspection report (PDF): {url} (this link works until {date})." in the sender's language. */
  attachTemplate: string;
  formatDate: (iso: string) => string;
}

export type SendQuotesError = "notFound" | "notReviewed" | "noItems" | "noRecipients" | "tooMany" | "noFile" | "unavailable" | "failed";
export type SendQuotesResult = { ok: true; sent: number; skipped: number; suppressed: number } | { ok: false; error: SendQuotesError };

/**
 * Send one trade group as quote requests to trades on the sender's own
 * trusted-trades list, through the same email and contact log the public
 * trusted-trades page uses (sendTrustedQuoteRequest, contact_requests). A
 * pure one-off inquiry the user started: no PMRFP pitch, no follow-ups.
 * Suppressed addresses are skipped; a company already sent this group in
 * the last 7 days is skipped; the report file only travels as a PMRFP link
 * when the user ticked "attach report".
 *
 * `db` is the sender's own client (RLS: the report must be theirs);
 * `admin` is the service role.
 */
export async function sendReportQuotes(db: Db, admin: Db, input: SendQuotesInput, now: Date = new Date()): Promise<SendQuotesResult> {
  const ids = [...new Set(input.recipientIds)];
  if (!ids.length) return { ok: false, error: "noRecipients" };
  if (ids.length > MAX_QUOTE_RECIPIENTS) return { ok: false, error: "tooMany" };

  const { data: report, error: repErr } = await db
    .from("quote_reports")
    .select("id,organization_id,reviewed_at,file_path,report_deleted_after")
    .eq("id", input.reportId)
    .maybeSingle<{ id: string; organization_id: string; reviewed_at: string | null; file_path: string | null; report_deleted_after: string }>();
  if (repErr) return { ok: false, error: isMissingTable(repErr) ? "unavailable" : "failed" };
  if (!report) return { ok: false, error: "notFound" };
  // Nothing goes out before the user has reviewed and saved the list.
  if (!report.reviewed_at) return { ok: false, error: "notReviewed" };
  const attach = input.attachReport;
  if (attach && (!report.file_path || isPastRetention(report.report_deleted_after, now))) return { ok: false, error: "noFile" };

  const { data: itemRows } = await db.from("quote_report_items").select("id").eq("report_id", report.id).eq("trade_slug", input.tradeSlug);
  const itemCount = (itemRows ?? []).length;
  if (!itemCount) return { ok: false, error: "noItems" };

  // Only trades on the sender's own list, approved, in this send.
  const { data: listed } = await admin.from("trusted_list_items").select("organization_id").eq("owner_id", input.userId).in("organization_id", ids);
  const onList = ((listed ?? []) as { organization_id: string }[]).map((r) => r.organization_id);
  if (!onList.length) return { ok: false, error: "noRecipients" };
  const { data: orgRows } = await admin.from("organizations").select("id,name,slug,email,profile_status").in("id", onList);
  const orgs = ((orgRows ?? []) as { id: string; name: string; slug: string; email: string | null; profile_status: string }[]).filter((o) => o.profile_status === "approved");
  if (!orgs.length) return { ok: false, error: "noRecipients" };

  const { data: prior } = await admin.from("quote_report_sends").select("trade_slug,recipient_organization_ids,initiated_at").eq("report_id", report.id);
  const guard = notRecentlySent(orgs.map((o) => o.id), (prior ?? []) as { trade_slug: string; recipient_organization_ids: string[]; initiated_at: string }[], input.tradeSlug, now);

  // The do-not-contact list (bounces, complaints, unsubscribes).
  const keys = orgs.map((o) => o.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e));
  const { data: suppressedRows } = keys.length ? await admin.from("email_suppressions").select("email_key").in("email_key", keys) : { data: [] };
  const suppressed = new Set(((suppressedRows ?? []) as { email_key: string }[]).map((r) => r.email_key));
  const targets = orgs.filter((o) => guard.send.includes(o.id) && !(o.email && suppressed.has(o.email.trim().toLowerCase())));
  const suppressedCount = orgs.filter((o) => o.email && suppressed.has(o.email.trim().toLowerCase())).length;
  if (!targets.length) return { ok: true, sent: 0, skipped: guard.skipped.length, suppressed: suppressedCount };

  const token = attach ? generateReviewToken() : null;
  const { error: logErr } = await admin.from("quote_report_sends").insert({
    report_id: report.id,
    organization_id: report.organization_id,
    initiated_by: input.userId,
    initiated_at: now.toISOString(),
    trade_slug: input.tradeSlug,
    recipient_organization_ids: targets.map((o) => o.id),
    item_count: itemCount,
    include_address: input.includeAddress,
    attach_report: attach,
    share_token_hash: token ? hashReviewToken(token) : null,
    share_expires_at: token ? report.report_deleted_after : null,
  });
  if (logErr) return { ok: false, error: isMissingTable(logErr) ? "unavailable" : "failed" };

  const { data: list } = await admin
    .from("trusted_lists")
    .select("handle,display_name,brokerage,published")
    .eq("owner_id", input.userId)
    .maybeSingle<{ handle: string; display_name: string; brokerage: string | null; published: boolean }>();
  const recommender = list ? (list.brokerage ? `${list.display_name} (${list.brokerage})` : list.display_name) : input.requester.name;

  // People's names never go to trades, whoever typed them.
  const body = stripNames(input.message).slice(0, 4000);
  const message = token ? `${body}\n\n${attachLine(input.attachTemplate, `${BASE()}/api/report-quotes/shared/${token}`, input.formatDate(report.report_deleted_after))}` : body;

  for (const org of targets) {
    await admin.from("contact_requests").insert({
      request_type: "directory_intro",
      requester_name: input.requester.name,
      requester_email: input.requester.email,
      requester_phone: input.requester.phone,
      target_organization_id: org.id,
      // The share link stays out of the log: only the trade's email carries it.
      message: `[Quote request via Report → Quotes${attach ? ", report attached" : ""}] ${body}`.slice(0, 4500),
    });
    await sendTrustedQuoteRequest({
      to: org.email,
      tradeName: org.name,
      recommender,
      pageUrl: list?.published ? `${BASE()}/trusted/${list.handle}` : `${BASE()}/directory/${org.slug}`,
      requester: input.requester,
      message,
      cc: [input.requester.email],
    });
  }
  await trackEvent(EVENT.QUOTE_REQUEST_POSTED, { kind: "report_to_quotes", trades: targets.length }, { userId: input.userId });
  return { ok: true, sent: targets.length, skipped: guard.skipped.length, suppressed: suppressedCount };
}
