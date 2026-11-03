"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { getAccountGeo } from "@/lib/visitor-geo.server";
import { emailLang } from "@/lib/pm-jobs/email-copy";
import { cleanVendorInput, importVendors, type CertCountry, type VendorFieldError } from "./rules";
import { findVendorOrg, isMissingTable, orgCertCountry, removeCertFile, requestCertificate, type RequestResult } from "./server";

/**
 * The tracker's server actions. Every one checks the session again (server
 * actions are plain POST endpoints) and writes through the PM's own client,
 * so RLS keeps each company to its own rows. Errors come back as keys the
 * client translates (certsClient.errors).
 */

const DASHBOARD = "/pm-dashboard/vendor-insurance";
const ROLES = ["property_manager", "real_estate_agent"];

export type CertErrorKey = "signIn" | "noOrg" | "unavailable" | "notFound" | VendorFieldError;

export interface SaveState {
  ok?: boolean;
  error?: CertErrorKey;
  /** Bumped on every successful save so the form can reset. */
  savedAt?: number;
}

type Pm = { session: SessionContext; orgId: string; country: CertCountry };

async function pm(): Promise<Pm | { error: CertErrorKey }> {
  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const session = await getSession();
  if (!session || !ROLES.includes(session.profile.primary_role)) return { error: "signIn" };
  if (!session.organization) return { error: "noOrg" };
  const geo = await getAccountGeo(session).catch(() => null);
  const country: CertCountry = geo?.country === "US" || geo?.country === "CA" ? geo.country : orgCertCountry(session.organization);
  return { session, orgId: session.organization.id, country };
}

/** Link the vendor's own PMRFP company when its email matches (best effort, service role). */
async function linkVendor(id: string, email: string | null): Promise<void> {
  if (!email || !isServiceConfigured()) return;
  const admin = createServiceClient();
  const orgId = await findVendorOrg(admin, email).catch(() => null);
  await admin.from("vendor_certificates").update({ vendor_organization_id: orgId }).eq("id", id);
}

/** Add a vendor (no id) or edit one (id). */
export async function saveCertificateAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const raw = Object.fromEntries(formData.entries());
  const res = cleanVendorInput({ ...raw, remind_vendor: formData.get("remind_vendor") === "on" }, who.country);
  if (!res.ok) return { error: res.field };
  const db = await createClient();
  const id = typeof raw.id === "string" && z.uuid().safeParse(raw.id).success ? raw.id : null;
  if (id) {
    const { data: before } = await db.from("vendor_certificates").select("contact_email").eq("id", id).maybeSingle<{ contact_email: string | null }>();
    const { data, error } = await db.from("vendor_certificates").update(res.value).eq("id", id).select("id").maybeSingle();
    if (error) return { error: isMissingTable(error) ? "unavailable" : "notFound" };
    if (!data) return { error: "notFound" };
    if (before?.contact_email !== res.value.contact_email) await linkVendor(id, res.value.contact_email);
  } else {
    const { data, error } = await db
      .from("vendor_certificates")
      .insert({ ...res.value, organization_id: who.orgId, created_by: who.session.userId })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      if (error && !isMissingTable(error)) console.error("[vendor-certs] insert", error.message);
      return { error: "unavailable" };
    }
    await linkVendor(data.id, res.value.contact_email);
  }
  revalidatePath(DASHBOARD);
  return { ok: true, savedAt: Date.now() };
}

export async function deleteCertificateAction(id: string): Promise<{ ok?: boolean; error?: CertErrorKey }> {
  if (!z.uuid().safeParse(id).success) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const db = await createClient();
  const { data, error } = await db.from("vendor_certificates").delete().eq("id", id).select("file_path").maybeSingle<{ file_path: string | null }>();
  if (error || !data) return { error: "notFound" };
  if (data.file_path && isServiceConfigured()) await removeCertFile(createServiceClient(), data.file_path).catch(() => undefined);
  revalidatePath(DASHBOARD);
  return { ok: true };
}

/** "Request certificate": email the vendor a one-time upload link. */
export async function requestCertificateAction(id: string, lang: string): Promise<{ result?: RequestResult; error?: CertErrorKey }> {
  if (!z.uuid().safeParse(id).success) return { error: "notFound" };
  const who = await pm();
  if ("error" in who) return { error: who.error };
  const result = await requestCertificate(id, {
    orgId: who.orgId,
    company: who.session.organization?.name ?? "PMRFP",
    country: who.country,
    lang: emailLang(lang),
  });
  if (result === "sent") revalidatePath(DASHBOARD);
  return { result };
}

export interface ImportState {
  ok?: boolean;
  error?: CertErrorKey | "empty";
  added?: number;
  skipped?: number[];
  truncated?: boolean;
}

/** CSV import: paste or pick a file of vendors (up to 200 rows). */
export async function importCertificatesAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const who = await pm();
  if ("error" in who) return { error: who.error };
  let csv = String(formData.get("csv") ?? "");
  const file = formData.get("file");
  if (file instanceof File && file.size > 0 && file.size <= 1024 * 1024) csv = await file.text();
  const parsed = importVendors(csv.slice(0, 1024 * 1024), who.country);
  if (!parsed.rows.length) return { error: "empty", skipped: parsed.skipped };
  const db = await createClient();
  const { data, error } = await db
    .from("vendor_certificates")
    .insert(parsed.rows.map((r) => ({ ...r, organization_id: who.orgId, created_by: who.session.userId })))
    .select("id,contact_email");
  if (error) {
    if (!isMissingTable(error)) console.error("[vendor-certs] import", error.message);
    return { error: "unavailable" };
  }
  for (const r of ((data ?? []) as { id: string; contact_email: string | null }[]).filter((x) => x.contact_email).slice(0, 50)) {
    await linkVendor(r.id, r.contact_email).catch(() => undefined);
  }
  revalidatePath(DASHBOARD);
  return { ok: true, added: data?.length ?? 0, skipped: parsed.skipped, truncated: parsed.truncated };
}
