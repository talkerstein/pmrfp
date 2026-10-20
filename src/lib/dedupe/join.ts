/**
 * "Request to join this company": someone onboarding finds their company is
 * already listed and asks to be added instead of creating a second listing.
 *
 * The company's owner or admin approves it (dashboard). A company with no
 * owner/admin goes to the PMRFP admin queue (/admin/duplicates), and admins
 * can decide any request. Approval adds them as a member and finishes their
 * onboarding. In-app notifications only: no emails.
 *
 * Every function takes the (service) client, so tests pass a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "./review";

export type JoinStatus = "pending" | "approved" | "declined" | "cancelled";

export interface JoinRequestRow {
  id: string;
  organization_id: string;
  user_id: string;
  status: JoinStatus;
  match_reasons: string[];
  created_at: string;
}

export type CreateJoinResult =
  | { ok: true; id: string; approvers: string[] }
  | { ok: false; reason: "missing_table" | "already_member" | "already_pending" | "no_company" | "failed" };

/** Owners and admins of the company (who may approve). */
export async function joinApprovers(db: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data } = await db
    .from("organization_members")
    .select("user_id,role")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"]);
  return ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
}

export async function createJoinRequest(
  db: SupabaseClient,
  input: { organizationId: string; userId: string; reasons: string[] },
): Promise<CreateJoinResult> {
  const { data: org } = await db.from("organizations").select("id,name,status").eq("id", input.organizationId).maybeSingle<{ id: string; name: string; status: string }>();
  if (!org || org.status === "deleted") return { ok: false, reason: "no_company" };

  const { data: member } = await db
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (member) return { ok: false, reason: "already_member" };

  const { data, error } = await db
    .from("organization_join_requests")
    .insert({ organization_id: input.organizationId, user_id: input.userId, match_reasons: input.reasons.slice(0, 5) })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    if (isMissingRelation(error)) return { ok: false, reason: "missing_table" };
    if (error?.code === "23505") return { ok: false, reason: "already_pending" };
    console.error("[join:create]", error?.message);
    return { ok: false, reason: "failed" };
  }

  const approvers = await joinApprovers(db, input.organizationId);
  if (approvers.length) {
    await db.from("notifications").insert(
      approvers.map((user_id) => ({
        user_id,
        type: "join_request",
        title: "Someone asked to join your company",
        message: `A new PMRFP member asked to join ${org.name}. Approve or decline it from your dashboard.`,
        link_url: "/dashboard",
      })),
    );
  }
  return { ok: true, id: data.id, approvers };
}

export type DecideJoinResult =
  | { ok: true; status: "approved" | "declined" }
  | { ok: false; reason: "not_found" | "not_pending" | "forbidden" | "failed" };

/**
 * Approve or decline. Allowed for the company's owner/admin, or a PMRFP admin
 * (`deciderIsAdmin`). Approving adds a 'member' and completes the joiner's
 * onboarding.
 */
export async function decideJoinRequest(
  db: SupabaseClient,
  input: { requestId: string; deciderId: string; deciderIsAdmin: boolean; approve: boolean },
): Promise<DecideJoinResult> {
  const { data: req, error } = await db
    .from("organization_join_requests")
    .select("id,organization_id,user_id,status")
    .eq("id", input.requestId)
    .maybeSingle<Pick<JoinRequestRow, "id" | "organization_id" | "user_id" | "status">>();
  if (error || !req) return { ok: false, reason: "not_found" };
  if (req.status !== "pending") return { ok: false, reason: "not_pending" };

  if (!input.deciderIsAdmin) {
    const approvers = await joinApprovers(db, req.organization_id);
    if (!approvers.includes(input.deciderId)) return { ok: false, reason: "forbidden" };
  }

  if (input.approve) {
    const { error: memberErr } = await db
      .from("organization_members")
      .upsert({ organization_id: req.organization_id, user_id: req.user_id, role: "member" }, { onConflict: "organization_id,user_id", ignoreDuplicates: true });
    if (memberErr) {
      console.error("[join:approve]", memberErr.message);
      return { ok: false, reason: "failed" };
    }
    await db.from("users_profile").update({ onboarding_completed: true }).eq("id", req.user_id);
  }

  const status = input.approve ? "approved" : "declined";
  const { error: updErr } = await db
    .from("organization_join_requests")
    .update({ status, decided_by: input.deciderId, decided_at: new Date().toISOString() })
    .eq("id", req.id)
    .eq("status", "pending");
  if (updErr) return { ok: false, reason: "failed" };

  await db.from("notifications").insert({
    user_id: req.user_id,
    type: "join_request",
    title: input.approve ? "You've been added to your company" : "Your request to join was declined",
    message: input.approve
      ? "Your request to join was approved. Your company's listing is now in your dashboard."
      : "The company declined your request. You can create your own listing from onboarding.",
    link_url: input.approve ? "/dashboard" : "/onboarding",
  });
  return { ok: true, status };
}

/** The joiner withdraws their own pending request. */
export async function cancelJoinRequest(db: SupabaseClient, input: { requestId: string; userId: string }): Promise<boolean> {
  const { data, error } = await db
    .from("organization_join_requests")
    .update({ status: "cancelled", decided_by: input.userId, decided_at: new Date().toISOString() })
    .eq("id", input.requestId)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .select("id");
  return !error && (data ?? []).length > 0;
}

/** The signed-in person's open request, with the company name (null if none / no table). */
export async function pendingJoinRequestFor(
  db: SupabaseClient,
  userId: string,
): Promise<{ id: string; organizationId: string; companyName: string; slug: string | null } | null> {
  const { data, error } = await db
    .from("organization_join_requests")
    .select("id,organization_id,organizations(name,slug)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as unknown as { id: string; organization_id: string; organizations: { name: string; slug: string } | { name: string; slug: string }[] | null };
  const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  return { id: row.id, organizationId: row.organization_id, companyName: org?.name ?? "", slug: org?.slug ?? null };
}
