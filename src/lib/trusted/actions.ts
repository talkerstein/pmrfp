"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, type SessionContext } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isRealtorPro } from "./data";
import { FREE_LIMIT, TRUSTED_ROLES, canAddTrade, handleFromName, normalizeHandle } from "./rules";

export interface ToggleResult {
  saved?: boolean;
  error?: string;
  /** The free limit was hit: show the upgrade. */
  limit?: boolean;
  handle?: string;
}

export interface PageFormState {
  error?: string;
  success?: string;
}

type Owner = { session: SessionContext; admin: SupabaseClient } | { error: string };

/** A signed-in realtor or property manager, plus the service client for writes. */
async function owner(): Promise<Owner> {
  const session = await getSession();
  if (!session) return { error: "Sign in to save trades to your page." };
  if (!(TRUSTED_ROLES as readonly string[]).includes(session.profile.primary_role)) {
    return { error: "Trusted-trades pages are for realtors and property managers." };
  }
  if (!isServiceConfigured()) return { error: "This isn't available right now." };
  return { session, admin: createServiceClient() };
}

function refresh(handle: string) {
  revalidatePath(`/trusted/${handle}`);
  revalidatePath("/pm-dashboard/saved-vendors");
}

/** The owner's page, created on their first save (handle from their name). */
async function ensureList(admin: SupabaseClient, session: SessionContext): Promise<{ handle: string } | { error: string }> {
  const { data: existing, error: readErr } = await admin
    .from("trusted_lists")
    .select("handle")
    .eq("owner_id", session.userId)
    .maybeSingle<{ handle: string }>();
  if (readErr) return { error: "Trusted-trades pages aren't switched on yet. Try again soon." };
  if (existing) return { handle: existing.handle };

  const base = handleFromName(session.profile.full_name, session.organization?.name);
  const displayName = (session.profile.full_name?.trim() || session.organization?.name || "My trusted trades").slice(0, 80);
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = attempt === 0 ? base : `${base.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await admin.from("trusted_lists").insert({
      owner_id: session.userId,
      organization_id: session.organization?.id ?? null,
      handle,
      display_name: displayName.length >= 2 ? displayName : "My trusted trades",
      brokerage: session.organization?.name?.slice(0, 80) ?? null,
    });
    if (!error) return { handle };
    if (!/duplicate|unique/i.test(error.message)) break;
  }
  return { error: "Could not create your page. Please try again." };
}

/** Save a trade to the owner's page, or remove it if it's already there. */
export async function toggleTrustedTradeAction(organizationId: string): Promise<ToggleResult> {
  if (!z.uuid().safeParse(organizationId).success) return { error: "Unknown company." };
  const o = await owner();
  if ("error" in o) return { error: o.error };
  const { session, admin } = o;
  const list = await ensureList(admin, session);
  if ("error" in list) return { error: list.error };

  const { data: existing } = await admin
    .from("trusted_list_items")
    .select("organization_id")
    .eq("owner_id", session.userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing) {
    await admin.from("trusted_list_items").delete().eq("owner_id", session.userId).eq("organization_id", organizationId);
    refresh(list.handle);
    return { saved: false, handle: list.handle };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("organization_type,profile_status")
    .eq("id", organizationId)
    .maybeSingle<{ organization_type: string; profile_status: string }>();
  if (!org || org.profile_status !== "approved" || !["trade_company", "supplier"].includes(org.organization_type)) {
    return { error: "That company isn't listed in the directory." };
  }
  const [{ count }, pro] = await Promise.all([
    admin.from("trusted_list_items").select("organization_id", { count: "exact", head: true }).eq("owner_id", session.userId),
    isRealtorPro(session.organization?.id ?? null),
  ]);
  if (!canAddTrade(count ?? 0, pro)) {
    return {
      error: `A free page holds ${FREE_LIMIT} trades. Realtor Pro makes it unlimited.`,
      limit: true,
      handle: list.handle,
    };
  }
  const { error } = await admin
    .from("trusted_list_items")
    .insert({ owner_id: session.userId, organization_id: organizationId, position: count ?? 0 });
  if (error) return { error: "Could not save that company. Please try again." };
  refresh(list.handle);
  return { saved: true, handle: list.handle };
}

/** The owner's one-line note on a trade ("Did the roof on my last 3 listings"). */
export async function updateTrustedNoteAction(organizationId: string, note: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(organizationId).success) return { error: "Unknown company." };
  const o = await owner();
  if ("error" in o) return { error: o.error };
  const clean = note.trim().slice(0, 280);
  const { data: list } = await o.admin
    .from("trusted_lists")
    .select("handle")
    .eq("owner_id", o.session.userId)
    .maybeSingle<{ handle: string }>();
  if (!list) return { error: "Save a trade first." };
  const { error } = await o.admin
    .from("trusted_list_items")
    .update({ note: clean || null })
    .eq("owner_id", o.session.userId)
    .eq("organization_id", organizationId);
  if (error) return { error: "Could not save the note." };
  refresh(list.handle);
  return {};
}

const pageSchema = z.object({
  handle: z.string().trim().min(3, "Pick a link of at least 3 characters.").max(40),
  displayName: z.string().trim().min(2, "Add your name.").max(80),
  brokerage: z.string().trim().max(80),
  headline: z.string().trim().max(160),
  contactPhone: z.string().trim().max(30),
  contactEmail: z.union([z.literal(""), z.email("That email doesn't look right.").max(120)]),
});

/** Page settings: link, name, brokerage, headline; contact details for Realtor Pro. */
export async function updateTrustedPageAction(_prev: PageFormState, formData: FormData): Promise<PageFormState> {
  const o = await owner();
  if ("error" in o) return { error: o.error };
  const { session, admin } = o;
  const parsed = pageSchema.safeParse({
    handle: formData.get("handle") ?? "",
    displayName: formData.get("displayName") ?? "",
    brokerage: formData.get("brokerage") ?? "",
    headline: formData.get("headline") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const handle = normalizeHandle(parsed.data.handle);
  if (!handle) return { error: "Use 3 to 40 letters, numbers or dashes for your link." };

  const list = await ensureList(admin, session);
  if ("error" in list) return { error: list.error };
  const pro = await isRealtorPro(session.organization?.id ?? null);
  const { error } = await admin
    .from("trusted_lists")
    .update({
      handle,
      display_name: parsed.data.displayName,
      brokerage: parsed.data.brokerage || null,
      headline: parsed.data.headline || null,
      // The contact button is a Realtor Pro feature; free pages don't store it.
      contact_phone: pro ? parsed.data.contactPhone || null : null,
      contact_email: pro ? parsed.data.contactEmail || null : null,
      published: formData.get("published") === "on",
    })
    .eq("owner_id", session.userId);
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "That link is taken. Try another." : "Could not save your page." };
  }
  if (handle !== list.handle) revalidatePath(`/trusted/${list.handle}`);
  refresh(handle);
  return { success: "Saved." };
}

/**
 * What the save button on a (statically cached) directory profile should show
 * for whoever is looking: owners see saved/unsaved, everyone else a sign-up
 * nudge (anon) or nothing (trades).
 */
export async function trustedStateAction(
  organizationId: string,
): Promise<{ viewer: "owner" | "anon" | "other"; saved: boolean }> {
  const session = await getSession();
  if (!session) return { viewer: "anon", saved: false };
  if (!(TRUSTED_ROLES as readonly string[]).includes(session.profile.primary_role)) return { viewer: "other", saved: false };
  if (!z.uuid().safeParse(organizationId).success || !isServiceConfigured()) return { viewer: "owner", saved: false };
  const { data } = await createServiceClient()
    .from("trusted_list_items")
    .select("organization_id")
    .eq("owner_id", session.userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { viewer: "owner", saved: Boolean(data) };
}
