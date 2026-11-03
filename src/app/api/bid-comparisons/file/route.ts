import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { signQuoteFile } from "@/lib/bid-compare/server";

/**
 * GET /api/bid-comparisons/file?id=<bid> — open a stored quote. The bid is
 * read through the PM's own client (RLS), so only members of the company
 * that owns the comparison get the 2-minute signed link. Never on a share
 * link.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const db = await createClient();
  const { data } = await db.from("bid_comparison_bids").select("file_path").eq("id", id).maybeSingle<{ file_path: string | null }>();
  if (!data?.file_path) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const url = await signQuoteFile(createServiceClient(), data.file_path);
  if (!url) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
