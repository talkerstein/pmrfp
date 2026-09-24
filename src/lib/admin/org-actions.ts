"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Admin: approve or reject a company waiting in pending_review. Only moves
 * rows that are still pending, so it can never undo a suspension or re-list a
 * rejected profile. Service client after the role check: the admin table has
 * no RLS update path for organizations.
 */
export async function reviewOrganizationAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "super_admin"]);
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || !["approved", "rejected"].includes(decision)) redirect("/admin/organizations");

  await createServiceClient()
    .from("organizations")
    .update({ profile_status: decision })
    .eq("id", id)
    .eq("profile_status", "pending_review");

  revalidatePath("/admin/organizations");
  revalidatePath("/directory");
  redirect("/admin/organizations");
}
