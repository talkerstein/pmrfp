import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { REPORT_TYPES, canUpload, checkPdf, cleanFileName, titleFromFileName } from "@/lib/report-quotes/rules";
import { countRecentUploads, isMissingTable, orgCountry, storeReportFile } from "@/lib/report-quotes/server";

export const maxDuration = 30;

const fields = z.object({
  reportType: z.enum(REPORT_TYPES).catch("home_inspection"),
  city: z.string().trim().max(120).catch(""),
  region: z.string().trim().max(60).catch(""),
});

/**
 * POST /api/report-quotes/upload — a property manager or realtor uploads an
 * inspection / condition report (multipart: "file", "reportType", "city",
 * "region"). PDF only (checked by content), 15 MB max, 10 uploads per
 * organization per rolling 24 hours. The report row is created through the
 * user's own client (RLS); the file goes to the PRIVATE report-quotes bucket
 * through the service role. Reading the items is a second call (/extract).
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "default");
  if (limited) return rateLimitResponse(limited);
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!["property_manager", "real_estate_agent"].includes(session.profile.primary_role)) return NextResponse.json({ error: "role" }, { status: 403 });
  if (!session.organization) return NextResponse.json({ error: "noOrg" }, { status: 403 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const db = await createClient();
  const used = await countRecentUploads(db, session.organization.id);
  if (!canUpload(used)) return NextResponse.json({ error: "cap" }, { status: 429 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "empty" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const check = checkPdf(data.byteLength, data.subarray(0, 1024));
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.error === "tooBig" ? 413 : 415 });

  const v = fields.parse({ reportType: form.get("reportType"), city: form.get("city"), region: form.get("region") });
  const name = cleanFileName(file.name);
  const { data: report, error } = await db
    .from("quote_reports")
    .insert({
      organization_id: session.organization.id,
      created_by: session.userId,
      title: titleFromFileName(name, "Inspection report"),
      report_type: v.reportType,
      source: "upload",
      city: v.city || null,
      region: v.region || null,
      country: orgCountry(session.organization),
    })
    .select("id,organization_id")
    .single<{ id: string; organization_id: string }>();
  if (error || !report) return NextResponse.json({ error: error && isMissingTable(error) ? "unavailable" : "upload" }, { status: 503 });

  const stored = await storeReportFile(createServiceClient(), report, data, name);
  if (!stored) {
    await db.from("quote_reports").delete().eq("id", report.id);
    return NextResponse.json({ error: "upload" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: report.id });
}
