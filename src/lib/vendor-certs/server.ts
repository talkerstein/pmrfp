import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { generateReviewToken, hashReviewToken, isWellFormedToken } from "@/lib/projects/tokens";
import { accountGeo, regionCountry } from "@/lib/visitor-geo";
import { sendVendorCertEmail } from "@/lib/email/send";
import { certUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { emailLang, type EmailLang } from "@/lib/pm-jobs/email-copy";
import { recipientLangs } from "@/lib/pm-jobs/server";
import { localizePath } from "@/i18n/config";
import { certDigestEmail, certReminderEmail, certRequestEmail, type DigestItem } from "./email-copy";
import {
  CERT_BUCKET,
  CERT_MIME,
  DAILY_REQUEST_LIMIT,
  MAX_CERT_BYTES,
  REQUEST_TTL_DAYS,
  canRequestAgain,
  certPath,
  certStatus,
  cleanEmail,
  cleanFileName,
  daysUntil,
  isoDay,
  needsReminder,
  sniffCertMime,
  vendorReminderStage,
  type CertCountry,
  type CertType,
} from "./rules";

/**
 * Vendor Insurance & WSIB Certificate Tracker: everything that touches the
 * database, storage or email. The PM's own reads and edits go through their
 * signed-in client (RLS: their organization's rows only); the file, the
 * request token, the linked PMRFP company and the cron's stamps go through
 * the service role here.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
const mailingAddress = () => process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;

export const CERT_COLUMNS =
  "id,organization_id,vendor_name,contact_email,trade,cert_type,insurer,policy_number,coverage_amount,expires_on,notes,remind_vendor,file_path,file_name,file_uploaded_at,uploaded_by,vendor_organization_id,request_sent_at,request_count,created_at";

export interface CertRow {
  id: string;
  organization_id: string;
  vendor_name: string;
  contact_email: string | null;
  trade: string | null;
  cert_type: CertType;
  insurer: string | null;
  policy_number: string | null;
  coverage_amount: number | string | null;
  expires_on: string | null;
  notes: string | null;
  remind_vendor: boolean;
  file_path: string | null;
  file_name: string | null;
  file_uploaded_at: string | null;
  uploaded_by: "pm" | "vendor" | null;
  vendor_organization_id: string | null;
  request_sent_at: string | null;
  request_count: number;
  created_at: string;
}

/** The migration hasn't been applied yet (table or column missing). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /does not exist|could not find the table/i.test(error.message ?? "");
}

/** A PM company's country from its province/state (else its country column). Canada when nothing says. */
export function orgCertCountry(org: { province?: string | null; country?: string | null } | null | undefined): CertCountry {
  const geo = accountGeo(org);
  if (geo?.country === "US" || geo?.country === "CA") return geo.country;
  return org?.country ? regionCountry({ country: org.country }) : "CA";
}

// ── The PM's list ────────────────────────────────────────────────────

export interface LinkedVendorOrg {
  id: string;
  name: string;
  slug: string;
  insurance_status: string | null;
  wsib_status: string | null;
  approved: boolean;
}

/** The organization's certificates (RLS-scoped client) and the PMRFP companies they're linked to. */
export async function loadCertificates(db: Db, orgId: string): Promise<{ ready: boolean; rows: CertRow[]; linked: Map<string, LinkedVendorOrg> }> {
  const { data, error } = await db
    .from("vendor_certificates")
    .select(CERT_COLUMNS)
    .eq("organization_id", orgId)
    .order("expires_on", { ascending: true, nullsFirst: true })
    .limit(1000);
  if (error) {
    if (!isMissingTable(error)) console.error("[vendor-certs] load", error.message);
    return { ready: false, rows: [], linked: new Map() };
  }
  const rows = (data ?? []) as CertRow[];
  return { ready: true, rows, linked: await linkedOrgs(db, rows.map((r) => r.vendor_organization_id).filter((x): x is string => !!x)) };
}

/** The linked trade companies: their profile's own insurance / WSIB status (organizations is readable when approved). */
async function linkedOrgs(db: Db, ids: string[]): Promise<Map<string, LinkedVendorOrg>> {
  const out = new Map<string, LinkedVendorOrg>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const { data } = await db.from("organizations").select("id,name,slug,insurance_status,wsib_status,profile_status").in("id", unique.slice(0, 500));
  for (const o of (data ?? []) as (Omit<LinkedVendorOrg, "approved"> & { profile_status: string })[]) {
    out.set(o.id, { id: o.id, name: o.name, slug: o.slug, insurance_status: o.insurance_status, wsib_status: o.wsib_status, approved: o.profile_status === "approved" });
  }
  return out;
}

/**
 * The vendor's own PMRFP company, when the contact email belongs to a
 * member of a trade, supplier or builder company. Service role: the PM
 * can't read other people's profiles.
 */
export async function findVendorOrg(admin: Db, email: string | null): Promise<string | null> {
  const key = cleanEmail(email);
  if (!key) return null;
  const pattern = key.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: users } = await admin.from("users_profile").select("id").ilike("email", pattern).limit(5);
  const ids = ((users ?? []) as { id: string }[]).map((u) => u.id);
  if (!ids.length) return null;
  const { data: members } = await admin
    .from("organization_members")
    .select("organization_id,organizations(id,organization_type,status)")
    .in("user_id", ids)
    .limit(10);
  for (const m of (members ?? []) as unknown as { organization_id: string; organizations: { organization_type: string; status: string } | null }[]) {
    const o = m.organizations;
    if (o && ["trade_company", "supplier", "builder"].includes(o.organization_type) && o.status !== "deleted") return m.organization_id;
  }
  return null;
}

/** Is this address on the do-not-contact list (bounces, complaints, unsubscribes)? */
async function isSuppressed(admin: Db, email: string): Promise<boolean> {
  const { data } = await admin.from("email_suppressions").select("email_key").eq("email_key", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}

// ── Files ────────────────────────────────────────────────────────────

let bucketChecked = false;

/** Create the private bucket if the migration couldn't (never public). */
async function ensureBucket(admin: Db): Promise<boolean> {
  if (bucketChecked) return true;
  const { data } = await admin.storage.getBucket(CERT_BUCKET);
  if (data) {
    if (data.public) await admin.storage.updateBucket(CERT_BUCKET, { public: false });
    bucketChecked = true;
    return true;
  }
  const { error } = await admin.storage.createBucket(CERT_BUCKET, { public: false, allowedMimeTypes: Object.keys(CERT_MIME), fileSizeLimit: MAX_CERT_BYTES });
  if (error && !/already exists/i.test(error.message)) {
    console.error("[vendor-certs] bucket", error.message);
    return false;
  }
  bucketChecked = true;
  return true;
}

export type FileCheck = { ok: true; data: Buffer; mime: string; name: string | null } | { ok: false; error: "upload" | "tooBig" | "type" };

/** A multipart file → bytes we accept (PDF, JPEG, PNG, WebP up to 10 MB), checked by content, not by name. */
export async function readCertFile(file: FormDataEntryValue | null): Promise<FileCheck> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "upload" };
  if (file.size > MAX_CERT_BYTES) return { ok: false, error: "tooBig" };
  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffCertMime(data.subarray(0, 16));
  if (!mime) return { ok: false, error: "type" };
  return { ok: true, data, mime, name: cleanFileName(file.name) };
}

/** Store a file for a certificate and point the row at it; the old file is removed. */
export async function attachCertFile(admin: Db, cert: { id: string; organization_id: string; file_path: string | null }, file: Extract<FileCheck, { ok: true }>, by: "pm" | "vendor", extra: Record<string, unknown> = {}): Promise<boolean> {
  if (!(await ensureBucket(admin))) return false;
  const path = certPath(cert.organization_id, cert.id, randomBytes(9).toString("base64url"), file.mime);
  const storage = admin.storage.from(CERT_BUCKET);
  const up = await storage.upload(path, file.data, { contentType: file.mime, upsert: false });
  if (up.error) {
    console.error("[vendor-certs] upload", up.error.message);
    return false;
  }
  const { error } = await admin
    .from("vendor_certificates")
    .update({ file_path: path, file_name: file.name, file_uploaded_at: new Date().toISOString(), uploaded_by: by, ...extra })
    .eq("id", cert.id);
  if (error) {
    console.error("[vendor-certs] attach", error.message);
    await storage.remove([path]);
    return false;
  }
  if (cert.file_path && cert.file_path !== path) await storage.remove([cert.file_path]);
  return true;
}

/** A 2-minute signed link to a stored certificate (callers check who's asking). */
export async function signCertFile(admin: Db, path: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(CERT_BUCKET).createSignedUrl(path, 120);
  if (error) console.error("[vendor-certs] sign", error.message);
  return data?.signedUrl ?? null;
}

export async function removeCertFile(admin: Db, path: string | null): Promise<void> {
  if (path) await admin.storage.from(CERT_BUCKET).remove([path]);
}

// ── Request certificate ──────────────────────────────────────────────

export type RequestResult = "sent" | "no_email" | "unsubscribed" | "cooldown" | "limit" | "unavailable" | "not_found";

/**
 * Email the vendor a one-time upload link. Never an address on the
 * do-not-contact list, never twice in 24 hours, at most 50 a day per PM
 * company. Links the vendor's own PMRFP company when the email matches.
 */
export async function requestCertificate(
  certId: string,
  pm: { orgId: string; company: string; country: CertCountry; lang: EmailLang },
  now: Date = new Date(),
): Promise<RequestResult> {
  if (!isServiceConfigured()) return "unavailable";
  const admin = createServiceClient();
  const { data: row, error } = await admin
    .from("vendor_certificates")
    .select("id,organization_id,vendor_name,contact_email,cert_type,request_sent_at,request_count,vendor_organization_id")
    .eq("id", certId)
    .eq("organization_id", pm.orgId)
    .maybeSingle<{ id: string; organization_id: string; vendor_name: string; contact_email: string | null; cert_type: CertType; request_sent_at: string | null; request_count: number; vendor_organization_id: string | null }>();
  if (error || !row) return error && isMissingTable(error) ? "unavailable" : "not_found";
  const email = cleanEmail(row.contact_email);
  if (!email) return "no_email";
  if (await isSuppressed(admin, email)) return "unsubscribed";
  if (!canRequestAgain(row.request_sent_at, now)) return "cooldown";
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { count } = await admin.from("vendor_certificates").select("id", { count: "exact", head: true }).eq("organization_id", pm.orgId).gte("request_sent_at", since);
  if ((count ?? 0) >= DAILY_REQUEST_LIMIT) return "limit";
  const base = BASE();
  const unsub = certUnsubscribeUrl(base, "vendor", row.id);
  if (!unsub) return "unavailable";

  const vendorOrg = row.vendor_organization_id ?? (await findVendorOrg(admin, email));
  const token = generateReviewToken();
  const { error: upErr } = await admin
    .from("vendor_certificates")
    .update({
      request_token_hash: hashReviewToken(token),
      request_expires_at: new Date(now.getTime() + REQUEST_TTL_DAYS * 86_400_000).toISOString(),
      request_sent_at: now.toISOString(),
      request_count: (row.request_count ?? 0) + 1,
      request_lang: pm.lang,
      vendor_organization_id: vendorOrg,
    })
    .eq("id", row.id);
  if (upErr) {
    console.error("[vendor-certs] request", upErr.message);
    return "unavailable";
  }
  await sendVendorCertEmail(
    email,
    certRequestEmail(pm.lang, {
      base,
      company: pm.company,
      vendor: row.vendor_name,
      type: row.cert_type,
      country: pm.country,
      uploadUrl: uploadUrl(base, token, pm.lang),
      unsubscribeUrl: unsub,
      mailingAddress: mailingAddress(),
      onPmrfp: Boolean(vendorOrg),
      ttlDays: REQUEST_TTL_DAYS,
    }),
    pm.lang,
    "vendor-cert-request",
    unsub,
  );
  return "sent";
}

function uploadUrl(base: string, token: string, lang: EmailLang): string {
  return `${base}${localizePath(`/vendor-certificate/${token}`, lang)}`;
}

// ── The vendor's upload link ─────────────────────────────────────────

export type RequestLookup =
  | { state: "invalid" }
  | { state: "expired"; company: string }
  | {
      state: "open";
      certId: string;
      organizationId: string;
      filePath: string | null;
      vendorName: string;
      company: string;
      country: CertCountry;
      type: CertType;
      insurer: string | null;
      policyNumber: string | null;
      coverage: number | null;
      expiresOn: string | null;
      onPmrfp: boolean;
    };

/** Resolve /vendor-certificate/<token>. Any failure (bad token, missing table) reads as "not valid". */
export async function lookupRequest(token: string, now: Date = new Date()): Promise<RequestLookup> {
  if (!isWellFormedToken(token) || !isServiceConfigured()) return { state: "invalid" };
  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("vendor_certificates")
      .select("id,organization_id,vendor_name,cert_type,insurer,policy_number,coverage_amount,expires_on,file_path,vendor_organization_id,request_expires_at")
      .eq("request_token_hash", hashReviewToken(token))
      .maybeSingle<{
        id: string;
        organization_id: string;
        vendor_name: string;
        cert_type: CertType;
        insurer: string | null;
        policy_number: string | null;
        coverage_amount: number | string | null;
        expires_on: string | null;
        file_path: string | null;
        vendor_organization_id: string | null;
        request_expires_at: string | null;
      }>();
    if (error || !data) return { state: "invalid" };
    const { data: org } = await admin.from("organizations").select("name,province,country").eq("id", data.organization_id).maybeSingle<{ name: string; province: string | null; country: string | null }>();
    const company = org?.name ?? "PMRFP";
    if (data.request_expires_at && new Date(data.request_expires_at).getTime() < now.getTime()) return { state: "expired", company };
    const country = orgCertCountry(org);
    return {
      state: "open",
      certId: data.id,
      organizationId: data.organization_id,
      filePath: data.file_path,
      vendorName: data.vendor_name,
      company,
      country,
      type: data.cert_type,
      insurer: data.insurer,
      policyNumber: data.policy_number,
      coverage: data.coverage_amount == null ? null : Number(data.coverage_amount),
      expiresOn: data.expires_on,
      onPmrfp: Boolean(data.vendor_organization_id),
    };
  } catch {
    return { state: "invalid" };
  }
}

// ── Daily reminders (cron) ───────────────────────────────────────────

interface ReminderRow {
  id: string;
  organization_id: string;
  vendor_name: string;
  contact_email: string | null;
  cert_type: CertType;
  expires_on: string | null;
  remind_vendor: boolean;
  reminder_stage: string | null;
  reminder_for: string | null;
  vendor_reminded_stage: string | null;
  vendor_organization_id: string | null;
  request_lang: string | null;
}

export interface ReminderRun {
  ready: boolean;
  orgs: number;
  digests: number;
  vendorReminders: number;
}

/**
 * Once a day: each PM company whose certificates just reached 30, 14 or 0
 * days gets one digest (to its members who haven't turned it off), and
 * vendors the PM opted in get their renewal link at 14 and 0 days. Stamps
 * go on before the send, so a slow or failed run never emails twice.
 */
export async function runCertReminders(admin: Db, now: Date = new Date()): Promise<ReminderRun> {
  const today = isoDay(now);
  const from = isoDay(new Date(now.getTime() - 30 * 86_400_000));
  const to = isoDay(new Date(now.getTime() + 30 * 86_400_000));
  const { data, error } = await admin
    .from("vendor_certificates")
    .select("id,organization_id,vendor_name,contact_email,cert_type,expires_on,remind_vendor,reminder_stage,reminder_for,vendor_reminded_stage,vendor_organization_id,request_lang")
    .gte("expires_on", from)
    .lte("expires_on", to)
    .order("organization_id")
    .limit(5000);
  if (error) {
    if (!isMissingTable(error)) console.error("[vendor-certs] reminders", error.message);
    return { ready: false, orgs: 0, digests: 0, vendorReminders: 0 };
  }
  const rows = (data ?? []) as ReminderRow[];
  const byOrg = new Map<string, { items: DigestItem[]; vendor: { row: ReminderRow; stage: "14" | "0" }[] }>();
  const base = BASE();

  for (const r of rows) {
    const stage = needsReminder(r, today);
    const vStage = vendorReminderStage(r, today);
    if (!stage && !vStage) continue;
    // One write per row: a new expiry (reminder_for changes) also clears the vendor's old stamp.
    const fresh = r.reminder_for !== r.expires_on;
    const patch: Record<string, unknown> = {};
    if (stage) Object.assign(patch, { reminder_stage: stage, reminder_for: r.expires_on });
    if (vStage) Object.assign(patch, { vendor_reminded_stage: vStage, reminder_for: r.expires_on });
    else if (fresh && stage) patch.vendor_reminded_stage = null;
    const { error: stampErr } = await admin.from("vendor_certificates").update(patch).eq("id", r.id);
    if (stampErr) continue;
    const entry = byOrg.get(r.organization_id) ?? { items: [], vendor: [] };
    if (stage && r.expires_on) {
      const days = daysUntil(r.expires_on, today);
      entry.items.push({ vendor: r.vendor_name, type: r.cert_type, expiresOn: r.expires_on, status: certStatus(r.expires_on, today), days });
    }
    if (vStage) entry.vendor.push({ row: r, stage: vStage });
    byOrg.set(r.organization_id, entry);
  }
  if (!byOrg.size) return { ready: true, orgs: 0, digests: 0, vendorReminders: 0 };

  const orgIds = [...byOrg.keys()];
  const [{ data: orgs }, { data: members }] = await Promise.all([
    admin.from("organizations").select("id,name,province,country").in("id", orgIds),
    admin.from("organization_members").select("organization_id,user_id").in("organization_id", orgIds),
  ]);
  const orgById = new Map(((orgs ?? []) as { id: string; name: string; province: string | null; country: string | null }[]).map((o) => [o.id, o]));
  const memberRows = (members ?? []) as { organization_id: string; user_id: string }[];
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  const [{ data: profiles }, { data: prefs }, langs] = await Promise.all([
    userIds.length ? admin.from("users_profile").select("id,email,status").in("id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("notification_preferences").select("user_id,cert_reminders,channel_email").in("user_id", userIds) : Promise.resolve({ data: [] }),
    recipientLangs(admin, userIds),
  ]);
  const profileById = new Map(((profiles ?? []) as { id: string; email: string; status: string }[]).map((p) => [p.id, p]));
  const optedOut = new Set(
    ((prefs ?? []) as { user_id: string; cert_reminders?: boolean | null; channel_email?: boolean | null }[])
      .filter((p) => p.cert_reminders === false || p.channel_email === false)
      .map((p) => p.user_id),
  );
  const emails = [...profileById.values()].map((p) => p.email?.trim().toLowerCase()).filter(Boolean) as string[];
  const vendorEmails = [...byOrg.values()].flatMap((e) => e.vendor.map((v) => cleanEmail(v.row.contact_email))).filter((e): e is string => !!e);
  const suppressed = new Set<string>();
  const keys = [...new Set([...emails, ...vendorEmails])];
  for (let i = 0; i < keys.length; i += 150) {
    const { data: s } = await admin.from("email_suppressions").select("email_key").in("email_key", keys.slice(i, i + 150));
    for (const x of (s ?? []) as { email_key: string }[]) suppressed.add(x.email_key);
  }

  let digests = 0;
  let vendorReminders = 0;
  for (const [orgId, entry] of byOrg) {
    const org = orgById.get(orgId);
    if (!org) continue;
    const country = orgCertCountry(org);
    if (entry.items.length) {
      const recipients = memberRows
        .filter((m) => m.organization_id === orgId && !optedOut.has(m.user_id))
        .map((m) => profileById.get(m.user_id))
        .filter((p): p is { id: string; email: string; status: string } => !!p && p.status === "active" && !!cleanEmail(p.email) && !suppressed.has(p.email.trim().toLowerCase()))
        .slice(0, 10);
      const items = entry.items.sort((a, b) => a.days - b.days);
      for (const p of recipients) {
        const lang = langs.get(p.id) ?? "en";
        const unsub = certUnsubscribeUrl(base, "digest", p.id);
        await sendVendorCertEmail(p.email, certDigestEmail(lang, { base, company: org.name, country, items, unsubscribeUrl: unsub }), lang, "vendor-cert-digest", unsub);
        digests++;
      }
    }
    for (const { row, stage } of entry.vendor) {
      const email = cleanEmail(row.contact_email);
      if (!email || suppressed.has(email) || !row.expires_on) continue;
      const unsub = certUnsubscribeUrl(base, "vendor", row.id);
      if (!unsub) continue;
      // A fresh one-time link (the old one, if any, stops working).
      const token = generateReviewToken();
      const { error: tokErr } = await admin
        .from("vendor_certificates")
        .update({ request_token_hash: hashReviewToken(token), request_expires_at: new Date(now.getTime() + REQUEST_TTL_DAYS * 86_400_000).toISOString() })
        .eq("id", row.id);
      if (tokErr) continue;
      const lang = emailLang(row.request_lang);
      await sendVendorCertEmail(
        email,
        certReminderEmail(lang, {
          base,
          company: org.name,
          vendor: row.vendor_name,
          type: row.cert_type,
          country,
          uploadUrl: uploadUrl(base, token, lang),
          unsubscribeUrl: unsub,
          mailingAddress: mailingAddress(),
          onPmrfp: Boolean(row.vendor_organization_id),
          expiresOn: row.expires_on,
          past: stage === "0" && daysUntil(row.expires_on, today) < 0,
        }),
        lang,
        "vendor-cert-renewal",
        unsub,
      );
      vendorReminders++;
    }
  }
  return { ready: true, orgs: byOrg.size, digests, vendorReminders };
}
