import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { isPastRetention } from "@/lib/report-quotes/rules";
import { signReportFile } from "@/lib/report-quotes/server";

/**
 * GET /api/report-quotes/file?id=… — open a stored report. Members of the
 * owning organization only (read through their own client, RLS), and only
 * until its 90 days are up. Redirects to a 2-minute signed URL; a "#page=N"
 * on this link carries over, so source-page links land on the right page.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const db = await createClient();
  const { data: report } = await db
    .from("quote_reports")
    .select("file_path,report_deleted_after")
    .eq("id", id.data)
    .maybeSingle<{ file_path: string | null; report_deleted_after: string }>();
  if (!report?.file_path || isPastRetention(report.report_deleted_after)) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await signReportFile(createServiceClient(), report.file_path);
  if (!url) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
