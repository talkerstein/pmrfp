import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { signCertFile } from "@/lib/vendor-certs/server";

/**
 * GET /api/vendor-certs/file?id=<certificate> — open a stored certificate.
 * The row is read through the PM's own client (RLS), so only members of
 * the company that tracks the vendor get the 2-minute signed link.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await createClient();
  const { data } = await db.from("vendor_certificates").select("file_path").eq("id", id).maybeSingle<{ file_path: string | null }>();
  if (!data?.file_path) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await signCertFile(createServiceClient(), data.file_path);
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
