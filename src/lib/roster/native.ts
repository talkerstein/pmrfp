import { randomUUID } from "node:crypto";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import type { D1Binding } from "@/lib/d1/contracts";
import { generateReviewToken } from "@/lib/projects/tokens";
import { cleanEmail } from "@/lib/vendor-certs/rules";
import { customerAppAuthority } from "../../../workers/d1-api/customer-signup";
import { INVITE_DAILY_LIMIT, INVITE_RECENT_DAYS, MAX_ACTIVE_LINKS, inviteRefusal, isShareToken } from "./rules";
import type { EntryInput, EntryRow, InviteRefusal, RosterInput, Slot } from "./rules";
import type { LinkRecord, RosterRecord, ShareCreate } from "./server";

export const ROSTER_COLUMNS =
  "id,organization_id,building_name,address,city,province,on_call_name,on_call_phone,on_call_notes,shutoff_water,shutoff_gas,shutoff_electric,shutoff_notes,emergency_line,non_emergency_line,other_numbers,created_at,updated_at";
export const ENTRY_COLUMNS =
  "id,roster_id,category,custom_label,trade_slug,not_needed,primary_name,primary_phone,primary_email,primary_org_id,backup_name,backup_phone,backup_email,backup_org_id,available_24_7,notes,sort_order,created_at,updated_at";
export const LINK_COLUMNS = "id,roster_id,token,label,created_at,revoked_at,last_viewed_at,view_count";

export type RosterScope = { orgId: string; userId: string };

function member(org: string) {
  return `${customerAppAuthority} AND EXISTS (
    SELECT 1 FROM organization_members m JOIN users_profile u ON u.id=m.user_id
    JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=${org} AND m.user_id=? AND u.status='active'
      AND o.status='active' AND u.primary_role IN ('property_manager','real_estate_agent'))`;
}

function owned(table: string) {
  const organization = `${table}.organization_id`;
  return `${organization}=? AND ${member(organization)}`;
}

const rosterOwned = owned("emergency_rosters");
const entryOwned = owned("emergency_roster_entries");
const linkOwned = owned("emergency_roster_links");
const rosterFields = ROSTER_COLUMNS.split(",").slice(2, -2) as (keyof RosterInput)[];
const entryFields = [
  "custom_label", "trade_slug", "primary_name", "primary_phone", "primary_email", "primary_org_id",
  "backup_name", "backup_phone", "backup_email", "backup_org_id", "available_24_7", "notes", "not_needed",
] as const;
type EntryChanges = Partial<EntryInput & Pick<EntryRow, "primary_org_id" | "backup_org_id" | "not_needed">>;

type NativeEntry = Omit<EntryRow, "not_needed" | "available_24_7"> & { not_needed: number; available_24_7: number };
function asEntry(row: NativeEntry): EntryRow {
  return { ...row, not_needed: Boolean(row.not_needed), available_24_7: Boolean(row.available_24_7) };
}

export async function listNativeRosters(scope: RosterScope, db: D1Binding = vpsAppDatabase()) {
  const args = [scope.orgId, scope.userId] as const;
  const [rosters, entries] = await db.batch([
    db.prepare(`SELECT ${ROSTER_COLUMNS} FROM emergency_rosters WHERE ${rosterOwned} ORDER BY lower(building_name),id LIMIT 500`).bind(...args),
    db.prepare(`SELECT ${ENTRY_COLUMNS} FROM emergency_roster_entries WHERE ${entryOwned} LIMIT 10000`).bind(...args),
  ]);
  return { ready: true, rosters: rosters.results as unknown as RosterRecord[],
    entries: (entries.results as unknown as NativeEntry[]).map(asEntry) };
}

export async function loadNativeRoster(scope: RosterScope, id: string, db: D1Binding = vpsAppDatabase()) {
  const args = [id, scope.orgId, scope.userId] as const;
  const [roster, entries, links] = await db.batch([
    db.prepare(`SELECT ${ROSTER_COLUMNS} FROM emergency_rosters WHERE id=? AND ${rosterOwned}`).bind(...args),
    db.prepare(`SELECT ${ENTRY_COLUMNS} FROM emergency_roster_entries WHERE roster_id=? AND ${entryOwned} LIMIT 500`).bind(...args),
    db.prepare(`SELECT ${LINK_COLUMNS} FROM emergency_roster_links WHERE roster_id=? AND ${linkOwned} ORDER BY created_at DESC LIMIT 50`).bind(...args),
  ]);
  return { ready: true, roster: (roster.results[0] as unknown as RosterRecord | undefined) ?? null,
    entries: (entries.results as unknown as NativeEntry[]).map(asEntry), links: links.results as unknown as LinkRecord[] };
}

export function ownNativeRoster(scope: RosterScope, id: string, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`SELECT id,organization_id,city,province FROM emergency_rosters WHERE id=? AND ${rosterOwned}`)
    .bind(id, scope.orgId, scope.userId).first<Pick<RosterRecord, "id" | "organization_id" | "city" | "province">>();
}

export async function saveNativeRoster(scope: RosterScope, form: RosterInput, id?: string, db: D1Binding = vpsAppDatabase()) {
  const fields = rosterFields.map((key) => form[key]);
  if (id) {
    return db.prepare(`UPDATE emergency_rosters SET ${rosterFields.map((f) => f + "=?").join(",")},updated_at=?
      WHERE id=? AND ${rosterOwned} RETURNING id`)
      .bind(...fields, new Date().toISOString(), id, scope.orgId, scope.userId).first<{ id: string }>();
  }
  return db.prepare(`INSERT INTO emergency_rosters(id,organization_id,created_by,${rosterFields.join(",")})
    SELECT ?,?,?,${rosterFields.map(() => "?").join(",")} WHERE ${member("?")} RETURNING id`)
    .bind(randomUUID(), scope.orgId, scope.userId, ...fields, scope.orgId, scope.userId).first<{ id: string }>();
}

export function deleteNativeRoster(scope: RosterScope, id: string, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`DELETE FROM emergency_rosters WHERE id=? AND ${rosterOwned} RETURNING id`)
    .bind(id, scope.orgId, scope.userId).first<{ id: string }>();
}

export async function readNativeEntry(scope: RosterScope, entryId: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT ${ENTRY_COLUMNS} FROM emergency_roster_entries WHERE id=? AND ${entryOwned}`)
    .bind(entryId, scope.orgId, scope.userId).first<NativeEntry>();
  return row ? asEntry(row) : null;
}

export async function findNativeStandardEntry(scope: RosterScope, rosterId: string, category: string, db: D1Binding = vpsAppDatabase()) {
  const row = await db.prepare(`SELECT ${ENTRY_COLUMNS} FROM emergency_roster_entries WHERE roster_id=? AND category=? AND ${entryOwned}`)
    .bind(rosterId, category, scope.orgId, scope.userId).first<NativeEntry>();
  return row ? asEntry(row) : null;
}

/** A standard row may not exist yet. Claim its unique category slot in the same statement. */
export function saveNativeEntry(scope: RosterScope, rosterId: string, category: string, id: string | null, changes: EntryChanges, db: D1Binding = vpsAppDatabase()) {
  const keys = entryFields.filter((key) => Object.hasOwn(changes, key));
  const fields = keys.map((key) => {
    const value = changes[key];
    return typeof value === "boolean" ? Number(value) : value ?? null;
  });
  const now = new Date().toISOString();
  if (id) {
    return db.prepare(`UPDATE emergency_roster_entries SET ${keys.map((key) => key + "=?").join(",")},updated_at=?
      WHERE id=? AND roster_id=? AND category=? AND ${entryOwned} RETURNING id`)
      .bind(...fields, now, id, rosterId, category, scope.orgId, scope.userId).first<{ id: string }>();
  }
  if (category === "custom") return Promise.resolve(null);
  return db.prepare(`INSERT INTO emergency_roster_entries(id,roster_id,organization_id,category,${keys.join(",")},updated_at)
    SELECT ?,id,organization_id,?,${keys.map(() => "?").join(",")},? FROM emergency_rosters WHERE id=? AND ${rosterOwned}
    ON CONFLICT(roster_id,category) WHERE category<>'custom'
    DO UPDATE SET ${keys.map((key) => key + "=excluded." + key).join(",")},updated_at=excluded.updated_at RETURNING id`)
    .bind(randomUUID(), category, ...fields, now, rosterId, scope.orgId, scope.userId).first<{ id: string }>();
}

export function addNativeCustomEntry(scope: RosterScope, rosterId: string, label: string | null, trade: string | null, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`INSERT INTO emergency_roster_entries (id,roster_id,organization_id,category,custom_label,trade_slug,sort_order)
    SELECT ?,id,organization_id,'custom',?,?,
      (SELECT coalesce(max(sort_order),0)+1 FROM emergency_roster_entries WHERE roster_id=r.id AND category='custom')
    FROM emergency_rosters r WHERE r.id=? AND ${owned("r")}
      AND (SELECT count(*) FROM emergency_roster_entries WHERE roster_id=r.id AND category='custom')<30 RETURNING id`)
    .bind(randomUUID(), label, trade, rosterId, scope.orgId, scope.userId).first<{ id: string }>();
}

export function deleteNativeEntry(scope: RosterScope, id: string, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`DELETE FROM emergency_roster_entries WHERE id=? AND ${entryOwned} RETURNING roster_id`)
    .bind(id, scope.orgId, scope.userId).first<{ roster_id: string }>();
}

export async function createNativeRosterShare(scope: RosterScope, rosterId: string, label: string | null, db: D1Binding = vpsAppDatabase()): Promise<ShareCreate> {
  const token = generateReviewToken();
  const created = await db.prepare(`INSERT INTO emergency_roster_links(id,roster_id,organization_id,token,label,created_by)
    SELECT ?,r.id,r.organization_id,?,?,? FROM emergency_rosters r WHERE r.id=? AND ${owned("r")}
      AND (SELECT count(*) FROM emergency_roster_links WHERE roster_id=r.id AND revoked_at IS NULL)<?
    RETURNING id`).bind(randomUUID(), token, label, scope.userId, rosterId, scope.orgId, scope.userId, MAX_ACTIVE_LINKS).first();
  if (created) return { token };
  return { error: await ownNativeRoster(scope, rosterId, db) ? "limit" : "unavailable" };
}

export function revokeNativeRosterShare(scope: RosterScope, id: string, db: D1Binding = vpsAppDatabase()) {
  return db.prepare(`UPDATE emergency_roster_links SET revoked_at=? WHERE id=? AND revoked_at IS NULL
    AND ${linkOwned} RETURNING roster_id`).bind(new Date().toISOString(), id, scope.orgId, scope.userId).first<{ roster_id: string }>();
}

type SharedOrg = { name: string; province: string | null; country: string | null };
export async function readNativeSharedRoster(token: string, viewedAt?: Date, db: D1Binding = vpsAppDatabase()) {
  if (!isShareToken(token)) return null;
  const live = `SELECT l.id,l.roster_id,l.organization_id FROM emergency_roster_links l
    JOIN organizations o ON o.id=l.organization_id
    WHERE l.token=? AND l.revoked_at IS NULL AND o.status='active' AND ${customerAppAuthority}`;
  const statements = [
    db.prepare(`SELECT ${ROSTER_COLUMNS.split(",").map((col) => "r." + col).join(",")},o.name AS organization_name,
      o.province AS organization_province,o.country AS organization_country FROM emergency_rosters r
      JOIN organizations o ON o.id=r.organization_id WHERE r.id IN (SELECT roster_id FROM (${live}))`).bind(token),
    db.prepare(`SELECT ${ENTRY_COLUMNS} FROM emergency_roster_entries WHERE roster_id IN (SELECT roster_id FROM (${live})) LIMIT 500`).bind(token),
  ];
  if (viewedAt) {
    statements.push(db.prepare(`UPDATE emergency_roster_links SET view_count=view_count+1,last_viewed_at=?
      WHERE id IN (SELECT id FROM (${live}))`).bind(viewedAt.toISOString(), token));
  }
  const [rosters, entries] = await db.batch(statements);
  const row = rosters.results[0] as unknown as (RosterRecord & {
    organization_name: string; organization_province: string | null; organization_country: string | null;
  }) | undefined;
  if (!row) return null;
  const { organization_name: name, organization_province: province, organization_country: country, ...roster } = row;
  const organization: SharedOrg = { name, province, country };
  return { roster, entries: (entries.results as unknown as NativeEntry[]).map(asEntry), organization };
}

export async function listNativeRosterCerts(scope: RosterScope, db: D1Binding = vpsAppDatabase()) {
  const rows = await db.prepare(`SELECT vendor_name,contact_email,vendor_organization_id,expires_on FROM vendor_certificates
    WHERE ${owned("vendor_certificates")} LIMIT 1000`).bind(scope.orgId, scope.userId).all<{
      vendor_name: string; contact_email: string | null; vendor_organization_id: string | null; expires_on: string | null;
    }>();
  return rows.results;
}

export async function listNativeInvitedEmails(scope: RosterScope, db: D1Binding = vpsAppDatabase()) {
  const rows = await db.prepare(`SELECT email_key FROM emergency_roster_invites WHERE ${owned("emergency_roster_invites")} LIMIT 5000`)
    .bind(scope.orgId, scope.userId).all<{ email_key: string }>();
  return new Set(rows.results.map((row) => row.email_key));
}

const vendorMatch = `SELECT o.id FROM users_profile u JOIN organization_members m ON m.user_id=u.id
  JOIN organizations o ON o.id=m.organization_id WHERE lower(trim(u.email))=?
    AND u.status='active' AND o.status='active' AND o.is_demo=0 AND o.organization_type IN ('trade_company','supplier','builder')
    ORDER BY o.id LIMIT 1`;

type InviteStatus = InviteRefusal | "unavailable";
export async function claimNativeRosterInvite(
  scope: RosterScope, entryId: string, slot: Slot, lang: string, now: Date, db: D1Binding = vpsAppDatabase(),
): Promise<{ id: string; email: string; vendorName: string | null } | { error: InviteStatus }> {
  const entry = await readNativeEntry(scope, entryId, db);
  const email = cleanEmail(entry?.[`${slot}_email`]);
  if (!entry || !email) return { error: entry ? "no_email" : "unavailable" };
  const vendorName = entry[`${slot}_name`];
  const vendor = await db.prepare(vendorMatch).bind(email).first<{ id: string }>();
  if (vendor) {
    await db.prepare(`UPDATE emergency_roster_entries SET ${slot}_org_id=?,updated_at=?
      WHERE id=? AND lower(trim(${slot}_email))=? AND ${entryOwned}`)
      .bind(vendor.id, now.toISOString(), entryId, email, scope.orgId, scope.userId).run();
    return { error: "on_pmrfp" };
  }
  const day = new Date(now.getTime() - 86_400_000).toISOString();
  const recent = new Date(now.getTime() - INVITE_RECENT_DAYS * 86_400_000).toISOString();
  const id = randomUUID();
  const sent = await db.prepare(`INSERT INTO emergency_roster_invites (id,organization_id,entry_id,email_key,vendor_name,sent_by,lang,sent_at)
    SELECT ?,e.organization_id,e.id,?,?,?,?,? FROM emergency_roster_entries e
    WHERE e.id=? AND lower(trim(e.${slot}_email))=? AND ${owned("e")}
      AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE email_key=?)
      AND NOT EXISTS (${vendorMatch})
      AND NOT EXISTS (SELECT 1 FROM emergency_roster_invites WHERE email_key=?
        AND (organization_id=e.organization_id OR julianday(sent_at)>julianday(?)))
      AND (SELECT count(*) FROM emergency_roster_invites WHERE organization_id=e.organization_id AND julianday(sent_at)>=julianday(?))<?
    RETURNING id`).bind(id, email, vendorName, scope.userId, lang, now.toISOString(), entryId, email, scope.orgId,
    scope.userId, email, email, email, recent, day, INVITE_DAILY_LIMIT).first();
  if (sent) return { id, email, vendorName };

  const state = await db.prepare(`SELECT EXISTS(SELECT 1 FROM email_suppressions WHERE email_key=?) AS suppressed,
    EXISTS(SELECT 1 FROM emergency_roster_invites WHERE email_key=? AND organization_id=?) AS own,
    (SELECT sent_at FROM emergency_roster_invites WHERE email_key=? ORDER BY julianday(sent_at) DESC LIMIT 1) AS last,
    (SELECT count(*) FROM emergency_roster_invites WHERE organization_id=? AND julianday(sent_at)>=julianday(?)) AS today`)
    .bind(email, email, scope.orgId, email, scope.orgId, day).first<{ suppressed: number; own: number; last: string | null; today: number }>();
  return { error: state ? inviteRefusal({ email, onPmrfp: false, suppressed: Boolean(state.suppressed),
    alreadyByOrg: Boolean(state.own), lastInvitedAt: state.last, sentToday: state.today, now }) ?? "unavailable" : "unavailable" };
}

export async function unsubscribeNativeRosterInvite(id: string, db: D1Binding = vpsAppDatabase()) {
  const [invite] = await db.batch([
    db.prepare(`SELECT 1 FROM emergency_roster_invites WHERE id=? AND ${customerAppAuthority}`).bind(id),
    db.prepare(`INSERT INTO email_suppressions(email_key,reason,detail)
      SELECT email_key,'unsubscribe','after-hours roster invite' FROM emergency_roster_invites WHERE id=? AND ${customerAppAuthority}
      ON CONFLICT(email_key) DO NOTHING`).bind(id),
  ]);
  return invite.results.length === 1;
}
