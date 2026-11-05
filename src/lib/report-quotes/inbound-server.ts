import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { MAX_REPORT_BYTES, checkPdf, cleanFileName, titleFromFileName, uploadsLeft } from "./rules";
import { countRecentUploads, isMissingTable, orgCountry, storeReportFile } from "./server";
import {
  INBOX_TOKEN,
  MAX_PDFS_PER_EMAIL,
  cleanFrom,
  cleanSubject,
  hasLink,
  inboxAddress,
  isOwnDomain,
  isPdfCandidate,
  isProviderDownloadUrl,
  newInboxToken,
  pickInboxToken,
  type InboundConfig,
  type InboundEmail,
  type InboundOutcome,
} from "./inbound";

/**
 * Report → Quotes by email: the database, storage and provider side. All of
 * it runs with the service role (a webhook has no signed-in user); every
 * read is scoped to the one organization the inbox token belongs to.
 */

type Db = SupabaseClient;

const ROLES = ["property_manager", "real_estate_agent"];
/** The forwarded-email log is kept this long (the From address is personal data). */
export const INBOUND_LOG_DAYS = 90;

// ── Forwarding addresses ─────────────────────────────────────────────

export interface Inbox {
  token: string;
  address: string;
  createdAt: string;
  rotatedAt: string | null;
}

/** The user's forwarding address in this organization; made on first view. Null before the migration. */
export async function getOrCreateInbox(admin: Db, cfg: InboundConfig, orgId: string, userId: string): Promise<Inbox | null> {
  const { data, error } = await admin
    .from("quote_report_inboxes")
    .select("token,created_at,rotated_at")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle<{ token: string; created_at: string; rotated_at: string | null }>();
  if (error) {
    if (!isMissingTable(error)) console.error("[report-quotes] inbox", error.message);
    return null;
  }
  if (data) return { token: data.token, address: inboxAddress(data.token, cfg.domain), createdAt: data.created_at, rotatedAt: data.rotated_at };
  const token = newInboxToken();
  const { data: made, error: insErr } = await admin
    .from("quote_report_inboxes")
    .insert({ organization_id: orgId, user_id: userId, token })
    .select("token,created_at,rotated_at")
    .single<{ token: string; created_at: string; rotated_at: string | null }>();
  if (insErr || !made) {
    // Two tabs at once: the other insert won; read it back.
    if (insErr?.code === "23505") return getOrCreateInbox(admin, cfg, orgId, userId);
    console.error("[report-quotes] inbox create", insErr?.message);
    return null;
  }
  return { token: made.token, address: inboxAddress(made.token, cfg.domain), createdAt: made.created_at, rotatedAt: made.rotated_at };
}

/** A new token: the old address stops working at once. */
export async function rotateInbox(admin: Db, cfg: InboundConfig, orgId: string, userId: string, now: Date = new Date()): Promise<Inbox | null> {
  const existing = await getOrCreateInbox(admin, cfg, orgId, userId);
  if (!existing) return null;
  const token = newInboxToken();
  const { error } = await admin
    .from("quote_report_inboxes")
    .update({ token, rotated_at: now.toISOString() })
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) return null;
  return { token, address: inboxAddress(token, cfg.domain), createdAt: existing.createdAt, rotatedAt: now.toISOString() };
}

// ── The log ──────────────────────────────────────────────────────────

export interface InboundLogRow {
  id: string;
  from_address: string | null;
  subject: string | null;
  outcome: InboundOutcome | "received";
  pdf_count: number;
  report_ids: string[];
  received_at: string;
}

/** The user's own recent forwarded emails (their own client: RLS shows only theirs). */
export async function loadInboundLog(db: Db, userId: string, limit = 10): Promise<InboundLogRow[]> {
  const { data, error } = await db
    .from("quote_report_inbound")
    .select("id,from_address,subject,outcome,pdf_count,report_ids,received_at")
    .eq("user_id", userId)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as InboundLogRow[];
}

/** Daily cron: forget forwarded-email log rows after 90 days. */
export async function purgeInboundLog(admin: Db, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - INBOUND_LOG_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("quote_report_inbound").delete().lt("received_at", before).select("id");
  if (error) return 0;
  return (data ?? []).length;
}

// ── Processing one email ─────────────────────────────────────────────

export interface ProviderAttachment {
  id: string;
  filename: string | null;
  size: number | null;
  contentType: string | null;
  downloadUrl: string;
}

/** What processing needs from the outside world (the provider, storage); swapped out in tests. */
export interface InboundDeps {
  listAttachments: (messageId: string) => Promise<ProviderAttachment[] | null>;
  /** The email's text and HTML (only asked for when there's no PDF, to tell "had a link" apart). */
  getBody: (messageId: string) => Promise<{ text: string | null; html: string | null } | null>;
  /** Downloads at most `maxBytes`; "tooBig" past that. */
  download: (url: string, maxBytes: number) => Promise<Buffer | "tooBig" | null>;
  store: (report: { id: string; organization_id: string }, data: Buffer, name: string | null) => Promise<boolean>;
}

export type InboundResult =
  | { status: "ignored"; reason: "noToken" | "ownDomain" | "unknownInbox" | "notMember" | "unavailable" }
  | { status: "duplicate" }
  | { status: "done"; outcome: InboundOutcome; reportIds: string[] };

/** Reads a response body up to `max` bytes; stops (and says so) past it. */
export async function readCapped(res: Response, max: number): Promise<Buffer | "tooBig" | null> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return "tooBig";
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return "tooBig";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** The Resend receiving API (attachments, body) and a capped download from its own CDN only. */
export function resendDeps(cfg: InboundConfig, admin: Db): InboundDeps {
  const resend = new Resend(cfg.apiKey);
  return {
    async listAttachments(messageId) {
      const { data, error } = await resend.emails.receiving.attachments.list({ emailId: messageId });
      if (error || !data) return null;
      return data.data.map((a) => ({ id: a.id, filename: a.filename ?? null, size: a.size ?? null, contentType: a.content_type ?? null, downloadUrl: a.download_url }));
    },
    async getBody(messageId) {
      const { data, error } = await resend.emails.receiving.get(messageId);
      if (error || !data) return null;
      return { text: data.text ?? null, html: data.html ?? null };
    },
    async download(url, maxBytes) {
      if (!isProviderDownloadUrl(url)) return null;
      const res = await fetch(url, { redirect: "error", cache: "no-store" });
      if (!res.ok) return null;
      return readCapped(res, maxBytes);
    },
    store: (report, data, name) => storeReportFile(admin, report, data, name),
  };
}

/**
 * One forwarded email → up to MAX_PDFS_PER_EMAIL new reports for the
 * inbox's owner, within the organization's daily upload cap. The token picks
 * the account; the From address is only logged. A retry of the same email is
 * a duplicate (the log's unique key). Never sends anything back. Created
 * reports are returned so the caller can start the read (runExtraction).
 * Throws only on an unexpected failure, after removing its log row so the
 * provider's retry can try again.
 */
export async function processInboundEmail(admin: Db, email: InboundEmail, cfg: InboundConfig, deps: InboundDeps, now: Date = new Date()): Promise<InboundResult> {
  const token = pickInboxToken(email.recipients, cfg.domain);
  if (!token || !INBOX_TOKEN.test(token)) return { status: "ignored", reason: "noToken" };
  if (isOwnDomain(email.from, cfg.domain)) return { status: "ignored", reason: "ownDomain" };

  const { data: inbox, error: inboxErr } = await admin
    .from("quote_report_inboxes")
    .select("organization_id,user_id")
    .eq("token", token)
    .maybeSingle<{ organization_id: string; user_id: string }>();
  if (inboxErr) return { status: "ignored", reason: isMissingTable(inboxErr) ? "unavailable" : "unknownInbox" };
  if (!inbox) return { status: "ignored", reason: "unknownInbox" };

  // The owner must still be a realtor / property manager in that organization.
  const [{ data: membership }, { data: profile }, { data: org }] = await Promise.all([
    admin.from("organization_members").select("user_id").eq("organization_id", inbox.organization_id).eq("user_id", inbox.user_id).maybeSingle(),
    admin.from("users_profile").select("primary_role,status").eq("id", inbox.user_id).maybeSingle<{ primary_role: string; status: string | null }>(),
    admin.from("organizations").select("id,province,country").eq("id", inbox.organization_id).maybeSingle<{ id: string; province: string | null; country: string | null }>(),
  ]);
  if (!membership || !org || !profile || !ROLES.includes(profile.primary_role) || (profile.status && profile.status !== "active")) {
    return { status: "ignored", reason: "notMember" };
  }

  const subject = cleanSubject(email.subject);
  const { data: logRow, error: logErr } = await admin
    .from("quote_report_inbound")
    .insert({
      organization_id: inbox.organization_id,
      user_id: inbox.user_id,
      provider: email.provider,
      provider_message_id: email.messageId,
      from_address: cleanFrom(email.from),
      subject: subject || null,
      received_at: now.toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (logErr) {
    if (logErr.code === "23505") return { status: "duplicate" };
    return { status: "ignored", reason: isMissingTable(logErr) ? "unavailable" : "unknownInbox" };
  }
  const finish = async (outcome: InboundOutcome, reportIds: string[] = [], pdfCount = 0): Promise<InboundResult> => {
    await admin.from("quote_report_inbound").update({ outcome, report_ids: reportIds, pdf_count: pdfCount }).eq("id", logRow.id);
    return { status: "done", outcome, reportIds };
  };

  try {
    const candidates = email.attachments.filter(isPdfCandidate);
    if (!candidates.length) {
      // No PDF: record whether the email pointed at a link. The link itself is never opened.
      const body = await deps.getBody(email.messageId).catch(() => null);
      return finish(body && hasLink(body.text, body.html) ? "no_pdf_link" : "no_pdf");
    }

    const left = uploadsLeft(await countRecentUploads(admin, inbox.organization_id, now));
    if (left <= 0) return finish("cap", [], candidates.length);

    const listed = await deps.listAttachments(email.messageId);
    if (!listed) throw new Error("attachments unavailable");
    const byId = new Map(listed.map((a) => [a.id, a]));

    const reportIds: string[] = [];
    let tooBig = 0;
    let notPdf = 0;
    let failed = 0;
    for (const meta of candidates.slice(0, Math.min(MAX_PDFS_PER_EMAIL, left))) {
      const att = byId.get(meta.id);
      if (!att) {
        failed++;
        continue;
      }
      const size = att.size ?? meta.size;
      if (size !== null && size > MAX_REPORT_BYTES) {
        tooBig++;
        continue;
      }
      const data = await deps.download(att.downloadUrl, MAX_REPORT_BYTES).catch(() => null);
      if (data === "tooBig") {
        tooBig++;
        continue;
      }
      if (!data) {
        failed++;
        continue;
      }
      const check = checkPdf(data.byteLength, data.subarray(0, 1024));
      if (!check.ok) {
        if (check.error === "tooBig") tooBig++;
        else notPdf++;
        continue;
      }
      const name = cleanFileName(att.filename ?? meta.filename);
      const { data: report, error } = await admin
        .from("quote_reports")
        .insert({
          organization_id: inbox.organization_id,
          created_by: inbox.user_id,
          title: titleFromFileName(name, subject || "Inspection report"),
          report_type: "home_inspection",
          // An emailed PDF is an upload like any other: same cap, same 90-day file, same review.
          source: "upload",
          country: orgCountry(org),
        })
        .select("id,organization_id")
        .single<{ id: string; organization_id: string }>();
      if (error || !report) {
        failed++;
        continue;
      }
      if (!(await deps.store(report, data, name).catch(() => false))) {
        await admin.from("quote_reports").delete().eq("id", report.id);
        failed++;
        continue;
      }
      reportIds.push(report.id);
    }

    if (reportIds.length) return finish("created", reportIds, candidates.length);
    if (tooBig) return finish("too_big", [], candidates.length);
    if (notPdf && !failed) return finish("not_pdf", [], candidates.length);
    return finish("failed", [], candidates.length);
  } catch (e) {
    // Let the provider retry: drop the log row so the retry isn't a "duplicate".
    await admin.from("quote_report_inbound").delete().eq("id", logRow.id);
    throw e;
  }
}
