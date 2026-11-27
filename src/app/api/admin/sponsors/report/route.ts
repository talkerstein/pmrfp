import { getSession, isAdminRole } from "@/lib/access/access";
import { isVpsLiveCustomerAuth } from "@/lib/d1/staging-config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sponsorAdminDatabase, loadAdminSponsor, loadSponsorReport } from "@/lib/sponsors/admin";
import { monthRange, reportCsv } from "@/lib/sponsors/report";
import { torontoDay } from "@/lib/sponsors/model";

/** CSV of one sponsor's month (admins only): /api/admin/sponsors/report?id=<uuid>&month=YYYY-MM. */
export async function GET(request: Request) {
  if (!isVpsLiveCustomerAuth() && !isSupabaseConfigured()) return new Response("Not available", { status: 503 });
  const session = await getSession().catch(() => null);
  if (!session || !isAdminRole(session.profile.primary_role) || session.profile.status !== "active") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad request", { status: 400 });
  const supabase = await sponsorAdminDatabase();
  const row = await loadAdminSponsor(supabase, id);
  if (!row) return new Response("Not found", { status: 404 });
  const { month, from, to } = monthRange(url.searchParams.get("month"), torontoDay());
  const report = await loadSponsorReport(supabase, row.slug, month, from, to);
  return new Response(reportCsv(row.name, report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pmrfp-sponsor-${row.slug}-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
