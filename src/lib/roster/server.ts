import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { createServiceClient } from "@/lib/supabase/service";
import { createReadClient } from "@/lib/supabase/read";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { generateReviewToken } from "@/lib/projects/tokens";
import { listVendors } from "@/lib/data/directory";
import { accountGeo } from "@/lib/visitor-geo";
import { sendTownJobEmail } from "@/lib/email/send";
import type { EmailLang } from "@/lib/pm-jobs/email-copy";
import { certStatus, cleanEmail, isoDay } from "@/lib/vendor-certs/rules";
import { findVendorOrg, isMissingTable, orgCertCountry } from "@/lib/vendor-certs/server";
import {
  ENTRY_COLUMNS, LINK_COLUMNS, ROSTER_COLUMNS, claimNativeRosterInvite, createNativeRosterShare,
  listNativeInvitedEmails, listNativeRosterCerts, listNativeRosters, loadNativeRoster, readNativeSharedRoster,
  type RosterScope,
} from "./native";
import { rosterInviteEmail } from "./email-copy";
import { hasUnsubscribeSecret, rosterInviteUnsubscribeUrl } from "./unsubscribe";
import {
  INVITE_DAILY_LIMIT,
  canAddLink,
  inviteRefusal,
  isShareToken,
  linkIsLive,
  rankMatches,
  type CertLite,
  type DirectoryCandidate,
  type EntryRow,
  type InviteRefusal,
  type RosterCountry,
  type RosterInput,
  type Slot,
} from "./rules";

/**
 * After-Hours Vendor Roster database reads and email delivery. Private
 * operations use the active member's organization scope on the VPS or
 * row-level security on the legacy backend. Public cards require a current
 * share link and directory lookups respect supplier contact visibility.
 */

type Db = SupabaseClient | RosterScope;

export async function rosterDatabase(session: SessionContext): Promise<Db> {
  if (isVpsLiveCustomerAuth()) return { orgId: session.organization?.id ?? "", userId: session.userId };
  return createClient();
}

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");
const mailingAddress = () => process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;

export { ENTRY_COLUMNS };

export interface RosterRecord extends RosterInput {
  id: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}

export interface LinkRecord {
  id: string;
  roster_id: string;
  token: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

/** The PM company's country (the account's geo first, then its own province/state). */
export function rosterCountry(geoCountry: string | null | undefined, org: { province?: string | null; country?: string | null } | null | undefined): RosterCountry {
  return geoCountry === "US" || geoCountry === "CA" ? geoCountry : orgCertCountry(org);
}

// ── The PM's reads (RLS client) ──────────────────────────────────────

/** Every building of the company with all their rows (the list page's readiness counts). */
export async function loadRosters(db: Db, orgId: string): Promise<{ ready: boolean; rosters: RosterRecord[]; entries: EntryRow[] }> {
  if ("orgId" in db) return listNativeRosters(db).catch(() => ({ ready: false, rosters: [], entries: [] }));
  const { data, error } = await db.from("emergency_rosters").select(ROSTER_COLUMNS).eq("organization_id", orgId).order("building_name").limit(500);
  if (error) {
    if (!isMissingTable(error)) console.error("[roster] load", error.message);
    return { ready: false, rosters: [], entries: [] };
  }
  const rosters = (data ?? []) as RosterRecord[];
  if (!rosters.length) return { ready: true, rosters, entries: [] };
  const { data: rows, error: e2 } = await db.from("emergency_roster_entries").select(ENTRY_COLUMNS).eq("organization_id", orgId).limit(10_000);
  if (e2) console.error("[roster] entries", e2.message);
  return { ready: true, rosters, entries: (rows ?? []) as EntryRow[] };
}

/** One building: its rows and share links. Null roster: not found or not this company's. */
export async function loadRoster(db: Db, id: string): Promise<{ ready: boolean; roster: RosterRecord | null; entries: EntryRow[]; links: LinkRecord[] }> {
  if ("orgId" in db) return loadNativeRoster(db, id).catch(() => ({ ready: false, roster: null, entries: [], links: [] }));
  const { data, error } = await db.from("emergency_rosters").select(ROSTER_COLUMNS).eq("id", id).maybeSingle<RosterRecord>();
  if (error) {
    if (!isMissingTable(error)) console.error("[roster] load one", error.message);
    return { ready: !isMissingTable(error), roster: null, entries: [], links: [] };
  }
  if (!data) return { ready: true, roster: null, entries: [], links: [] };
  const [entries, links] = await Promise.all([
    db.from("emergency_roster_entries").select(ENTRY_COLUMNS).eq("roster_id", id).limit(500),
    db.from("emergency_roster_links").select(LINK_COLUMNS).eq("roster_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  return { ready: true, roster: data, entries: (entries.data ?? []) as EntryRow[], links: (links.data ?? []) as LinkRecord[] };
}

/**
 * The company's Vendor Insurance Tracker rows, for the insurance chip on a
 * roster vendor. Empty when the tracker isn't there (its migration not
 * applied) or holds nothing.
 */
export async function loadInsuranceCerts(db: Db, orgId: string, now: Date = new Date()): Promise<CertLite[]> {
  const data = "orgId" in db
    ? await listNativeRosterCerts(db).catch(() => [])
    : (await db.from("vendor_certificates").select("vendor_name,contact_email,vendor_organization_id,expires_on").eq("organization_id", orgId).limit(1000)).data;
  const today = isoDay(now);
  return ((data ?? []) as { vendor_name: string; contact_email: string | null; vendor_organization_id: string | null; expires_on: string | null }[]).map((c) => ({
    vendor_name: c.vendor_name,
    contact_email: c.contact_email,
    vendor_organization_id: c.vendor_organization_id,
    status: certStatus(c.expires_on, today),
  }));
}

/** The PMRFP companies a roster links to (approved ones get a profile link). */
export async function linkedOrgs(db: Db, ids: (string | null)[]): Promise<Map<string, { slug: string; name: string }>> {
  const out = new Map<string, { slug: string; name: string }>();
  const unique = [...new Set(ids.filter((x): x is string => !!x))].slice(0, 500);
  if (!unique.length) return out;
  const data = "orgId" in db
    ? (await vpsAppDatabase().prepare(`SELECT id,slug,name,profile_status,status FROM organizations
      WHERE id IN (SELECT value FROM json_each(?)) AND ${customerAppAuthority}`).bind(JSON.stringify(unique))
      .all<{ id: string; slug: string; name: string; profile_status: string; status: string }>().catch(() => null))?.results
    : (await db.from("organizations").select("id,slug,name,profile_status,status").in("id", unique)).data;
  for (const o of (data ?? []) as { id: string; slug: string; name: string; profile_status: string; status: string }[]) {
    if (o.profile_status === "approved" && o.status === "active") out.set(o.id, { slug: o.slug, name: o.name });
  }
  return out;
}

/** Addresses this company already invited (the row shows "Invited"). */
export async function invitedEmails(db: Db, orgId: string): Promise<Set<string>> {
  if ("orgId" in db) return listNativeInvitedEmails(db).catch(() => new Set<string>());
  const { data, error } = await db.from("emergency_roster_invites").select("email_key").eq("organization_id", orgId).limit(5000);
  if (error) return new Set();
  return new Set(((data ?? []) as { email_key: string }[]).map((r) => r.email_key));
}

// ── The directory ("Find a 24/7 plumber near ...") ───────────────────

export interface DirectoryMatch extends DirectoryCandidate {
  /** Shown only when the company's profile shows its contact details. */
  phone: string | null;
  email: string | null;
}

interface OrgContactRow {
  id: string;
  slug: string;
  name: string;
  province: string | null;
  country: string | null;
  emergency_service: boolean;
  phone: string | null;
  email: string | null;
  public_contact_visibility: string;
}

const contactOf = (o: OrgContactRow) => (o.public_contact_visibility === "show_contact" ? { phone: o.phone?.trim() || null, email: cleanEmail(o.email) } : { phone: null, email: null });

/**
 * Live directory companies for the trade in the building's country (the
 * directory's own filters: approved, active, never a sample company), kept
 * to the building's province or state, emergency service first.
 */
export async function findDirectoryMatches(x: { tradeSlug: string; country: RosterCountry; province: string | null; city: string | null }): Promise<DirectoryMatch[]> {
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return [];
  const list = await listVendors({ category: x.tradeSlug, country: x.country });
  if (!list.length) return [];
  const slugs = list.map((v) => v.slug).slice(0, 200);
  const data = native
    ? (await vpsAppDatabase().prepare(`SELECT id,slug,name,province,country,emergency_service,phone,email,public_contact_visibility
      FROM organizations WHERE slug IN (SELECT value FROM json_each(?)) AND profile_status='approved'
        AND status='active' AND is_demo=0 AND ${customerAppAuthority}`).bind(JSON.stringify(slugs)).all<OrgContactRow>()).results
    : (await createReadClient().from("organizations").select("id,slug,name,province,country,emergency_service,phone,email,public_contact_visibility")
      .in("slug", slugs).eq("profile_status", "approved").eq("status", "active").eq("is_demo", false)).data;
  const bySlug = new Map(((data ?? []) as OrgContactRow[]).map((o) => [o.slug, o]));
  const cands: DirectoryMatch[] = [];
  for (const v of list) {
    const o = bySlug.get(v.slug);
    if (!o) continue;
    cands.push({ orgId: o.id, slug: v.slug, name: v.name, city: v.city, province: v.province, regions: v.regions, emergency: Boolean(o.emergency_service), verified: v.verified, ...contactOf(o) });
  }
  return rankMatches(cands, { province: x.province, city: x.city });
}

/**
 * One directory company for "Use as primary / backup": the server reads it
 * again (the client only sends its id). Only live, real trade companies;
 * never one placed in the other country.
 */
export async function directoryVendor(orgId: string, country: RosterCountry): Promise<{ orgId: string; name: string; phone: string | null; email: string | null } | null> {
  const native = isVpsLiveCustomerAuth();
  if (!native && !isSupabaseConfigured()) return null;
  const data = native
    ? await vpsAppDatabase().prepare(`SELECT id,slug,name,province,country,emergency_service,phone,email,public_contact_visibility
      FROM organizations WHERE id=? AND organization_type IN ('trade_company','supplier')
        AND profile_status='approved' AND status='active' AND is_demo=0 AND ${customerAppAuthority}`).bind(orgId).first<OrgContactRow>()
    : (await createReadClient().from("organizations").select("id,slug,name,province,country,emergency_service,phone,email,public_contact_visibility")
      .eq("id", orgId).in("organization_type", ["trade_company", "supplier"]).eq("profile_status", "approved")
      .eq("status", "active").eq("is_demo", false).maybeSingle<OrgContactRow>()).data;
  if (!data) return null;
  const geo = accountGeo(data);
  if (geo && geo.country !== country) return null;
  return { orgId: data.id, name: data.name, ...contactOf(data) };
}

// ── Share links ──────────────────────────────────────────────────────

export type ShareCreate = { token: string } | { error: "limit" | "unavailable" };

/**
 * A new read-only link. The caller checked (through RLS) that the roster is
 * this company's; the token comes from here (service role), never the
 * client. At most MAX_ACTIVE_LINKS live links per building.
 */
export async function createShareLink(x: { rosterId: string; orgId: string; userId: string; label: string | null }): Promise<ShareCreate> {
  if (isVpsLiveCustomerAuth()) return createNativeRosterShare(x, x.rosterId, x.label).catch(() => ({ error: "unavailable" }));
  if (!isServiceConfigured()) return { error: "unavailable" };
  const admin = createServiceClient();
  const { count, error: cErr } = await admin.from("emergency_roster_links").select("id", { count: "exact", head: true }).eq("roster_id", x.rosterId).is("revoked_at", null);
  if (cErr) return { error: "unavailable" };
  if (!canAddLink(count ?? 0)) return { error: "limit" };
  const token = generateReviewToken();
  const { error } = await admin.from("emergency_roster_links").insert({ roster_id: x.rosterId, organization_id: x.orgId, token, label: x.label, created_by: x.userId });
  if (error) {
    console.error("[roster] share link", error.message);
    return { error: "unavailable" };
  }
  return { token };
}

export interface SharedRoster {
  roster: RosterRecord;
  entries: EntryRow[];
  company: string;
  country: RosterCountry;
}

/**
 * Resolve /on-call/<token>: a live link, a company that's still active.
 * Anything else (bad or turned-off token, missing table) reads as null.
 * `countView` stamps the visit (the page does; the contacts download doesn't).
 */
export async function getSharedRoster(token: string, opts: { countView?: boolean; now?: Date } = {}): Promise<SharedRoster | null> {
  if (!isShareToken(token)) return null;
  if (isVpsLiveCustomerAuth()) {
    const record = await readNativeSharedRoster(token, opts.countView ? opts.now ?? new Date() : undefined).catch(() => null);
    if (!record) return null;
    return { roster: record.roster, entries: record.entries, company: record.organization.name,
      country: orgCertCountry(record.organization) };
  }
  if (!isServiceConfigured()) return null;
  try {
    const admin = createServiceClient();
    const { data: link } = await admin
      .from("emergency_roster_links")
      .select("id,roster_id,organization_id,revoked_at,view_count")
      .eq("token", token)
      .maybeSingle<{ id: string; roster_id: string; organization_id: string; revoked_at: string | null; view_count: number }>();
    if (!link || !linkIsLive(link)) return null;
    const [{ data: org }, { data: roster }, { data: entries }] = await Promise.all([
      admin.from("organizations").select("name,province,country,status").eq("id", link.organization_id).maybeSingle<{ name: string; province: string | null; country: string | null; status: string }>(),
      admin.from("emergency_rosters").select(ROSTER_COLUMNS).eq("id", link.roster_id).eq("organization_id", link.organization_id).maybeSingle<RosterRecord>(),
      admin.from("emergency_roster_entries").select(ENTRY_COLUMNS).eq("roster_id", link.roster_id).limit(500),
    ]);
    if (!org || org.status !== "active" || !roster) return null;
    if (opts.countView) {
      await admin
        .from("emergency_roster_links")
        .update({ view_count: (link.view_count ?? 0) + 1, last_viewed_at: (opts.now ?? new Date()).toISOString() })
        .eq("id", link.id)
        .then(
          () => undefined,
          () => undefined,
        );
    }
    return { roster, entries: (entries ?? []) as EntryRow[], company: org.name, country: orgCertCountry(org) };
  } catch {
    return null;
  }
}

// ── "Invite your current vendor to PMRFP" ────────────────────────────

export type InviteResult = "sent" | "name" | "unavailable" | InviteRefusal;

/**
 * The one referral email (CASL: it names the person who referred them,
 * says so, carries our mailing address and an unsubscribe link). Never an
 * address on the do-not-contact list, never one already on PMRFP (that
 * company is linked to the row instead), never twice from one PM company,
 * never within 30 days of anyone's invite, at most 25 a day per company.
 * The invite row goes in before the send, so a retry can't email twice.
 */
export async function inviteVendor(
  x: { orgId: string; userId: string; inviter: string | null; company: string; lang: EmailLang; entryId: string; slot: Slot; vendorName: string | null; email: string | null },
  now: Date = new Date(),
): Promise<InviteResult> {
  const native = isVpsLiveCustomerAuth();
  const address = mailingAddress();
  if ((!native && !isServiceConfigured()) || !address || !hasUnsubscribeSecret()) return "unavailable";
  const inviter = x.inviter?.trim();
  if (!inviter) return "name";
  if (native) {
    const claim = await claimNativeRosterInvite(x, x.entryId, x.slot, x.lang, now).catch(() => ({ error: "unavailable" as const }));
    if ("error" in claim) return claim.error;
    const base = "https://pmrfp.com";
    const unsub = rosterInviteUnsubscribeUrl(base, claim.id);
    if (!unsub) return "unavailable";
    try {
      await sendTownJobEmail(claim.email, rosterInviteEmail(x.lang, { base, inviter, company: x.company,
        vendor: claim.vendorName, unsubscribeUrl: unsub, mailingAddress: address }), x.lang, "roster-invite", unsub, { smtpOnly: true });
      return "sent";
    } catch {
      // An SMTP error may occur after acceptance. Keep the claim so the referral can't be sent twice.
      console.error("[roster] invitation delivery failed");
      return "unavailable";
    }
  }
  const email = cleanEmail(x.email);
  if (!email) return "no_email";
  const admin = createServiceClient();

  const vendorOrg = await findVendorOrg(admin, email).catch(() => null);
  if (vendorOrg) {
    await admin
      .from("emergency_roster_entries")
      .update({ [`${x.slot}_org_id`]: vendorOrg })
      .eq("id", x.entryId)
      .eq("organization_id", x.orgId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const [supp, mine, last, today] = await Promise.all([
    admin.from("email_suppressions").select("email_key").eq("email_key", email).maybeSingle(),
    admin.from("emergency_roster_invites").select("id").eq("organization_id", x.orgId).eq("email_key", email).maybeSingle(),
    admin.from("emergency_roster_invites").select("sent_at").eq("email_key", email).order("sent_at", { ascending: false }).limit(1).maybeSingle<{ sent_at: string }>(),
    admin.from("emergency_roster_invites").select("id", { count: "exact", head: true }).eq("organization_id", x.orgId).gte("sent_at", since),
  ]);
  if (mine.error && isMissingTable(mine.error)) return "unavailable";
  const refusal = inviteRefusal({
    email,
    onPmrfp: Boolean(vendorOrg),
    suppressed: Boolean(supp.data),
    alreadyByOrg: Boolean(mine.data),
    lastInvitedAt: last.data?.sent_at ?? null,
    sentToday: today.count ?? INVITE_DAILY_LIMIT,
    now,
  });
  if (refusal) return refusal;

  const { data: row, error } = await admin
    .from("emergency_roster_invites")
    .insert({ organization_id: x.orgId, entry_id: x.entryId, email_key: email, vendor_name: x.vendorName?.slice(0, 160) || null, sent_by: x.userId, lang: x.lang, sent_at: now.toISOString() })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) {
    if (error?.code === "23505") return "already";
    if (error) console.error("[roster] invite", error.message);
    return "unavailable";
  }
  const base = BASE();
  const unsub = rosterInviteUnsubscribeUrl(base, row.id);
  if (!unsub) return "unavailable";
  await sendTownJobEmail(
    email,
    rosterInviteEmail(x.lang, { base, inviter, company: x.company, vendor: x.vendorName, unsubscribeUrl: unsub, mailingAddress: address }),
    x.lang,
    "roster-invite",
    unsub,
  );
  return "sent";
}
