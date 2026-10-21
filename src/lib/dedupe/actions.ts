"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { DEFAULT_LOCALE, isEnabledLocale, localizePath, type Locale } from "@/i18n/config";
import { cancelJoinRequest, createJoinRequest, decideJoinRequest } from "./join";
import type { MatchReason } from "./company";

/**
 * Join requests (lib/dedupe/join): ask to join an existing company at
 * onboarding, withdraw it, and approve / decline it (company owner or
 * admin, or a PMRFP admin from /admin/duplicates).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: MatchReason[] = ["name", "website", "phone", "email_domain", "similar_name"];
/** Where a decision may send you back to. */
const BACKS = ["/dashboard", "/pm-dashboard", "/buyer-dashboard", "/admin/duplicates"] as const;

function formLang(formData: FormData): Locale {
  const v = formData.get("lang");
  return isEnabledLocale(v) ? v : DEFAULT_LOCALE;
}

function backPath(formData: FormData): string {
  const v = String(formData.get("back") ?? "");
  return (BACKS as readonly string[]).includes(v) ? v : "/dashboard";
}

/** Onboarding: "Request to join this company". */
export async function requestJoinAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  const orgId = String(formData.get("orgId") ?? "");
  if (!UUID.test(orgId)) redirect(localizePath("/onboarding?join_error=no_company", lang));
  if (!isServiceConfigured()) redirect(localizePath("/onboarding?join_error=missing_table", lang));
  const reasons = formData.getAll("reason").map(String).filter((r): r is MatchReason => (REASONS as string[]).includes(r));

  const result = await createJoinRequest(createServiceClient(), { organizationId: orgId, userId: session.userId, reasons });
  if (!result.ok) {
    // Already asked: just show the pending state.
    if (result.reason === "already_pending") redirect(localizePath("/onboarding", lang));
    redirect(localizePath(`/onboarding?join_error=${result.reason}`, lang));
  }
  await logAudit({
    actorUserId: session.userId,
    action: "organization.join_requested",
    entityType: "organization",
    entityId: orgId,
    metadata: { requestId: result.id, reasons, approvers: result.approvers.length },
  });
  redirect(localizePath("/onboarding", lang));
}

/** Onboarding: withdraw the pending request (then they can create their own listing). */
export async function cancelJoinRequestAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  const id = String(formData.get("requestId") ?? "");
  if (UUID.test(id) && isServiceConfigured()) {
    await cancelJoinRequest(createServiceClient(), { requestId: id, userId: session.userId });
  }
  redirect(localizePath("/onboarding?join=cancelled", lang));
}

/** Approve or decline. The company's owner/admin, or a PMRFP admin. */
export async function decideJoinRequestAction(formData: FormData): Promise<void> {
  const lang = formLang(formData);
  const back = backPath(formData);
  const session = await getSession();
  if (!session) redirect(localizePath("/sign-in", lang));
  if (session.profile.status === "suspended") redirect(localizePath(`${back}?join=error`, lang));
  const id = String(formData.get("requestId") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!UUID.test(id) || !isServiceConfigured()) redirect(localizePath(`${back}?join=error`, lang));

  const deciderIsAdmin = isAdminRole(session.profile.primary_role);
  const result = await decideJoinRequest(createServiceClient(), { requestId: id, deciderId: session.userId, deciderIsAdmin, approve });
  if (!result.ok) redirect(localizePath(`${back}?join=error`, lang));
  await logAudit({
    actorUserId: session.userId,
    action: approve ? "organization.join_approved" : "organization.join_declined",
    entityType: "organization_join_request",
    entityId: id,
    metadata: { asAdmin: deciderIsAdmin },
  });
  revalidatePath(back);
  redirect(localizePath(`${back}?join=${result.status}`, lang));
}
