import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendTownJobEmail } from "@/lib/email/send";
import { loadJobForDecision, ownsJob, pickResponse, type Actor } from "@/lib/pm-jobs/decisions";
import { isOpenResponse, type ContactCard } from "@/lib/pm-jobs/rules";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { isSchemaMissing } from "@/lib/projects/compat";
import { findVendorOrg, isMissingTable, orgCertCountry, readCertFile, type FileCheck } from "@/lib/vendor-certs/server";
import { CERT_BUCKET, CERT_MIME, MAX_CERT_BYTES, certStatus, cleanEmail, isoDay, type CertType } from "@/lib/vendor-certs/rules";
import { bidAwardEmail, bidInviteEmail } from "./email-copy";
import { bidUnsubscribeUrl } from "./unsubscribe";
import { hashShareToken, isShareToken, newShareToken, shareTokenOpens } from "./share";
import { DAILY_INVITE_LIMIT, MAX_BIDS, planInvites, type BidCountry, type InvitePlan, type TrackerCert } from "./rules";
import { sortBids, type BidRow, type BidderOrg, type ComparisonRow } from "./view";

/**
 * Bid Comparison Sheet: everything that touches the database, storage or
 * email. The PM's own reads and edits go through their signed-in client
 * (RLS: their company's rows only). The service role here handles what a
 * PM may not write themselves: the linked PMRFP company, the response a
 * bid came from, the quote file, the share link, the award and the invite
 * stamp. Every service-role function re-checks the PM's company itself.
 */

type Db = SupabaseClient;

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
const mailingAddress = () => process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;

export { isMissingTable };

export const COMPARISON_COLS =
  "id,organization_id,created_by,title,building_name,building_address,trade,country,rfp_id,scope_items,recommendation,recommended_bid_id,share_created_at,awarded_at,awarded_bid_id,awarded_company,awarded_amount,award_rfp_recorded,award_notified_at,created_at,updated_at";

export const BID_COLS =
  "id,comparison_id,organization_id,position,company_name,contact_email,total_price,tax_amount,tax_percent,line_prices,start_date,duration,warranty,payment_terms,notes,bidder_organization_id,rfp_interest_id,file_path,file_name,file_uploaded_at,invited_at,created_at";

/** The PM company's country: the comparison's currency and tax wording. */
export function companyCountry(org: { province?: string | null; country?: string | null } | null | undefined): BidCountry {
  return orgCertCountry(org);
}

// ── The PM's comparisons ─────────────────────────────────────────────

export interface ComparisonSummary {
  id: string;
  title: string;
  building_name: string | null;
  trade: string | null;
  rfp_id: string | null;
  awarded_at: string | null;
  awarded_company: string | null;
  updated_at: string;
  bids: number;
}

/** The company's comparisons, newest first, with bid counts (RLS-scoped client). */
export async function listComparisons(db: Db, orgId: string): Promise<{ ready: boolean; rows: ComparisonSummary[] }> {
  const { data, error } = await db
    .from("bid_comparisons")
    .select("id,title,building_name,trade,rfp_id,awarded_at,awarded_company,updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    if (!isMissingTable(error)) console.error("[bid-compare] list", error.message);
    return { ready: false, rows: [] };
  }
  const rows = (data ?? []) as Omit<ComparisonSummary, "bids">[];
  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: bids } = await db.from("bid_comparison_bids").select("comparison_id").in("comparison_id", rows.map((r) => r.id));
    for (const b of (bids ?? []) as { comparison_id: string }[]) counts.set(b.comparison_id, (counts.get(b.comparison_id) ?? 0) + 1);
  }
  return { ready: true, rows: rows.map((r) => ({ ...r, bids: counts.get(r.id) ?? 0 })) };
}

/** One comparison and its bids (RLS-scoped client: another company's id reads as not found). */
export async function loadComparison(db: Db, id: string): Promise<{ ready: boolean; comparison: ComparisonRow | null; bids: BidRow[] }> {
  const { data, error } = await db.from("bid_comparisons").select(COMPARISON_COLS).eq("id", id).maybeSingle<ComparisonRow>();
  if (error) {
    if (!isMissingTable(error)) console.error("[bid-compare] load", error.message);
    return { ready: !isMissingTable(error), comparison: null, bids: [] };
  }
  if (!data) return { ready: true, comparison: null, bids: [] };
  const { data: bids } = await db.from("bid_comparison_bids").select(BID_COLS).eq("comparison_id", id).limit(MAX_BIDS + 2);
  return { ready: true, comparison: data, bids: sortBids((bids ?? []) as BidRow[]) };
}

/**
 * The bidders' PMRFP companies and what their profiles say about cover.
 * Service role when available (a linked company may not be approved yet),
 * else the given client.
 */
export async function bidderOrgs(db: Db, ids: (string | null)[]): Promise<Map<string, BidderOrg>> {
  const out = new Map<string, BidderOrg>();
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return out;
  const client = isServiceConfigured() ? createServiceClient() : db;
  const { data } = await client.from("organizations").select("id,name,slug,insurance_status,wsib_status,profile_status").in("id", unique.slice(0, 50));
  for (const o of (data ?? []) as (Omit<BidderOrg, "approved"> & { profile_status: string | null })[]) {
    out.set(o.id, { id: o.id, name: o.name, slug: o.slug, insurance_status: o.insurance_status, wsib_status: o.wsib_status, approved: o.profile_status === "approved" });
  }
  return out;
}

/**
 * The company's vendor insurance tracker rows (the free tool from
 * 20261101000100), with today's status. Empty when the tracker isn't
 * switched on yet.
 */
export async function trackerCerts(db: Db, orgId: string, now: Date = new Date()): Promise<TrackerCert[]> {
  const { data, error } = await db
    .from("vendor_certificates")
    .select("vendor_name,contact_email,vendor_organization_id,cert_type,expires_on")
    .eq("organization_id", orgId)
    .limit(1000);
  if (error) return [];
  const today = isoDay(now);
  return ((data ?? []) as { vendor_name: string; contact_email: string | null; vendor_organization_id: string | null; cert_type: CertType; expires_on: string | null }[]).map((r) => ({
    vendor_name: r.vendor_name,
    contact_email: r.contact_email,
    vendor_organization_id: r.vendor_organization_id,
    cert_type: r.cert_type,
    status: certStatus(r.expires_on, today),
  }));
}

/** The PM's own RFPs on PMRFP, to link a comparison to (RLS: their own posts). */
export async function myRfps(db: Db, p: { userId: string; orgId: string }): Promise<{ id: string; title: string; status: string }[]> {
  const { data } = await db
    .from("rfp_posts")
    .select("id,title,status,created_at")
    .or(`posted_by_user_id.eq.${p.userId},posted_by_organization_id.eq.${p.orgId}`)
    .in("status", ["published", "closed", "expired", "awarded", "pending_review"])
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as { id: string; title: string; status: string }[]).map((r) => ({ id: r.id, title: r.title, status: r.status }));
}

// ── Linking a bidder to a PMRFP company ──────────────────────────────

export interface OrgHit {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  insurance_status: string | null;
  wsib_status: string | null;
}

const BIDDER_TYPES = ["trade_company", "supplier", "builder"];

/** Approved trade, supplier and builder companies by name, in the PM's country only. */
export async function searchBidderOrgs(db: Db, q: string, country: BidCountry): Promise<OrgHit[]> {
  const term = q.replace(/\s+/g, " ").trim().slice(0, 80);
  if (term.length < 2) return [];
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data } = await db
    .from("organizations")
    .select("id,name,city,province,country,insurance_status,wsib_status")
    .in("organization_type", BIDDER_TYPES)
    .eq("profile_status", "approved")
    .ilike("name", pattern)
    .order("name")
    .limit(30);
  return ((data ?? []) as (OrgHit & { country: string | null })[])
    .filter((o) => orgCertCountry(o) === country)
    .slice(0, 8)
    .map(({ id, name, city, province, insurance_status, wsib_status }) => ({ id, name, city, province, insurance_status, wsib_status }));
}

/** A company id the PM picked: only an approved bidder company in the PM's own country. */
export async function checkBidderOrg(db: Db, id: string, country: BidCountry): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("id,organization_type,profile_status,province,country")
    .eq("id", id)
    .maybeSingle<{ id: string; organization_type: string; profile_status: string; province: string | null; country: string | null }>();
  return Boolean(data && BIDDER_TYPES.includes(data.organization_type) && data.profile_status === "approved" && orgCertCountry(data) === country);
}

/**
 * Set (or clear) a bid's PMRFP company. Service role: the column isn't the
 * PM's to write. With no company picked, the contact email may still match
 * a member of one. A bid pulled in from an RFP response keeps its company.
 */
export async function linkBidder(bid: { id: string; organization_id: string; rfp_interest_id: string | null }, p: { orgId: string | null; email: string | null }): Promise<void> {
  if (!isServiceConfigured() || bid.rfp_interest_id) return;
  const admin = createServiceClient();
  const orgId = p.orgId ?? (p.email ? await findVendorOrg(admin, p.email).catch(() => null) : null);
  await admin.from("bid_comparison_bids").update({ bidder_organization_id: orgId }).eq("id", bid.id).eq("organization_id", bid.organization_id);
}

// ── Pull in the responses to the linked RFP ──────────────────────────

export type ImportResult = { ok: true; added: number; full: boolean } | { ok: false; error: "notFound" | "rfp" | "unavailable" };

interface InterestPick {
  id: string;
  trade_organization_id: string;
  status: string;
  created_at: string;
  quote_amount?: number | string | null;
  start_date?: string | null;
  quote_notes?: string | null;
}

/**
 * Add the trades that responded to the comparison's RFP as bids (price,
 * start date and notes as they gave them). Only the RFP's poster, a member
 * of the posting company or an admin; never twice for one response; never
 * past 6 bids. Contact details stay where the RFP flow keeps them.
 */
export async function importRfpResponses(comparisonId: string, actor: Actor & { organizationId: string }): Promise<ImportResult> {
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const admin = createServiceClient();
  const { data: cmp, error } = await admin
    .from("bid_comparisons")
    .select("id,organization_id,rfp_id")
    .eq("id", comparisonId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle<{ id: string; organization_id: string; rfp_id: string | null }>();
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (!cmp) return { ok: false, error: "notFound" };
  if (!cmp.rfp_id) return { ok: false, error: "rfp" };
  const job = await loadJobForDecision(admin, cmp.rfp_id);
  if (!job || !ownsJob(job, actor)) return { ok: false, error: "rfp" };

  const read = (cols: string) => admin.from("rfp_interests").select(cols).eq("rfp_id", job.id).order("created_at", { ascending: true }).limit(100);
  let res = await read("id,trade_organization_id,status,created_at,quote_amount,start_date,quote_notes");
  if (isSchemaMissing(res.error)) res = await read("id,trade_organization_id,status,created_at");
  if (res.error) return { ok: false, error: "unavailable" };
  const responses = ((res.data ?? []) as unknown as InterestPick[]).filter((r) => isOpenResponse(r.status) || r.status === "picked");

  const { data: existing } = await admin.from("bid_comparison_bids").select("id,position,rfp_interest_id").eq("comparison_id", cmp.id);
  const have = (existing ?? []) as { id: string; position: number; rfp_interest_id: string | null }[];
  const already = new Set(have.map((b) => b.rfp_interest_id).filter(Boolean));
  const fresh = responses.filter((r) => !already.has(r.id));
  const room = Math.max(0, MAX_BIDS - have.length);
  const take = fresh.slice(0, room);
  if (!take.length) return { ok: true, added: 0, full: fresh.length > 0 };

  const { data: orgs } = await admin.from("organizations").select("id,name").in("id", [...new Set(take.map((r) => r.trade_organization_id))]);
  const names = new Map(((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  let position = have.reduce((m, b) => Math.max(m, b.position + 1), 0);
  const rows = take.map((r) => ({
    comparison_id: cmp.id,
    organization_id: cmp.organization_id,
    created_by: actor.userId,
    position: Math.min(99, position++),
    company_name: (names.get(r.trade_organization_id) ?? "—").slice(0, 160),
    total_price: r.quote_amount == null ? null : Number(r.quote_amount),
    start_date: r.start_date ?? null,
    notes: r.quote_notes ? r.quote_notes.slice(0, 2000) : null,
    bidder_organization_id: r.trade_organization_id,
    rfp_interest_id: r.id,
  }));
  const { error: insErr } = await admin.from("bid_comparison_bids").insert(rows);
  if (insErr) {
    console.error("[bid-compare] import", insErr.message);
    return { ok: false, error: "unavailable" };
  }
  await admin.from("bid_comparisons").update({ updated_at: new Date().toISOString() }).eq("id", cmp.id);
  return { ok: true, added: rows.length, full: fresh.length > rows.length };
}

// ── Quote files (the private vendor-certificates bucket, under quotes/) ──

let bucketChecked = false;

/** The private bucket from 20261101000100; created (never public) if that migration couldn't. */
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
    console.error("[bid-compare] bucket", error.message);
    return false;
  }
  bucketChecked = true;
  return true;
}

/** PDF, JPEG, PNG or WebP up to 10 MB, checked by content (the tracker's own check). */
export const readQuoteFile = readCertFile;

export function quotePath(orgId: string, comparisonId: string, bidId: string, nonce: string, mime: string): string {
  return `quotes/${orgId}/${comparisonId}/${bidId}/${nonce}.${CERT_MIME[mime] ?? "bin"}`;
}

/** Store a bid's quote file and point the bid at it; the old file is removed. */
export async function attachQuoteFile(admin: Db, bid: { id: string; organization_id: string; comparison_id: string; file_path: string | null }, file: Extract<FileCheck, { ok: true }>): Promise<boolean> {
  if (!(await ensureBucket(admin))) return false;
  const path = quotePath(bid.organization_id, bid.comparison_id, bid.id, randomBytes(9).toString("base64url"), file.mime);
  const storage = admin.storage.from(CERT_BUCKET);
  const up = await storage.upload(path, file.data, { contentType: file.mime, upsert: false });
  if (up.error) {
    console.error("[bid-compare] upload", up.error.message);
    return false;
  }
  const { error } = await admin
    .from("bid_comparison_bids")
    .update({ file_path: path, file_name: file.name, file_uploaded_at: new Date().toISOString() })
    .eq("id", bid.id)
    .eq("organization_id", bid.organization_id);
  if (error) {
    console.error("[bid-compare] attach", error.message);
    await storage.remove([path]);
    return false;
  }
  if (bid.file_path && bid.file_path !== path) await storage.remove([bid.file_path]);
  return true;
}

/** A 2-minute signed link to a stored quote (callers check who's asking). */
export async function signQuoteFile(admin: Db, path: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(CERT_BUCKET).createSignedUrl(path, 120);
  if (error) console.error("[bid-compare] sign", error.message);
  return data?.signedUrl ?? null;
}

export async function removeQuoteFiles(admin: Db, paths: (string | null)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p && p.startsWith("quotes/"));
  if (list.length) await admin.storage.from(CERT_BUCKET).remove(list);
}

// ── The read-only share link ─────────────────────────────────────────

/**
 * Turn the share link on (a NEW token every time, so "replace" kills the
 * old link) or off (the hash is cleared). Returns the raw token, shown to
 * the PM once; only its sha256 is stored.
 */
export async function setShareLink(comparisonId: string, orgId: string, on: boolean): Promise<{ ok: true; token: string | null } | { ok: false; error: "notFound" | "unavailable" }> {
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const admin = createServiceClient();
  const token = on ? newShareToken() : null;
  const { data, error } = await admin
    .from("bid_comparisons")
    .update({ share_token_hash: token ? hashShareToken(token) : null, share_created_at: token ? new Date().toISOString() : null })
    .eq("id", comparisonId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (!data) return { ok: false, error: "notFound" };
  return { ok: true, token };
}

export type SharedLookup =
  | { state: "invalid" }
  | { state: "open"; comparison: ComparisonRow; bids: BidRow[]; company: { name: string; province: string | null; country: string | null }; certs: TrackerCert[]; orgs: Map<string, BidderOrg> };

/** Resolve /bid-sheet/s/<token>. A malformed, revoked or replaced token (or any failure) reads as "not valid". */
export async function lookupShared(token: string): Promise<SharedLookup> {
  if (!isShareToken(token) || !isServiceConfigured()) return { state: "invalid" };
  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("bid_comparisons")
      .select(`${COMPARISON_COLS},share_token_hash`)
      .eq("share_token_hash", hashShareToken(token))
      .maybeSingle<ComparisonRow & { share_token_hash: string | null }>();
    if (error || !data || !shareTokenOpens(data.share_token_hash, token)) return { state: "invalid" };
    const { share_token_hash: _hash, ...comparison } = data;
    void _hash;
    const [{ data: bids }, { data: org }, certs] = await Promise.all([
      admin.from("bid_comparison_bids").select(BID_COLS).eq("comparison_id", comparison.id).limit(MAX_BIDS + 2),
      admin.from("organizations").select("name,province,country").eq("id", comparison.organization_id).maybeSingle<{ name: string; province: string | null; country: string | null }>(),
      trackerCerts(admin, comparison.organization_id),
    ]);
    const rows = sortBids((bids ?? []) as BidRow[]);
    return {
      state: "open",
      comparison,
      bids: rows,
      company: org ?? { name: "", province: null, country: null },
      certs,
      orgs: await bidderOrgs(admin, rows.map((b) => b.bidder_organization_id)),
    };
  } catch {
    return { state: "invalid" };
  }
}

// ── Award ────────────────────────────────────────────────────────────

/** Is this address on the do-not-contact list (bounces, complaints, unsubscribes)? */
async function isSuppressed(admin: Db, email: string): Promise<boolean> {
  const { data } = await admin.from("email_suppressions").select("email_key").eq("email_key", email.trim().toLowerCase()).maybeSingle();
  return Boolean(data);
}

export type AwardResult =
  | { ok: true; rfpRecorded: boolean; rfpClosed: boolean; notified: boolean }
  | { ok: false; error: "notFound" | "awarded" | "unavailable" };

/**
 * "Award to this bidder".
 *   - The comparison is claimed first (only while not yet awarded), so a
 *     double click never awards twice.
 *   - Linked to the PM's RFP and the bid came from a response to it: the
 *     EXISTING pick flow (lib/pm-jobs/decisions pickResponse) awards the
 *     RFP, shares the PM's contact with the winner and tells the others.
 *     If the RFP can't be awarded any more (already awarded, not
 *     published), the award still stands on the comparison.
 *   - Otherwise, the award lives on the comparison, and the PM may email
 *     the winner (with their contact) unless the address is on the
 *     do-not-contact list.
 */
export async function awardBid(
  p: { comparisonId: string; bidId: string; notify: boolean },
  actor: Actor & { organizationId: string; company: string; lang: EmailLang; contact: ContactCard },
  now: Date = new Date(),
): Promise<AwardResult> {
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const admin = createServiceClient();
  const [{ data: cmp, error }, { data: bid }] = await Promise.all([
    admin.from("bid_comparisons").select("id,organization_id,title,rfp_id,awarded_at").eq("id", p.comparisonId).eq("organization_id", actor.organizationId).maybeSingle<{
      id: string;
      organization_id: string;
      title: string;
      rfp_id: string | null;
      awarded_at: string | null;
    }>(),
    admin
      .from("bid_comparison_bids")
      .select("id,comparison_id,company_name,contact_email,total_price,rfp_interest_id")
      .eq("id", p.bidId)
      .eq("comparison_id", p.comparisonId)
      .maybeSingle<{ id: string; comparison_id: string; company_name: string; contact_email: string | null; total_price: number | string | null; rfp_interest_id: string | null }>(),
  ]);
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (!cmp || !bid) return { ok: false, error: "notFound" };
  if (cmp.awarded_at) return { ok: false, error: "awarded" };

  const stamp = now.toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("bid_comparisons")
    .update({ awarded_at: stamp, awarded_bid_id: bid.id, awarded_company: bid.company_name.slice(0, 160), awarded_amount: bid.total_price == null ? null : Number(bid.total_price) })
    .eq("id", cmp.id)
    .eq("organization_id", actor.organizationId)
    .is("awarded_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) return { ok: false, error: "unavailable" };
  if (!claimed) return { ok: false, error: "awarded" };

  let rfpRecorded = false;
  let rfpClosed = false;
  let notified = false;
  if (cmp.rfp_id && bid.rfp_interest_id) {
    const job = await loadJobForDecision(admin, cmp.rfp_id);
    if (job && ownsJob(job, actor)) {
      const res = await pickResponse(admin, job, bid.rfp_interest_id);
      if (res.ok) rfpRecorded = notified = true;
      else if (res.error === "failed") {
        // Nothing changed on the RFP: undo the claim so the PM can try again.
        await admin.from("bid_comparisons").update({ awarded_at: null, awarded_bid_id: null, awarded_company: null, awarded_amount: null }).eq("id", cmp.id);
        return { ok: false, error: "unavailable" };
      } else rfpClosed = true;
    } else rfpClosed = true;
  } else if (p.notify) {
    const email = cleanEmail(bid.contact_email);
    const base = BASE();
    const unsub = email ? bidUnsubscribeUrl(base, bid.id) : null;
    if (email && unsub && !(await isSuppressed(admin, email))) {
      await sendTownJobEmail(
        email,
        bidAwardEmail(actor.lang, { base, company: actor.company, vendor: bid.company_name, title: cmp.title, contact: actor.contact, unsubscribeUrl: unsub, mailingAddress: mailingAddress() }),
        actor.lang,
        "bid-comparison-award",
        unsub,
      ).catch((e: unknown) => console.error("[bid-compare] award email", e instanceof Error ? e.message : e));
      notified = true;
    }
  }
  await admin
    .from("bid_comparisons")
    .update({ award_rfp_recorded: rfpRecorded, award_notified_at: notified ? stamp : null })
    .eq("id", cmp.id);
  return { ok: true, rfpRecorded, rfpClosed, notified };
}

// ── Invite these bidders to PMRFP ────────────────────────────────────

export type InviteResult =
  | { ok: true; sent: number; skipped: Record<keyof InvitePlan["skipped"], number> }
  | { ok: false; error: "notFound" | "invitesOff" | "unavailable" };

/**
 * One short email from PMRFP, on the PM's behalf, to each bidder that isn't
 * on PMRFP: promotional, so never without our mailing address (CASL) and an
 * unsubscribe link; never to the do-not-contact list; once per bid, ever;
 * at most DAILY_INVITE_LIMIT a day per PM company. Bidders whose email
 * turns out to belong to a PMRFP member get linked instead.
 */
export async function inviteBidders(p: { comparisonId: string; orgId: string; company: string; lang: EmailLang }, now: Date = new Date()): Promise<InviteResult> {
  if (!isServiceConfigured()) return { ok: false, error: "unavailable" };
  const address = mailingAddress();
  const base = BASE();
  if (!address || !bidUnsubscribeUrl(base, "check")) return { ok: false, error: "invitesOff" };
  const admin = createServiceClient();
  const { data: cmp, error } = await admin
    .from("bid_comparisons")
    .select("id,title")
    .eq("id", p.comparisonId)
    .eq("organization_id", p.orgId)
    .maybeSingle<{ id: string; title: string }>();
  if (error) return { ok: false, error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (!cmp) return { ok: false, error: "notFound" };
  const { data: rows } = await admin
    .from("bid_comparison_bids")
    .select("id,company_name,contact_email,bidder_organization_id,invited_at,rfp_interest_id")
    .eq("comparison_id", cmp.id)
    .eq("organization_id", p.orgId);
  const bids = (rows ?? []) as { id: string; company_name: string; contact_email: string | null; bidder_organization_id: string | null; invited_at: string | null; rfp_interest_id: string | null }[];

  // Already PMRFP members (by email): link them rather than invite them.
  const members = new Set<string>();
  for (const b of bids) {
    const email = cleanEmail(b.contact_email);
    if (!email || b.bidder_organization_id || b.invited_at) continue;
    const org = await findVendorOrg(admin, email).catch(() => null);
    if (org) {
      members.add(email);
      await admin.from("bid_comparison_bids").update({ bidder_organization_id: org }).eq("id", b.id);
    }
  }
  const emails = [...new Set(bids.map((b) => cleanEmail(b.contact_email)).filter((e): e is string => !!e))];
  const suppressed = new Set<string>();
  if (emails.length) {
    const { data: s } = await admin.from("email_suppressions").select("email_key").in("email_key", emails);
    for (const x of (s ?? []) as { email_key: string }[]) suppressed.add(x.email_key);
  }
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { count } = await admin.from("bid_comparison_bids").select("id", { count: "exact", head: true }).eq("organization_id", p.orgId).gte("invited_at", since);
  const plan = planInvites(bids, { suppressed, members, budget: DAILY_INVITE_LIMIT - (count ?? 0) });

  let sent = 0;
  for (const id of plan.send) {
    const b = bids.find((x) => x.id === id)!;
    const email = cleanEmail(b.contact_email)!;
    const unsub = bidUnsubscribeUrl(base, b.id);
    if (!unsub) continue;
    // Stamp first: a slow or failed send never emails twice.
    const { data: stamped } = await admin
      .from("bid_comparison_bids")
      .update({ invited_at: now.toISOString() })
      .eq("id", b.id)
      .is("invited_at", null)
      .select("id")
      .maybeSingle();
    if (!stamped) continue;
    await sendTownJobEmail(
      email,
      bidInviteEmail(p.lang, { base, company: p.company, vendor: b.company_name, title: cmp.title, unsubscribeUrl: unsub, mailingAddress: address }),
      p.lang,
      "bid-comparison-invite",
      unsub,
    ).catch((e: unknown) => console.error("[bid-compare] invite email", e instanceof Error ? e.message : e));
    sent++;
  }
  const skipped = Object.fromEntries(Object.entries(plan.skipped).map(([k, v]) => [k, v.length])) as Record<keyof InvitePlan["skipped"], number>;
  return { ok: true, sent, skipped };
}
