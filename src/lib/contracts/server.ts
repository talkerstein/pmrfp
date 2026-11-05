import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { rfpPrivateFields } from "@/lib/data/rfp-private";
import { accountGeo, regionCountry } from "@/lib/visitor-geo";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { sendTownJobEmail } from "@/lib/email/send";
import { contractUnsubscribeUrl } from "@/lib/email/unsubscribe";
import { recipientLangs } from "@/lib/pm-jobs/server";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { CERT_MIME, MAX_CERT_BYTES, cleanEmail } from "@/lib/vendor-certs/rules";
import { findVendorOrg, isMissingTable, readCertFile, type FileCheck } from "@/lib/vendor-certs/server";
import type { SessionContext } from "@/lib/access/access";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDate } from "@/i18n/format";
import { tradeName } from "@/i18n/terms";
import type { Locale } from "@/i18n/config";
import { renewalDigestEmail, type DigestContract } from "./email-copy";
import {
  CONTRACT_BUCKET,
  buildRetenderPrefill,
  contractPath,
  isoDay,
  needsRenewalReminder,
  type ContractCountry,
  type RetenderPrefill,
  type RetenderSource,
  type TradeOption,
} from "./rules";

/**
 * Contract Renewal Calendar: everything that touches the database,
 * storage or email. The PM's own reads and edits go through their
 * signed-in client (RLS: their organization's rows only); the RFP links,
 * the file, the linked PMRFP vendor and the cron's stamps go through the
 * service role here, after an ownership check through the PM's client.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { isMissingTable };

/** The vendor insurance tracker's checks fit contracts too: PDF, JPEG, PNG or WebP up to 10 MB, by content. */
export const readContractFile = readCertFile;

export const CONTRACT_COLUMNS =
  "id,organization_id,building_name,building_address,trade_slug,service_detail,vendor_name,vendor_email,start_date,end_date,annual_value,currency,notice_days,auto_renews,notes,starter_key,vendor_organization_id,source_rfp_id,retender_rfp_id,retendered_at,file_path,file_name,file_uploaded_at,created_at";

export interface ContractRow {
  id: string;
  organization_id: string;
  building_name: string | null;
  building_address: string | null;
  trade_slug: string | null;
  service_detail: string | null;
  vendor_name: string | null;
  vendor_email: string | null;
  start_date: string | null;
  end_date: string | null;
  annual_value: number | string | null;
  currency: "CAD" | "USD";
  notice_days: number;
  auto_renews: boolean;
  notes: string | null;
  starter_key: string | null;
  vendor_organization_id: string | null;
  source_rfp_id: string | null;
  retender_rfp_id: string | null;
  retendered_at: string | null;
  file_path: string | null;
  file_name: string | null;
  file_uploaded_at: string | null;
  created_at: string;
}

/** A PM company's country from its province/state (else its country column). Canada when nothing says. */
export function orgContractCountry(org: { province?: string | null; country?: string | null } | null | undefined): ContractCountry {
  const geo = accountGeo(org);
  if (geo?.country === "US" || geo?.country === "CA") return geo.country;
  return org?.country ? regionCountry({ country: org.country }) : "CA";
}

/** The signed-in PM's country (their company's location first). */
export async function pmCountry(session: SessionContext): Promise<ContractCountry> {
  const geo = await getAccountGeo(session).catch(() => null);
  return geo?.country === "US" || geo?.country === "CA" ? geo.country : orgContractCountry(session.organization);
}

// ── The PM's list ────────────────────────────────────────────────────

export interface LinkedVendor {
  id: string;
  name: string;
  slug: string | null;
}

export interface LinkedRfp {
  id: string;
  title: string;
  status: string;
}

/** The company's contracts (RLS-scoped client), the PMRFP vendors they're linked to, and the RFPs they point at. */
export async function loadContracts(
  db: Db,
  orgId: string,
): Promise<{ ready: boolean; rows: ContractRow[]; vendors: Map<string, LinkedVendor>; rfps: Map<string, LinkedRfp> }> {
  const { data, error } = await db
    .from("service_contracts")
    .select(CONTRACT_COLUMNS)
    .eq("organization_id", orgId)
    .order("end_date", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) {
    if (!isMissingTable(error)) console.error("[contracts] load", error.message);
    return { ready: false, rows: [], vendors: new Map(), rfps: new Map() };
  }
  const rows = (data ?? []) as ContractRow[];
  const vendorIds = [...new Set(rows.map((r) => r.vendor_organization_id).filter((x): x is string => !!x))];
  const rfpIds = [...new Set(rows.flatMap((r) => [r.source_rfp_id, r.retender_rfp_id]).filter((x): x is string => !!x))];
  const [vendorRes, rfpRes] = await Promise.all([
    vendorIds.length ? db.from("organizations").select("id,name,slug,profile_status").in("id", vendorIds.slice(0, 500)) : Promise.resolve({ data: [] }),
    rfpIds.length ? db.from("rfp_posts").select("id,title,status").in("id", rfpIds.slice(0, 500)) : Promise.resolve({ data: [] }),
  ]);
  const vendors = new Map<string, LinkedVendor>();
  for (const o of (vendorRes.data ?? []) as { id: string; name: string; slug: string; profile_status: string }[]) {
    vendors.set(o.id, { id: o.id, name: o.name, slug: o.profile_status === "approved" ? o.slug : null });
  }
  const rfps = new Map<string, LinkedRfp>();
  for (const r of (rfpRes.data ?? []) as LinkedRfp[]) rfps.set(r.id, r);
  return { ready: true, rows, vendors, rfps };
}

/** RFPs this PM (or their company) posted that a contract could have come from. */
export async function ownRfps(db: Db, session: SessionContext): Promise<LinkedRfp[]> {
  const owner = [`posted_by_user_id.eq.${session.userId}`];
  if (session.organization) owner.push(`posted_by_organization_id.eq.${session.organization.id}`);
  const { data, error } = await db
    .from("rfp_posts")
    .select("id,title,status")
    .or(owner.join(","))
    .in("status", ["published", "closed", "awarded", "archived"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as LinkedRfp[];
}

/** Link the vendor's own PMRFP company when its email matches (best effort, service role). */
export async function linkVendorOrg(contractId: string, email: string | null): Promise<void> {
  if (!isServiceConfigured()) return;
  const admin = createServiceClient();
  const orgId = email ? await findVendorOrg(admin, email).catch(() => null) : null;
  await admin.from("service_contracts").update({ vendor_organization_id: orgId }).eq("id", contractId);
}

/**
 * Point a contract at the RFP it came from (or clear it). The RFP is read
 * through the PM's own client and must be theirs or their company's; the
 * write is the service role's (the column has no client grant).
 */
export async function setSourceRfp(db: Db, session: SessionContext, contractId: string, rfpId: string | null): Promise<boolean> {
  if (!isServiceConfigured()) return false;
  if (rfpId) {
    if (!UUID.test(rfpId)) return false;
    const owner = [`posted_by_user_id.eq.${session.userId}`];
    if (session.organization) owner.push(`posted_by_organization_id.eq.${session.organization.id}`);
    const { data } = await db.from("rfp_posts").select("id").eq("id", rfpId).or(owner.join(",")).maybeSingle();
    if (!data) return false;
  }
  const { error } = await createServiceClient().from("service_contracts").update({ source_rfp_id: rfpId }).eq("id", contractId);
  if (error) console.error("[contracts] source rfp", error.message);
  return !error;
}

// ── Files ────────────────────────────────────────────────────────────

let bucketChecked = false;

/** Create the private bucket if the migration couldn't (never public). */
async function ensureBucket(admin: Db): Promise<boolean> {
  if (bucketChecked) return true;
  const { data } = await admin.storage.getBucket(CONTRACT_BUCKET);
  if (data) {
    if (data.public) await admin.storage.updateBucket(CONTRACT_BUCKET, { public: false });
    bucketChecked = true;
    return true;
  }
  const { error } = await admin.storage.createBucket(CONTRACT_BUCKET, { public: false, allowedMimeTypes: Object.keys(CERT_MIME), fileSizeLimit: MAX_CERT_BYTES });
  if (error && !/already exists/i.test(error.message)) {
    console.error("[contracts] bucket", error.message);
    return false;
  }
  bucketChecked = true;
  return true;
}

/** Store a contract file and point the row at it; the old file is removed. */
export async function attachContractFile(admin: Db, row: { id: string; organization_id: string; file_path: string | null }, file: Extract<FileCheck, { ok: true }>): Promise<boolean> {
  if (!(await ensureBucket(admin))) return false;
  const path = contractPath(row.organization_id, row.id, randomBytes(9).toString("base64url"), file.mime);
  const storage = admin.storage.from(CONTRACT_BUCKET);
  const up = await storage.upload(path, file.data, { contentType: file.mime, upsert: false });
  if (up.error) {
    console.error("[contracts] upload", up.error.message);
    return false;
  }
  const { error } = await admin
    .from("service_contracts")
    .update({ file_path: path, file_name: file.name, file_uploaded_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    console.error("[contracts] attach", error.message);
    await storage.remove([path]);
    return false;
  }
  if (row.file_path && row.file_path !== path) await storage.remove([row.file_path]);
  return true;
}

/** A 2-minute signed link to a stored contract (callers check who's asking). */
export async function signContractFile(admin: Db, path: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(CONTRACT_BUCKET).createSignedUrl(path, 120);
  if (error) console.error("[contracts] sign", error.message);
  return data?.signedUrl ?? null;
}

export async function removeContractFile(admin: Db, path: string | null): Promise<void> {
  if (path) await admin.storage.from(CONTRACT_BUCKET).remove([path]);
}

// ── Re-tender on PMRFP ───────────────────────────────────────────────

/**
 * /pm-dashboard/rfps/new?contract=<id>: the RFP form's defaults from one
 * of the PM's contracts (RLS: only their company's), cloning the RFP it
 * came from when there is one. Null when the id isn't theirs (or the
 * table isn't there yet): the form opens blank.
 */
export async function retenderDefaults(session: SessionContext, contractId: string, lang: Locale, trades: readonly TradeOption[]): Promise<RetenderPrefill | null> {
  if (!UUID.test(contractId) || !session.organization) return null;
  try {
    const db = await createClient();
    const { data: c } = await db
      .from("service_contracts")
      .select("id,building_name,building_address,trade_slug,service_detail,start_date,end_date,auto_renews,annual_value,notes,source_rfp_id")
      .eq("id", contractId)
      .maybeSingle<{
        id: string;
        building_name: string | null;
        building_address: string | null;
        trade_slug: string | null;
        service_detail: string | null;
        start_date: string | null;
        end_date: string | null;
        auto_renews: boolean;
        annual_value: number | string | null;
        notes: string | null;
        source_rfp_id: string | null;
      }>();
    if (!c) return null;
    const source = c.source_rfp_id ? await loadSource(db, c.source_rfp_id) : null;
    const trade = c.trade_slug ? trades.find((t) => t.slug === c.trade_slug) : undefined;
    const country = await pmCountry(session);
    return buildRetenderPrefill({
      contract: { ...c, annual_value: c.annual_value == null ? null : Number(c.annual_value) },
      source,
      tradeName: trade ? tradeName(trade.name, lang) : null,
      today: isoDay(new Date()),
      copy: getDictionary(lang).contracts.prefill[country],
      day: (iso) => formatDate(iso, lang),
    });
  } catch (e) {
    console.error("[contracts] prefill", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The RFP a contract came from, as its poster can read it (RLS: their own). */
async function loadSource(db: Db, rfpId: string): Promise<RetenderSource | null> {
  const { data } = await db
    .from("rfp_posts")
    .select("summary,scope,requirements,submission_instructions,city,province,regions(slug),property_types(slug),rfp_categories(trade_categories(slug))")
    .eq("id", rfpId)
    .maybeSingle();
  if (!data) return null;
  const priv = await rfpPrivateFields(db, rfpId);
  const r = { ...(data as object), budget_min: priv?.budget_min ?? null, budget_max: priv?.budget_max ?? null } as unknown as {
    summary: string | null;
    scope: string | null;
    requirements: string | null;
    submission_instructions: string | null;
    city: string | null;
    province: string | null;
    budget_min: number | string | null;
    budget_max: number | string | null;
    regions: { slug: string } | null;
    property_types: { slug: string } | null;
    rfp_categories: { trade_categories: { slug: string } | null }[] | null;
  };
  return {
    summary: r.summary,
    scope: r.scope,
    requirements: r.requirements,
    submission_instructions: r.submission_instructions,
    city: r.city,
    province: r.province,
    budget_min: r.budget_min == null ? null : Number(r.budget_min),
    budget_max: r.budget_max == null ? null : Number(r.budget_max),
    region_slug: r.regions?.slug ?? null,
    property_type_slug: r.property_types?.slug ?? null,
    categories: (r.rfp_categories ?? []).map((x) => x.trade_categories?.slug).filter((s): s is string => !!s),
  };
}

/**
 * After "Re-tender on PMRFP" posts (lib/dashboard/actions createRfpAction):
 * stamp the new RFP on the contract. The contract is read through the
 * poster's own client first (RLS: their company's), so a forged contract id
 * does nothing. Best effort: posting never fails because of this.
 */
export async function linkRetenderRfp(db: Db, contractId: FormDataEntryValue | null, rfpId: string): Promise<void> {
  try {
    const id = typeof contractId === "string" ? contractId.trim() : "";
    if (!UUID.test(id) || !isServiceConfigured()) return;
    const { data } = await db.from("service_contracts").select("id").eq("id", id).maybeSingle();
    if (!data) return;
    const { error } = await createServiceClient()
      .from("service_contracts")
      .update({ retender_rfp_id: rfpId, retendered_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("[contracts] link retender", error.message);
  } catch (e) {
    console.error("[contracts] link retender", e instanceof Error ? e.message : e);
  }
}

// ── Daily reminders (cron) ───────────────────────────────────────────

interface ReminderRow {
  id: string;
  organization_id: string;
  building_name: string | null;
  trade_slug: string | null;
  service_detail: string | null;
  vendor_name: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_renews: boolean;
  notice_days: number;
  retender_rfp_id: string | null;
  reminder_stage: string | null;
  reminder_for: string | null;
}

export interface ContractReminderRun {
  ready: boolean;
  orgs: number;
  contracts: number;
  digests: number;
}

/** The emails' service name: the trade in the reader's language, with the PM's own description. */
function serviceName(r: { trade_slug: string | null; service_detail: string | null }, trades: Map<string, string>, lang: EmailLang): string {
  const name = r.trade_slug ? trades.get(r.trade_slug) : undefined;
  const trade = name ? tradeName(name, lang) : null;
  if (trade && r.service_detail) return `${trade} (${r.service_detail})`;
  return trade ?? r.service_detail ?? "";
}

/**
 * Once a day: each PM company whose contracts just entered their renewal
 * window, reached 14 days or hit their end date gets one digest (to its
 * members who haven't turned it off). Once per stage per end date; already
 * re-tendered contracts are skipped. Stamps go on before the send, so a
 * slow or failed run never emails twice.
 */
export async function runContractReminders(admin: Db, now: Date = new Date()): Promise<ContractReminderRun> {
  const today = isoDay(now);
  const from = isoDay(new Date(now.getTime() - 7 * 86_400_000));
  const to = isoDay(new Date(now.getTime() + 366 * 86_400_000));
  const { data, error } = await admin
    .from("service_contracts")
    .select("id,organization_id,building_name,trade_slug,service_detail,vendor_name,start_date,end_date,auto_renews,notice_days,retender_rfp_id,reminder_stage,reminder_for")
    .not("end_date", "is", null)
    .is("retender_rfp_id", null)
    .lte("end_date", to)
    .or(`auto_renews.eq.true,end_date.gte.${from}`)
    .order("organization_id")
    .limit(5000);
  if (error) {
    if (!isMissingTable(error)) console.error("[contracts] reminders", error.message);
    return { ready: false, orgs: 0, contracts: 0, digests: 0 };
  }

  const byOrg = new Map<string, { row: ReminderRow; end: string; days: number; stage: DigestContract["stage"] }[]>();
  let contracts = 0;
  for (const r of (data ?? []) as ReminderRow[]) {
    const due = needsRenewalReminder(r, today);
    if (!due) continue;
    const { error: stampErr } = await admin.from("service_contracts").update({ reminder_stage: due.stage, reminder_for: due.end }).eq("id", r.id);
    if (stampErr) continue;
    const list = byOrg.get(r.organization_id) ?? [];
    list.push({ row: r, ...due });
    byOrg.set(r.organization_id, list);
    contracts++;
  }
  if (!byOrg.size) return { ready: true, orgs: 0, contracts: 0, digests: 0 };

  const orgIds = [...byOrg.keys()];
  const [{ data: orgs }, { data: members }, { data: tradeRows }] = await Promise.all([
    admin.from("organizations").select("id,name,province,country").in("id", orgIds),
    admin.from("organization_members").select("organization_id,user_id").in("organization_id", orgIds),
    admin.from("trade_categories").select("slug,name"),
  ]);
  const orgById = new Map(((orgs ?? []) as { id: string; name: string; province: string | null; country: string | null }[]).map((o) => [o.id, o]));
  const trades = new Map(((tradeRows ?? []) as { slug: string; name: string }[]).map((t) => [t.slug, t.name]));
  const memberRows = (members ?? []) as { organization_id: string; user_id: string }[];
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  const [{ data: profiles }, { data: prefs }, langs] = await Promise.all([
    userIds.length ? admin.from("users_profile").select("id,email,status").in("id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("notification_preferences").select("user_id,contract_reminders,channel_email").in("user_id", userIds) : Promise.resolve({ data: [] }),
    recipientLangs(admin, userIds),
  ]);
  const profileById = new Map(((profiles ?? []) as { id: string; email: string; status: string }[]).map((p) => [p.id, p]));
  const optedOut = new Set(
    ((prefs ?? []) as { user_id: string; contract_reminders?: boolean | null; channel_email?: boolean | null }[])
      .filter((p) => p.contract_reminders === false || p.channel_email === false)
      .map((p) => p.user_id),
  );
  const keys = [...new Set([...profileById.values()].map((p) => cleanEmail(p.email)).filter((e): e is string => !!e))];
  const suppressed = new Set<string>();
  for (let i = 0; i < keys.length; i += 150) {
    const { data: s } = await admin.from("email_suppressions").select("email_key").in("email_key", keys.slice(i, i + 150));
    for (const x of (s ?? []) as { email_key: string }[]) suppressed.add(x.email_key);
  }

  const base = BASE();
  let digests = 0;
  for (const [orgId, due] of byOrg) {
    const org = orgById.get(orgId);
    if (!org) continue;
    const country = orgContractCountry(org);
    const recipients = memberRows
      .filter((m) => m.organization_id === orgId && !optedOut.has(m.user_id))
      .map((m) => profileById.get(m.user_id))
      .filter((p): p is { id: string; email: string; status: string } => {
        const key = cleanEmail(p?.email);
        return !!p && p.status === "active" && !!key && !suppressed.has(key);
      })
      .slice(0, 10);
    const sorted = [...due].sort((a, b) => a.days - b.days);
    for (const p of recipients) {
      const lang = langs.get(p.id) ?? "en";
      const items: DigestContract[] = sorted.map((d) => ({
        id: d.row.id,
        service: serviceName(d.row, trades, lang),
        building: d.row.building_name,
        vendor: d.row.vendor_name,
        end: d.end,
        days: d.days,
        stage: d.stage,
        autoRenews: d.row.auto_renews,
      }));
      const unsub = contractUnsubscribeUrl(base, p.id);
      // The shared shell with one-click List-Unsubscribe headers (the town and tracker emails use the same one).
      await sendTownJobEmail(p.email, renewalDigestEmail(lang, { base, company: org.name, country, items, unsubscribeUrl: unsub }), lang, "contract-renewal-digest", unsub);
      digests++;
    }
  }
  return { ready: true, orgs: byOrg.size, contracts, digests };
}
