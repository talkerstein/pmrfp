import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getSession } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { attachQuoteFile, readQuoteFile } from "@/lib/bid-compare/server";

export const maxDuration = 30;

/**
 * POST /api/bid-comparisons/upload — the PM attaches a quote file to one of
 * their bids (multipart: "id", "file"). The bid is read through the PM's
 * own client first (RLS: their company's rows only), then the service role
 * stores the file in the private vendor-certificates bucket under quotes/.
 * PDF, JPEG, PNG or WebP up to 10 MB, checked by content. Shares the
 * tracker's upload rate limit.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "cert-upload");
  if (limited) return rateLimitResponse(limited);
  const session = await getSession();
  if (!session || !session.organization) return NextResponse.json({ error: "signIn" }, { status: 401 });
  if (!isServiceConfigured()) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "upload" }, { status: 400 });
  }
  const id = String(form.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const db = await createClient();
  const { data: bid } = await db
    .from("bid_comparison_bids")
    .select("id,organization_id,comparison_id,file_path")
    .eq("id", id)
    .maybeSingle<{ id: string; organization_id: string; comparison_id: string; file_path: string | null }>();
  if (!bid) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const file = await readQuoteFile(form.get("file"));
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: file.error === "tooBig" ? 413 : 415 });
  const ok = await attachQuoteFile(createServiceClient(), bid, file);
  if (!ok) return NextResponse.json({ error: "upload" }, { status: 502 });
  return NextResponse.json({ ok: true, name: file.name });
}
