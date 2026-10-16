"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, requireRole, roleHome } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { resolveVisitorUpgrade, VISITOR_UPGRADE_PATH, type BusinessRole } from "@/lib/auth/visitor-upgrade";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { ActionState } from "@/lib/auth/actions";

function formLang(formData: FormData): Locale {
  const v = formData.get("lang");
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

/**
 * Switches a visitor account to a business role and reopens company
 * onboarding. Service role, because guard_users_profile_privileged stops users
 * changing their own role. The `primary_role = 'visitor'` filter makes it
 * one-shot: a second call (another tab, a double click, staff and the member
 * at once) changes nothing. Every switch is written to audit_logs.
 */
async function convertVisitorAccount(o: {
  userId: string;
  to: BusinessRole;
  actorUserId: string;
  by: "self" | "staff";
  company?: string;
}): Promise<"converted" | "already" | "error"> {
  if (!isServiceConfigured()) return "error";
  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from("users_profile")
    .update({ primary_role: o.to, onboarding_completed: false })
    .eq("id", o.userId)
    .eq("primary_role", "visitor")
    .select("id");
  if (error) {
    console.error("[visitor-upgrade]", error.message);
    return "error";
  }
  if (!rows?.length) return "already";
  // Keep auth metadata in step (what an email sign-up writes), and prefill the
  // company name at onboarding when they typed one.
  const { error: metaErr } = await admin.auth.admin.updateUserById(o.userId, {
    user_metadata: { primary_role: o.to, upgraded_from: "visitor", ...(o.company ? { pref_company: o.company } : {}) },
  });
  if (metaErr) console.error("[visitor-upgrade] metadata", metaErr.message);
  await logAudit({
    actorUserId: o.actorUserId,
    action: "user.visitor_converted",
    entityType: "user",
    entityId: o.userId,
    metadata: { from: "visitor", to: o.to, by: o.by },
  });
  console.info("[visitor-upgrade] converted", { userId: o.userId, to: o.to, by: o.by });
  return "converted";
}

/** The member's own "List my business free": visitor → trade/supplier, then company onboarding. */
export async function upgradeVisitorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const lang = formLang(formData);
  const m = getDictionary(lang).auth.visitorUpgrade;
  if (!isSupabaseConfigured()) return { error: getDictionary(lang).auth.actions.demo };
  const session = await getSession();
  if (!session) redirect(localizePath(`/sign-in?next=${encodeURIComponent(VISITOR_UPGRADE_PATH)}`, lang));

  const pick = resolveVisitorUpgrade(session.profile.primary_role, formData.get("role"));
  if (!pick.ok) {
    if (pick.reason === "invalid_role") return { error: m.pickOne };
    redirect(localizePath(roleHome(session.profile.primary_role), lang)); // not a visitor: nothing to switch
  }
  // Already switched (another tab): carry on to wherever they are in setup.
  if (!pick.changed) redirect(localizePath(session.profile.onboarding_completed ? roleHome(pick.to) : "/onboarding", lang));
  const company = String(formData.get("company") ?? "").trim().slice(0, 120);
  const r = await convertVisitorAccount({ userId: session.userId, to: pick.to, actorUserId: session.userId, by: "self", company });
  if (r === "error") return { error: m.failed };
  redirect(localizePath("/onboarding", lang));
}

/**
 * Staff: "Convert to trade" (or supplier) on /admin/users, for a business
 * that signed up as a visitor. Same one-shot switch; next time they sign in,
 * onboarding asks for their company. No email is sent.
 */
export async function adminConvertVisitorAction(formData: FormData): Promise<void> {
  const staff = await requireRole(["admin", "super_admin"]);
  const userId = String(formData.get("userId") ?? "");
  const role = formData.get("role") ?? "trade";
  if (userId && isServiceConfigured()) {
    const { data: row } = await createServiceClient()
      .from("users_profile")
      .select("primary_role")
      .eq("id", userId)
      .maybeSingle<{ primary_role: Parameters<typeof resolveVisitorUpgrade>[0] }>();
    const pick = row ? resolveVisitorUpgrade(row.primary_role, role) : null;
    if (pick?.ok && pick.changed) {
      await convertVisitorAccount({ userId, to: pick.to, actorUserId: staff.userId, by: "staff" });
    }
  }
  revalidatePath("/[lang]/admin/users", "page");
  redirect("/admin/users");
}
