"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { getCategories } from "@/lib/data/taxonomy";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { hasLocale, localizePath, DEFAULT_LOCALE } from "@/i18n/config";
import {
  cleanEntryInput,
  cleanRosterInput,
  isStandardCategory,
  sameCompanyName,
  type EntryFieldError,
  type EntryRow,
  type RosterCountry,
  type RosterFieldError,
  type Slot,
} from "./rules";
import {
  ENTRY_COLUMNS,
  createShareLink,
  directoryVendor,
  findDirectoryMatches,
  inviteVendor,
  rosterCountry,
  type DirectoryMatch,
  type InviteResult,
} from "./server";
import { isMissingTable } from "@/lib/vendor-certs/server";

/**
 * The roster's server actions. Every one checks the session again (server
 * actions are plain POST endpoints) and writes through the PM's own client,
 * so RLS keeps each company to its own buildings. Errors come back as keys
 * the editor translates (roster.editor.errors).
 */

const DASHBOARD = "/pm-dashboard/roster";
const ROLES = ["property_manager", "real_estate_agent"];

export type RosterErrorKey = "signIn" | "noOrg" | "unavailable" | "notFound" | RosterFieldError | EntryFieldError;

export interface FormState {
  ok?: boolean;
  error?: RosterErrorKey;
  /** Bumped on every successful save so the form can react. */
  savedAt?: number;
}

type Pm = { session: SessionContext; orgId: string; country: RosterCountry };

async function pm(): Promise<Pm | { error: RosterErrorKey }> {
  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session || !ROLES.includes(session.profile.primary_role)) return { error: "signIn" };
  if (!session.organization) return { error: "noOrg" };
  const geo = await getAccountGeo(session).catch(() => null);
  return { session, orgId: session.organization.id, country: rosterCountry(geo?.country, session.organization) };
}

const isUuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;
const langOf = (v: unknown) => (typeof v === "string" && hasLocale(v) ? v : DEFAULT_LOCALE);

function refresh(rosterId?: string) {
  revalidatePath(DASHBOARD);
  if (rosterId) revalidatePath(`${DASHBOARD}/${rosterId}`);
}

/** The building, through RLS (null: not this company's). */
async function ownRoster(db: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await db.from("emergency_rosters").select("id,organization_id,city,province").eq("id", id).maybeSingle<{ id: string; organization_id: string; city: string | null; province: string | null }>();
  return { roster: data, error };
}

// ── Buildings ────────────────────────────────────────────────────────

/** "Add a building": name and address, then straight to its roster. */
export async function createRosterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = cleanRosterInput(Object.fromEntries(formData.entries()), who.country);
  if (!res.ok) return { error: res.field };
  const db = await createClient();
  const { data, error } = await db
    .from("emergency_rosters")
    .insert({ ...res.value, organization_id: who.orgId, created_by: who.session.userId })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (error && !isMissingTable(error)) console.error("[roster] create", error.message);
    return { error: "unavailable" };
  }
  refresh();
  redirect(localizePath(`${DASHBOARD}/${data.id}`, langOf(formData.get("lang"))));
}

/** The building form: name, address, on call, shut-offs, emergency numbers. */
export async function saveRosterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = formData.get("id");
  if (!isUuid(id)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = cleanRosterInput(Object.fromEntries(formData.entries()), who.country);
  if (!res.ok) return { error: res.field };
  const db = await createClient();
  const { data, error } = await db.from("emergency_rosters").update(res.value).eq("id", id).select("id").maybeSingle();
  if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (!data) return { error: "notFound" };
  refresh(id);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteRosterAction(id: string): Promise<{ ok?: boolean; error?: RosterErrorKey }> {
  if (!isUuid(id)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db.from("emergency_rosters").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "notFound" };
  refresh();
  return { ok: true };
}

// ── Rows ─────────────────────────────────────────────────────────────

export interface EntryState extends FormState {
  entryId?: string;
}

/**
 * Save one row's primary, backup, 24/7 flag and notes. A standard row is
 * created the first time it's saved; a custom row exists already. A linked
 * PMRFP company stays linked while the name still matches it.
 */
export async function saveEntryAction(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const rosterId = formData.get("roster_id");
  const entryId = formData.get("entry_id");
  const category = formData.get("category");
  if (!isUuid(rosterId)) return { error: "notFound" };
  const custom = category === "custom";
  if (!custom && !isStandardCategory(category)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = cleanEntryInput(Object.fromEntries(formData.entries()), { custom });
  if (!res.ok) return { error: res.field };
  const db = await createClient();

  let before: EntryRow | null = null;
  if (isUuid(entryId)) {
    const { data } = await db.from("emergency_roster_entries").select(ENTRY_COLUMNS).eq("id", entryId).eq("roster_id", rosterId).maybeSingle<EntryRow>();
    if (!data) return { error: "notFound" };
    before = data;
  } else if (!custom) {
    const { data } = await db.from("emergency_roster_entries").select(ENTRY_COLUMNS).eq("roster_id", rosterId).eq("category", category).maybeSingle<EntryRow>();
    before = data ?? null;
  } else {
    return { error: "notFound" };
  }
  const v = res.value;
  const keep = (s: Slot) => (before && before[`${s}_org_id`] && sameCompanyName(before[`${s}_name`], v[`${s}_name`]) ? before[`${s}_org_id`] : null);
  const row = {
    ...v,
    // A standard row's label and trade are fixed; a custom row keeps a valid trade only.
    ...(custom ? { trade_slug: v.trade_slug && (await tradeSlugs()).has(v.trade_slug) ? v.trade_slug : null } : { custom_label: null, trade_slug: null }),
    primary_org_id: keep("primary"),
    backup_org_id: keep("backup"),
  };

  if (before) {
    const { data, error } = await db.from("emergency_roster_entries").update(row).eq("id", before.id).select("id").maybeSingle<{ id: string }>();
    if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
    if (!data) return { error: "notFound" };
    refresh(rosterId);
    return { ok: true, savedAt: Date.now(), entryId: data.id };
  }
  const { roster } = await ownRoster(db, rosterId);
  if (!roster) return { error: "notFound" };
  const { data, error } = await db
    .from("emergency_roster_entries")
    .insert({ ...row, roster_id: rosterId, organization_id: roster.organization_id, category, not_needed: false })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (error && !isMissingTable(error)) console.error("[roster] entry insert", error.message);
    return { error: "unavailable" };
  }
  refresh(rosterId);
  return { ok: true, savedAt: Date.now(), entryId: data.id };
}

/** "Not needed here" / "Needed here" on a standard row (stored the first time) or a custom one. */
export async function setNotNeededAction(x: { rosterId: string; category: string; entryId: string | null; notNeeded: boolean }): Promise<{ ok?: boolean; entryId?: string; error?: RosterErrorKey }> {
  if (!isUuid(x.rosterId)) return { error: "notFound" };
  const custom = x.category === "custom";
  if (!custom && !isStandardCategory(x.category)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const notNeeded = Boolean(x.notNeeded);
  const match = isUuid(x.entryId)
    ? db.from("emergency_roster_entries").update({ not_needed: notNeeded }).eq("id", x.entryId).eq("roster_id", x.rosterId)
    : custom
      ? null
      : db.from("emergency_roster_entries").update({ not_needed: notNeeded }).eq("roster_id", x.rosterId).eq("category", x.category);
  if (!match) return { error: "notFound" };
  const { data, error } = await match.select("id").maybeSingle<{ id: string }>();
  if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (data) {
    refresh(x.rosterId);
    return { ok: true, entryId: data.id };
  }
  if (custom) return { error: "notFound" };
  const { roster } = await ownRoster(db, x.rosterId);
  if (!roster) return { error: "notFound" };
  const { data: ins, error: insErr } = await db
    .from("emergency_roster_entries")
    .insert({ roster_id: x.rosterId, organization_id: roster.organization_id, category: x.category, not_needed: notNeeded })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !ins) return { error: "unavailable" };
  refresh(x.rosterId);
  return { ok: true, entryId: ins.id };
}

/** The trades a custom row may point at (the directory's own categories). */
async function tradeSlugs(): Promise<Set<string>> {
  return new Set((await getCategories().catch(() => [])).map((c) => c.slug));
}

/** "Add your own row" (generator service, sewer backup ...), optionally tied to a directory trade. */
export async function addCustomRowAction(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const rosterId = formData.get("roster_id");
  if (!isUuid(rosterId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const res = cleanEntryInput({ custom_label: formData.get("custom_label"), trade_slug: formData.get("trade_slug") }, { custom: true });
  if (!res.ok) return { error: res.field };
  if (res.value.trade_slug && !(await tradeSlugs()).has(res.value.trade_slug)) return { error: "trade" };
  const db = await createClient();
  const { roster, error: rErr } = await ownRoster(db, rosterId);
  if (rErr && isMissingTable(rErr)) return { error: "unavailable" };
  if (!roster) return { error: "notFound" };
  const { count } = await db.from("emergency_roster_entries").select("id", { count: "exact", head: true }).eq("roster_id", rosterId).eq("category", "custom");
  if ((count ?? 0) >= 30) return { error: "unavailable" };
  const { data, error } = await db
    .from("emergency_roster_entries")
    .insert({ roster_id: rosterId, organization_id: roster.organization_id, category: "custom", custom_label: res.value.custom_label, trade_slug: res.value.trade_slug, sort_order: (count ?? 0) + 1 })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (error && !isMissingTable(error)) console.error("[roster] custom row", error.message);
    return { error: "unavailable" };
  }
  refresh(rosterId);
  return { ok: true, savedAt: Date.now(), entryId: data.id };
}

/** "Clear row" (a standard row goes back to empty) or remove a custom row. */
export async function deleteEntryAction(entryId: string): Promise<{ ok?: boolean; error?: RosterErrorKey }> {
  if (!isUuid(entryId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db.from("emergency_roster_entries").delete().eq("id", entryId).select("roster_id").maybeSingle<{ roster_id: string }>();
  if (error || !data) return { error: "notFound" };
  refresh(data.roster_id);
  return { ok: true };
}

// ── Filling a gap from PMRFP ─────────────────────────────────────────

export type MatchView = Pick<DirectoryMatch, "orgId" | "slug" | "name" | "city" | "province" | "emergency" | "verified" | "phone">;

/** "Find a 24/7 plumber near Hamilton": directory companies in the building's country and province or state. */
export async function findVendorsAction(rosterId: string, tradeSlug: string): Promise<{ matches?: MatchView[]; error?: RosterErrorKey }> {
  if (!isUuid(rosterId) || typeof tradeSlug !== "string") return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  if (!(await tradeSlugs()).has(tradeSlug)) return { error: "trade" };
  const db = await createClient();
  const { roster } = await ownRoster(db, rosterId);
  if (!roster) return { error: "notFound" };
  const found = await findDirectoryMatches({ tradeSlug, country: who.country, province: roster.province, city: roster.city }).catch(() => []);
  return { matches: found.map(({ orgId, slug, name, city, province, emergency, verified, phone }) => ({ orgId, slug, name, city, province, emergency, verified, phone })) };
}

/** "Use as primary / backup": the server reads the company again and fills the slot. */
export async function addDirectoryVendorAction(x: { rosterId: string; category: string; entryId: string | null; slot: Slot; orgId: string }): Promise<{ ok?: boolean; entryId?: string; error?: RosterErrorKey }> {
  if (!isUuid(x.rosterId) || !isUuid(x.orgId) || (x.slot !== "primary" && x.slot !== "backup")) return { error: "notFound" };
  const custom = x.category === "custom";
  if (!custom && !isStandardCategory(x.category)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const vendor = await directoryVendor(x.orgId, who.country);
  if (!vendor) return { error: "notFound" };
  const fill = { [`${x.slot}_name`]: vendor.name.slice(0, 160), [`${x.slot}_phone`]: vendor.phone?.slice(0, 40) ?? null, [`${x.slot}_email`]: vendor.email, [`${x.slot}_org_id`]: vendor.orgId };
  const db = await createClient();
  const match = isUuid(x.entryId)
    ? db.from("emergency_roster_entries").update(fill).eq("id", x.entryId).eq("roster_id", x.rosterId)
    : custom
      ? null
      : db.from("emergency_roster_entries").update(fill).eq("roster_id", x.rosterId).eq("category", x.category);
  if (!match) return { error: "notFound" };
  const { data, error } = await match.select("id").maybeSingle<{ id: string }>();
  if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (data) {
    refresh(x.rosterId);
    return { ok: true, entryId: data.id };
  }
  if (custom) return { error: "notFound" };
  const { roster } = await ownRoster(db, x.rosterId);
  if (!roster) return { error: "notFound" };
  const { data: ins, error: insErr } = await db
    .from("emergency_roster_entries")
    .insert({ roster_id: x.rosterId, organization_id: roster.organization_id, category: x.category, ...fill })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !ins) return { error: "unavailable" };
  refresh(x.rosterId);
  return { ok: true, entryId: ins.id };
}

/** "Invite your current vendor to PMRFP": the one referral email. */
export async function inviteVendorAction(entryId: string, slot: Slot, lang: string): Promise<{ result?: InviteResult; error?: RosterErrorKey }> {
  if (!isUuid(entryId) || (slot !== "primary" && slot !== "backup")) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data } = await db.from("emergency_roster_entries").select(`id,roster_id,${slot}_name,${slot}_email`).eq("id", entryId).maybeSingle<Record<string, string | null>>();
  if (!data) return { error: "notFound" };
  const result = await inviteVendor({
    orgId: who.orgId,
    userId: who.session.userId,
    inviter: who.session.profile.full_name,
    company: who.session.organization?.name ?? "PMRFP",
    lang: emailLang(lang),
    entryId,
    slot,
    vendorName: data[`${slot}_name`] ?? null,
    email: data[`${slot}_email`] ?? null,
  });
  if (result === "sent" && data.roster_id) refresh(data.roster_id);
  return { result };
}

// ── Share links ──────────────────────────────────────────────────────

export async function createShareLinkAction(rosterId: string, label: string): Promise<{ token?: string; error?: RosterErrorKey | "limit" }> {
  if (!isUuid(rosterId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { roster } = await ownRoster(db, rosterId);
  if (!roster) return { error: "notFound" };
  const clean = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, 80) || null : null;
  const res = await createShareLink({ rosterId, orgId: roster.organization_id, userId: who.session.userId, label: clean });
  if ("error" in res) return { error: res.error };
  refresh(rosterId);
  return { token: res.token };
}

/** Turn a link off (members may only revoke, never switch one back on). */
export async function revokeShareLinkAction(linkId: string): Promise<{ ok?: boolean; error?: RosterErrorKey }> {
  if (!isUuid(linkId)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db
    .from("emergency_roster_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null)
    .select("roster_id")
    .maybeSingle<{ roster_id: string }>();
  if (error || !data) return { error: "notFound" };
  refresh(data.roster_id);
  return { ok: true };
}
