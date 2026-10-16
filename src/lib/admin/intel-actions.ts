"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/access/access";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { logAudit } from "@/lib/audit";

/**
 * Admin: switch Award Intelligence on or off for a company by hand (design
 * partners, comps, support). A grant is status 'comped', source 'admin',
 * optionally ending on a date. Revoking sets 'canceled'. Never touches the
 * company's Trade Pro subscription. Service client after the role check
 * (intel_access has no client write path).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (q: string) => redirect(`/admin/intel?${q}`);

export async function grantIntelAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  if (!isServiceConfigured()) back("error=unavailable");
  const who = String(formData.get("org") ?? "").trim();
  const until = String(formData.get("until") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!who) back("error=org");
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) back("error=date");

  const db = createServiceClient();
  const q = db.from("organizations").select("id,name");
  const { data: org } = await (UUID.test(who) ? q.eq("id", who) : q.eq("slug", who)).maybeSingle<{ id: string; name: string }>();
  if (!org) back("error=org");

  const { error } = await db.from("intel_access").upsert(
    {
      organization_id: org!.id,
      status: "comped",
      source: "admin",
      expires_at: until ? `${until}T23:59:59-05:00` : null,
      granted_by: admin.userId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) back(`error=${encodeURIComponent(error.message.slice(0, 120))}`);
  await logAudit({ actorUserId: admin.userId, action: "intel.grant", entityType: "organization", entityId: org!.id, metadata: { until: until || null, note } });
  revalidatePath("/admin/intel");
  back(`granted=${encodeURIComponent(org!.name)}`);
}

export async function revokeIntelAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin", "super_admin"]);
  if (!isServiceConfigured()) back("error=unavailable");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) back("error=org");
  const { error } = await createServiceClient()
    .from("intel_access")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("organization_id", id)
    .eq("source", "admin");
  if (error) back(`error=${encodeURIComponent(error.message.slice(0, 120))}`);
  await logAudit({ actorUserId: admin.userId, action: "intel.revoke", entityType: "organization", entityId: id });
  revalidatePath("/admin/intel");
  back("revoked=1");
}
