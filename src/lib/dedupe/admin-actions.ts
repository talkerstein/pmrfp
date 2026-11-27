"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, isAdminRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";
import { mergeOrganizations, pickPrimary } from "./merge";
import { isMissingRelation, orderedPair, type ReviewStatus } from "./review";
import type { UserRole } from "@/types/db";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { recordVpsDuplicateReview, setVpsDuplicateAccountStatus } from "@/lib/d1/vps-duplicate-review";
import { mergeVpsOrganizationPair } from "@/lib/d1/vps-organization-merge";
import { purgeOutCache } from "@/lib/links/data";
import { karmaSyncAfter } from "@/lib/karma/sync";

/**
 * /admin/duplicates actions. Admins only (requireRole), every one audited.
 * Nothing here hard-deletes: merging retires the newer listing (kept,
 * status 'deleted', merged_into the older one), disabling an account is a
 * suspension + Supabase Auth ban that "Re-enable" undoes.
 */

const BACK = "/admin/duplicates";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Supabase has no "forever": 100 years. */
const BAN_DURATION = "876000h";

function back(params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${BACK}?${q}` : BACK);
}

async function requireAdmin() {
  const session = await requireRole(["admin", "super_admin"]);
  if (isVpsLiveCustomerAuth() ? session.profile.status !== "active" : !isServiceConfigured()) back({ error: "Duplicate review is unavailable." });
  return session;
}

function ids(formData: FormData, ...names: string[]): string[] {
  return names.map((n) => String(formData.get(n) ?? ""));
}

/** Remember an admin decision on a pair. False when the table isn't there yet. */
async function recordReview(kind: "account" | "company", x: string, y: string, status: ReviewStatus, actorId: string, note?: string): Promise<boolean> {
  const [a_id, b_id] = orderedPair(x, y);
  const { error } = await createServiceClient()
    .from("duplicate_reviews")
    .upsert(
      { kind, a_id, b_id, status, source: "admin", resolved_by: actorId, resolved_at: new Date().toISOString(), ...(note ? { note } : {}) },
      { onConflict: "kind,a_id,b_id" },
    );
  if (error && !isMissingRelation(error)) console.error("[dedupe:review]", error.message);
  return !error;
}

/** Merge two listings: the older one stays, everything moves to it. */
export async function mergeCompaniesAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const [x, y] = ids(formData, "aId", "bId");
  if (!UUID.test(x) || !UUID.test(y) || x === y) back({ error: "Pick two different companies." });
  if (formData.get("confirm") !== "merge") back({ error: "Tick the box to confirm the merge." });
  if (isVpsLiveCustomerAuth()) {
    const merged = await mergeVpsOrganizationPair(session.userId, x, y).catch(() => ({ state: "unavailable" } as const));
    if (merged.state === "protected") back({ error: `Transfer these records before merging: ${merged.records.join(", ")}.` });
    if (merged.state !== "merged") back({ error: "The companies could not be merged. Check that both listings are active." });
    purgeOutCache();
    await karmaSyncAfter({ orgIds: [x, y] });
    revalidatePath(BACK);
    revalidatePath("/admin/organizations");
    revalidatePath("/directory");
    back({ ok: `Merged "${merged.duplicate}" into "${merged.primary}". ${merged.moved} records moved and ${merged.retained} equivalent records retained on the archived listing.` });
  }

  const db = createServiceClient();
  const { data: orgs, error } = await db.from("organizations").select("id,name,created_at,status").in("id", [x, y]);
  const list = (orgs ?? []) as { id: string; name: string; created_at: string; status: string }[];
  if (error || list.length !== 2) back({ error: "One of those companies no longer exists." });
  if (list.some((o) => o.status === "deleted")) back({ error: "One of those companies was already merged or removed." });

  const { primary, duplicate } = pickPrimary(list[0], list[1]);
  const report = await mergeOrganizations(db, { primaryId: primary.id, duplicateId: duplicate.id });
  await logAudit({
    actorUserId: session.userId,
    action: "organization.merge",
    entityType: "organization",
    entityId: primary.id,
    metadata: { primary: primary.id, primaryName: primary.name, duplicate: duplicate.id, duplicateName: duplicate.name, report },
  });
  await recordReview("company", primary.id, duplicate.id, "merged", session.userId, `Merged "${duplicate.name}" into "${primary.name}".`);
  revalidatePath(BACK);
  const moved = report.members.moved + report.steps.reduce((n, s) => n + s.moved, 0);
  const summary = `Merged "${duplicate.name}" into "${primary.name}" (${moved} rows moved).`;
  if (!report.ok || report.warnings.length) back({ error: `${summary} Check: ${report.warnings.join(" | ").slice(0, 600)}` });
  back({ ok: summary });
}

/** Disable an account (suspend + ban sign-in). Reversible with enableAccountAction. */
export async function disableAccountAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const [userId, otherId] = ids(formData, "userId", "otherId");
  if (!UUID.test(userId)) back({ error: "Missing account." });
  if (userId === session.userId) back({ error: "You can't disable your own account." });
  if (isVpsLiveCustomerAuth()) {
    const result = await setVpsDuplicateAccountStatus(session.userId, userId, otherId, false)
      .catch(() => ({ state: "unavailable" } as const));
    revalidatePath(BACK);
    if (result.state === "auth_incomplete") back({ error: "The account is suspended. Retry to finish revoking its sign-in sessions." });
    if (result.state !== "updated") back({ error: "Could not suspend the account." });
    back({ ok: `Disabled ${result.email}.` });
  }

  const db = createServiceClient();
  const { data: profile } = await db.from("users_profile").select("id,email,primary_role,status").eq("id", userId).maybeSingle<{ id: string; email: string; primary_role: UserRole; status: string }>();
  if (!profile) back({ error: "That account no longer exists." });
  if (isAdminRole(profile!.primary_role)) back({ error: "Admin accounts can't be disabled here." });

  const { error } = await db.from("users_profile").update({ status: "suspended" }).eq("id", userId);
  if (error) back({ error: `Could not disable: ${error.message}` });
  const { error: banErr } = await db.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
  await logAudit({
    actorUserId: session.userId,
    action: "user.disable_duplicate",
    entityType: "user",
    entityId: userId,
    metadata: { email: profile!.email, duplicateOf: UUID.test(otherId) ? otherId : null, banned: !banErr, previousStatus: profile!.status },
  });
  if (UUID.test(otherId)) await recordReview("account", userId, otherId, "disabled", session.userId);
  revalidatePath(BACK);
  if (banErr) back({ error: `Suspended, but the sign-in ban failed: ${banErr.message}` });
  back({ ok: `Disabled ${profile!.email}. "Re-enable" undoes it.` });
}

/** Undo disableAccountAction. */
export async function enableAccountAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const [userId] = ids(formData, "userId");
  if (!UUID.test(userId)) back({ error: "Missing account." });
  if (isVpsLiveCustomerAuth()) {
    const result = await setVpsDuplicateAccountStatus(session.userId, userId, null, true)
      .catch(() => ({ state: "unavailable" } as const));
    revalidatePath(BACK);
    const users = formData.get("back") === "users";
    if (users) {
      revalidatePath("/admin/users");
      redirect(`/admin/users?${result.state === "updated" ? "enabled=1" : "error=enable"}`);
    }
    if (result.state === "other_ban") back({ error: "This account has a separate sign-in restriction. Review it before enabling the account." });
    if (result.state !== "updated") back({ error: "Could not re-enable the account." });
    back({ ok: "Account re-enabled." });
  }
  const db = createServiceClient();
  const { error } = await db.from("users_profile").update({ status: "active" }).eq("id", userId);
  if (error) back({ error: `Could not re-enable: ${error.message}` });
  const { error: banErr } = await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
  await logAudit({ actorUserId: session.userId, action: "user.enable", entityType: "user", entityId: userId, metadata: { unbanned: !banErr } });
  revalidatePath(BACK);
  if (banErr) back({ error: `Re-activated, but lifting the sign-in ban failed: ${banErr.message}` });
  back({ ok: "Account re-enabled." });
}

/** Not a duplicate: hide the pair from the list. */
export async function dismissDuplicateAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const kind = formData.get("kind") === "company" ? "company" : "account";
  const [x, y] = ids(formData, "aId", "bId");
  if (!UUID.test(x) || !UUID.test(y) || x === y) back({ error: "Missing pair." });
  if (isVpsLiveCustomerAuth()) {
    const saved = await recordVpsDuplicateReview(session.userId, kind, x, y, "dismissed",
      String(formData.get("note") ?? "").slice(0, 500) || null).catch(() => false);
    if (!saved) back({ error: "Could not dismiss the pair." });
    revalidatePath(BACK);
    back({ ok: "Dismissed." });
  }
  const saved = await recordReview(kind, x, y, "dismissed", session.userId, String(formData.get("note") ?? "").slice(0, 500) || undefined);
  if (!saved) back({ error: "Dismissing needs migration 20261019000001_dedupe_signups.sql. Run it in Supabase first." });
  await logAudit({ actorUserId: session.userId, action: "duplicate.dismiss", entityType: kind === "company" ? "organization" : "user", entityId: x, metadata: { kind, a: x, b: y } });
  revalidatePath(BACK);
  back({ ok: "Dismissed." });
}
