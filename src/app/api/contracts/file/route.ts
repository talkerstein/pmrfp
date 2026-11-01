import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { signContractFile } from "@/lib/contracts/server";

/**
 * GET /api/contracts/file?id=<contract> — open a stored contract. The row
 * is read through the PM's own client (RLS), so only members of the
 * company that owns the contract get the 2-minute signed link.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await createClient();
  const { data } = await db.from("service_contracts").select("file_path").eq("id", id).maybeSingle<{ file_path: string | null }>();
  if (!data?.file_path) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await signContractFile(createServiceClient(), data.file_path);
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
