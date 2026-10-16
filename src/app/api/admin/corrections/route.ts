import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/access/access";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";
import { FINAL_STATUSES, resolutionSchema } from "@/lib/corrections/rules";

/**
 * Admin: set a correction request's status and resolution note
 * (POST JSON { id, status, resolution }). Final statuses stamp resolved_at /
 * resolved_by. Admins only, same-origin only.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !isServiceConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status === "suspended") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = resolutionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 422 });
  const { id, status, resolution } = parsed.data;
  const final = FINAL_STATUSES.includes(status);
  const now = new Date().toISOString();
  const { error } = await createServiceClient()
    .from("correction_requests")
    .update({
      status,
      resolution: resolution || null,
      resolved_at: final ? now : null,
      resolved_by: final ? session.userId : null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({ actorUserId: session.userId, action: "correction.update", entityType: "correction_requests", entityId: id, metadata: { status } });
  return NextResponse.json({ ok: true });
}
