"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { karmaSyncAfter } from "@/lib/karma/sync";
import { logAudit } from "@/lib/audit";

const ORGS = "/admin/organizations";
const EDITED = `${ORGS}?view=edited`;
const SUSPENDED = `${ORGS}?view=suspended`;

/**
 * Admin: approve or reject a company waiting in pending_review. Only moves
 * rows that are still pending, so it can never undo a suspension or re-list a
 * rejected profile. Service client after the role check: the admin table has
 * no RLS update path for organizations.
 */
export async function reviewOrganizationAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["approved", "rejected"].includes(decision)) redirect(ORGS);

  const { data } = await createServiceClient()
    .from("organizations")
    .update({ profile_status: decision })
    .eq("id", id)
    .eq("profile_status", "pending_review")
    .select("id");
  if (data?.length) {
    await logAudit({ actorUserId: admin.userId, action: `organization.${decision}`, entityType: "organization", entityId: id });
  }
  // Approval is the first verifiable reputation event for a company.
  await karmaSyncAfter({ orgIds: [id] });

  revalidatePath(ORGS);
  revalidatePath("/directory");
  redirect(ORGS);
}

/**
 * "Looks good": an approved company's flagged profile edits were checked.
 * Clears the flag (the company stayed live the whole time). `seen` is the
 * updated_at the admin looked at: if the company saved again since, nothing
 * is cleared and the admin is sent back to look at the new version.
 */
export async function clearProfileReviewAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const seen = String(formData.get("seen") ?? "");
  if (!id) redirect(EDITED);

  const db = createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("id,updated_at,review_changes")
    .eq("id", id)
    .not("review_flagged_at", "is", null)
    .maybeSingle<{ id: string; updated_at: string; review_changes: unknown }>();
  if (!org) redirect(EDITED);
  if (seen && seen !== org.updated_at) redirect(`${EDITED}&stale=1`);
  const changes = org.review_changes ?? null;

  const { data: cleared } = await db
    .from("organizations")
    .update({ review_flagged_at: null, review_changes: null })
    .eq("id", id)
    .eq("updated_at", org.updated_at)
    .select("id");
  if (!cleared?.length) redirect(`${EDITED}&stale=1`);
  await logAudit({
    actorUserId: admin.userId,
    action: "organization.review_cleared",
    entityType: "organization",
    entityId: id,
    metadata: { changes },
  });

  revalidatePath(ORGS);
  redirect(EDITED);
}

/**
 * Suspend an approved company (from the edited-profiles list): it leaves the
 * directory, alerts and responses at once. Reversible with
 * reinstateOrganizationAction. Only moves approved rows.
 */
export async function suspendOrganizationAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(EDITED);

  const db = createServiceClient();
  const { data: org } = await db
    .from("organizations")
    .select("id,review_changes")
    .eq("id", id)
    .eq("profile_status", "approved")
    .maybeSingle<{ id: string; review_changes: unknown }>();
  if (org) {
    const changes = org.review_changes ?? null;
    const { data } = await db
      .from("organizations")
      .update({ profile_status: "suspended", review_flagged_at: null, review_changes: null })
      .eq("id", id)
      .eq("profile_status", "approved")
      .select("id");
    if (data?.length) {
      await logAudit({
        actorUserId: admin.userId,
        action: "organization.suspended",
        entityType: "organization",
        entityId: id,
        metadata: { changes },
      });
      await karmaSyncAfter({ orgIds: [id] });
    }
  }

  revalidatePath(ORGS);
  revalidatePath("/directory");
  redirect(EDITED);
}

/** Undo a suspension: back to approved. Never revives a company merged away as a duplicate (status 'deleted'). */
export async function reinstateOrganizationAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(SUSPENDED);

  const { data } = await createServiceClient()
    .from("organizations")
    .update({ profile_status: "approved" })
    .eq("id", id)
    .eq("profile_status", "suspended")
    .neq("status", "deleted")
    .select("id");
  if (data?.length) {
    await logAudit({ actorUserId: admin.userId, action: "organization.reinstated", entityType: "organization", entityId: id });
    await karmaSyncAfter({ orgIds: [id] });
  }

  revalidatePath(ORGS);
  revalidatePath("/directory");
  redirect(SUSPENDED);
}
