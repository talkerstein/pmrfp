"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { karmaSyncAfter } from "@/lib/karma/sync";
import { logAudit } from "@/lib/audit";
import { purgeOutCache } from "@/lib/links/data";
import { normalizeBlockedDomain } from "@/lib/spam/blocked";
import { rescreenExistingOrganizations } from "@/lib/spam/server";

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

  const db = createServiceClient();
  const { data } = await db
    .from("organizations")
    .update({ profile_status: decision })
    .eq("id", id)
    .eq("profile_status", "pending_review")
    .select("id");
  if (data?.length) {
    await logAudit({ actorUserId: admin.userId, action: `organization.${decision}`, entityType: "organization", entityId: id });
    // If the spam check had held it, the admin's call is recorded there too
    // (separate writes: the columns arrive with migration 20261024000100).
    if (decision === "approved") await db.from("organizations").update({ risk_flagged: false }).eq("id", id).eq("risk_flagged", true);
    await db
      .from("organization_risk")
      .update({ decision, decided_by: admin.userId, decided_at: new Date().toISOString(), held: false })
      .eq("organization_id", id);
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

/* ------------------------------------------------------------------ spam check ("earn the link") */

const HELD = `${ORGS}?view=held`;

/**
 * Admin: decide a listing the spam check held (or auto-rejected, or flagged
 * after an edit while live). approve: live, flag cleared; reject: the listing
 * page goes off; suspend: off too, reversible from the Suspended view.
 * The decision is kept on organization_risk (so a later edit is screened again)
 * and in the audit log. Never touches a company merged away as a duplicate.
 */
export async function resolveHeldOrganizationAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["approved", "rejected", "suspended"].includes(decision)) redirect(HELD);

  const db = createServiceClient();
  const patch: Record<string, unknown> = { profile_status: decision };
  if (decision === "approved") patch.risk_flagged = false;
  const { data } = await db.from("organizations").update(patch).eq("id", id).neq("status", "deleted").select("id");
  if (data?.length) {
    await db
      .from("organization_risk")
      .update({ decision, decided_by: admin.userId, decided_at: new Date().toISOString(), held: false })
      .eq("organization_id", id);
    await logAudit({ actorUserId: admin.userId, action: `organization.spam_${decision}`, entityType: "organization", entityId: id });
    await karmaSyncAfter({ orgIds: [id] });
    purgeOutCache();
  }

  revalidatePath(ORGS);
  revalidatePath("/directory");
  redirect(HELD);
}

/**
 * Admin: run the spam check over the companies already listed. Companies that
 * would be held are flagged (nofollow + noindex, shown in the held queue); no
 * status changes and nothing is deleted. Decide each one in the queue.
 */
export async function screenExistingOrganizationsAction(): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const r = await rescreenExistingOrganizations(createServiceClient());
  await logAudit({ actorUserId: admin.userId, action: "organization.spam_screen_existing", metadata: r });
  revalidatePath(ORGS);
  redirect(`${HELD}&screened=${r.checked}&flagged=${r.flagged}`);
}

/** Admin: mark a company's website link trusted (followed from day one) or take that back. */
export async function setLinkTrustedAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const trusted = String(formData.get("trusted") ?? "") === "1";
  const back = String(formData.get("back") ?? "") === "held" ? HELD : ORGS;
  if (!id) redirect(back);

  const { data } = await createServiceClient()
    .from("organizations")
    .update({ link_trusted: trusted, ...(trusted ? {} : { link_earned_at: null }) })
    .eq("id", id)
    .select("id");
  if (data?.length) {
    await logAudit({ actorUserId: admin.userId, action: trusted ? "organization.link_trusted" : "organization.link_untrusted", entityType: "organization", entityId: id });
    purgeOutCache();
  }
  revalidatePath(ORGS);
  redirect(back);
}

const BLOCKED = "/admin/blocked-domains";

/** Admin: add a domain to the blocked list (email or website on it = the listing is rejected). */
export async function addBlockedDomainAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const domain = normalizeBlockedDomain(String(formData.get("domain") ?? ""));
  if (!domain) redirect(`${BLOCKED}?error=domain`);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;

  const { error } = await createServiceClient()
    .from("blocked_domains")
    .upsert({ domain, reason, created_by: admin.userId }, { onConflict: "domain" });
  if (error) redirect(`${BLOCKED}?error=save`);
  await logAudit({ actorUserId: admin.userId, action: "blocked_domain.added", entityType: "blocked_domain", metadata: { domain, reason } });
  revalidatePath(BLOCKED);
  redirect(`${BLOCKED}?added=${encodeURIComponent(domain)}`);
}

/** Admin: take a domain off the blocked list. Listings already rejected stay as they are. */
export async function removeBlockedDomainAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  const domain = normalizeBlockedDomain(String(formData.get("domain") ?? ""));
  if (!domain) redirect(BLOCKED);
  const { error } = await createServiceClient().from("blocked_domains").delete().eq("domain", domain);
  if (!error) await logAudit({ actorUserId: admin.userId, action: "blocked_domain.removed", entityType: "blocked_domain", metadata: { domain } });
  revalidatePath(BLOCKED);
  redirect(BLOCKED);
}
