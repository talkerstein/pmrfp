"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getCategories } from "@/lib/data/taxonomy";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import {
  STARTERS,
  availableStarters,
  cleanContractInput,
  currencyFor,
  currentTerm,
  importContracts,
  isStarterKey,
  isoDay,
  nextTerm,
  type ContractCountry,
  type ContractFieldError,
} from "./rules";
import { isMissingTable, linkVendorOrg, pmCountry, removeContractFile, setSourceRfp } from "./server";

/**
 * The renewal calendar's server actions. Every one checks the session again
 * (server actions are plain POST endpoints) and writes through the PM's own
 * client, so RLS keeps each company to its own rows; the server-managed
 * links go through lib/contracts/server after an ownership check. Errors
 * come back as keys the client translates (contractsClient.errors).
 */

const DASHBOARD = "/pm-dashboard/contracts";
const ROLES = ["property_manager", "real_estate_agent"];

export type ContractErrorKey = "signIn" | "noOrg" | "unavailable" | "notFound" | "noEnd" | ContractFieldError;

export interface SaveState {
  ok?: boolean;
  error?: ContractErrorKey;
  /** Bumped on every successful save so the form can reset. */
  savedAt?: number;
}

type Pm = { session: SessionContext; orgId: string; country: ContractCountry };

async function pm(): Promise<Pm | { error: ContractErrorKey }> {
  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session || !ROLES.includes(session.profile.primary_role)) return { error: "signIn" };
  if (!session.organization) return { error: "noOrg" };
  return { session, orgId: session.organization.id, country: await pmCountry(session) };
}

async function tradeSet(): Promise<Set<string>> {
  return new Set((await getCategories().catch(() => [])).map((c) => c.slug));
}

const uuid = (v: unknown): string | null => (typeof v === "string" && z.uuid().safeParse(v).success ? v : null);

/** Add a contract (no id) or edit one (id). */
export async function saveContractAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const raw = Object.fromEntries(formData.entries());
  const res = cleanContractInput({ ...raw, auto_renews: formData.get("auto_renews") === "on" }, await tradeSet());
  if (!res.ok) return { error: res.field };
  const row = { ...res.value, currency: currencyFor(who.country) };
  const source = uuid(raw.source_rfp_id);
  const db = await createClient();
  const id = uuid(raw.id);
  if (id) {
    const { data: before } = await db.from("service_contracts").select("vendor_email,source_rfp_id").eq("id", id).maybeSingle<{ vendor_email: string | null; source_rfp_id: string | null }>();
    const { data, error } = await db.from("service_contracts").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
    if (!data) return { error: "notFound" };
    if (before?.vendor_email !== row.vendor_email) await linkVendorOrg(id, row.vendor_email).catch(() => undefined);
    if ((before?.source_rfp_id ?? null) !== source) await setSourceRfp(db, who.session, id, source);
  } else {
    const { data, error } = await db
      .from("service_contracts")
      .insert({ ...row, organization_id: who.orgId, created_by: who.session.userId })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      if (error && !isMissingTable(error)) console.error("[contracts] insert", error.message);
      return { error: "unavailable" };
    }
    if (row.vendor_email) await linkVendorOrg(data.id, row.vendor_email).catch(() => undefined);
    if (source) await setSourceRfp(db, who.session, data.id, source);
  }
  revalidatePath(DASHBOARD);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteContractAction(id: string): Promise<{ ok?: boolean; error?: ContractErrorKey }> {
  if (!uuid(id)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db.from("service_contracts").delete().eq("id", id).select("file_path").maybeSingle<{ file_path: string | null }>();
  if (error || !data) return { error: "notFound" };
  if (data.file_path && isServiceConfigured()) await removeContractFile(createServiceClient(), data.file_path).catch(() => undefined);
  revalidatePath(DASHBOARD);
  return { ok: true };
}

/**
 * "Next term": the contract was renewed (with the same vendor, or after a
 * re-tender). Its dates move to the next term of the same length and
 * season; a re-tender RFP becomes the RFP the new term came from, so next
 * year's re-tender clones it.
 */
export async function renewContractAction(id: string): Promise<{ ok?: boolean; error?: ContractErrorKey }> {
  if (!uuid(id)) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data: c } = await db
    .from("service_contracts")
    .select("id,start_date,end_date,auto_renews,retender_rfp_id")
    .eq("id", id)
    .maybeSingle<{ id: string; start_date: string | null; end_date: string | null; auto_renews: boolean; retender_rfp_id: string | null }>();
  if (!c) return { error: "notFound" };
  const term = currentTerm(c, isoDay(new Date()));
  const next = nextTerm({ start_date: term.start, end_date: term.end });
  if (!next) return { error: "noEnd" };
  const { error } = await db.from("service_contracts").update({ start_date: next.start, end_date: next.end }).eq("id", id);
  if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
  if (c.retender_rfp_id && isServiceConfigured()) {
    await createServiceClient()
      .from("service_contracts")
      .update({ source_rfp_id: c.retender_rfp_id, retender_rfp_id: null, retendered_at: null })
      .eq("id", id);
  }
  revalidatePath(DASHBOARD);
  return { ok: true };
}

/** Seasonal starters: one-click rows with the trade and notice days; no building, dates or prices. */
export async function addStartersAction(keys: string[], lang: string): Promise<{ added?: number; error?: ContractErrorKey }> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const wanted = new Set(keys.filter(isStarterKey));
  if (!wanted.size) return { added: 0 };
  const db = await createClient();
  const { data: existing, error: readErr } = await db.from("service_contracts").select("starter_key").eq("organization_id", who.orgId).not("starter_key", "is", null);
  if (readErr) return { error: isMissingTable(readErr) ? "unavailable" : "notFound" };
  const trades = await getCategories().catch(() => []);
  const open = availableStarters(trades, ((existing ?? []) as { starter_key: string | null }[]).map((r) => r.starter_key)).filter((s) => wanted.has(s.key));
  if (!open.length) return { added: 0 };
  const items = getDictionary(hasLocale(lang) ? lang : "en").contractsClient.starters.items;
  const rows = STARTERS.filter((s) => open.some((o) => o.key === s.key)).map((s) => ({
    organization_id: who.orgId,
    created_by: who.session.userId,
    trade_slug: s.trade,
    service_detail: items[s.key].detail,
    notice_days: s.noticeDays,
    currency: currencyFor(who.country),
    starter_key: s.key,
  }));
  const { data, error } = await db.from("service_contracts").insert(rows).select("id");
  if (error) {
    if (!isMissingTable(error)) console.error("[contracts] starters", error.message);
    return { error: "unavailable" };
  }
  revalidatePath(DASHBOARD);
  return { added: data?.length ?? 0 };
}

export interface ImportState {
  ok?: boolean;
  error?: ContractErrorKey | "empty";
  added?: number;
  skipped?: number[];
  truncated?: boolean;
}

/** CSV import: paste or pick a file of contracts (up to 200 rows). */
export async function importContractsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  let csv = String(formData.get("csv") ?? "");
  const file = formData.get("file");
  if (file instanceof File && file.size > 0 && file.size <= 1024 * 1024) csv = await file.text();
  const parsed = importContracts(csv.slice(0, 1024 * 1024), await getCategories().catch(() => []));
  if (!parsed.rows.length) return { error: "empty", skipped: parsed.skipped };
  const db = await createClient();
  const currency = currencyFor(who.country);
  const { data, error } = await db
    .from("service_contracts")
    .insert(parsed.rows.map((r) => ({ ...r, currency, organization_id: who.orgId, created_by: who.session.userId })))
    .select("id,vendor_email");
  if (error) {
    if (!isMissingTable(error)) console.error("[contracts] import", error.message);
    return { error: "unavailable" };
  }
  for (const r of ((data ?? []) as { id: string; vendor_email: string | null }[]).filter((x) => x.vendor_email).slice(0, 50)) {
    await linkVendorOrg(r.id, r.vendor_email).catch(() => undefined);
  }
  revalidatePath(DASHBOARD);
  return { ok: true, added: data?.length ?? 0, skipped: parsed.skipped, truncated: parsed.truncated };
}
