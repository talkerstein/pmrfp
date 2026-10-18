import { NextResponse } from "next/server";
import { isServiceConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSession } from "@/lib/access/access";
import { canSaveRfps, viewerOf } from "@/lib/access/free-actions";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const SLUG = /^[a-z0-9][a-z0-9-]{0,200}$/;

/**
 * Save / unsave an RFP. Free for signed-in trade and supplier accounts
 * (lib/access/free-actions); Trade Pro isn't required. Free viewers only
 * have the public slug, so the id is looked up on the published listing.
 * Row level security (migration 20261018000010) allows a user to save for
 * themselves only.
 */
export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "save-rfp");
  if (limited) return rateLimitResponse(limited);

  let body: { rfpId?: string; rfpSlug?: string; action?: "save" | "unsave" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.rfpId && !body.rfpSlug) return NextResponse.json({ error: "Missing rfpId" }, { status: 400 });
  if (body.rfpSlug && !SLUG.test(body.rfpSlug)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canSaveRfps(viewerOf(session))) {
    return NextResponse.json({ error: "A trade or supplier account is required" }, { status: 403 });
  }

  const supabase = await createClient();
  let rfpId = body.rfpId ?? null;
  if (!rfpId && body.rfpSlug) {
    // The public teaser view: published listings only.
    const { data } = await supabase.from("rfp_public").select("id").eq("slug", body.rfpSlug).maybeSingle<{ id: string }>();
    rfpId = data?.id ?? null;
  }
  if (!rfpId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "unsave") {
    await supabase.from("saved_rfps").delete().eq("user_id", session.userId).eq("rfp_id", rfpId);
    return NextResponse.json({ ok: true });
  }
  const row = { user_id: session.userId, organization_id: session.organization?.id ?? null, rfp_id: rfpId };
  const { error } = await supabase.from("saved_rfps").upsert(row, { onConflict: "user_id,rfp_id", ignoreDuplicates: true });
  if (error && isServiceConfigured()) {
    // Before migration 20261018000010 runs, RLS only lets paid members insert.
    // The rule above already decided this user may save: write it as the server.
    const { error: svcErr } = await createServiceClient().from("saved_rfps").upsert(row, { onConflict: "user_id,rfp_id", ignoreDuplicates: true });
    if (svcErr) return NextResponse.json({ error: "Could not save" }, { status: 500 });
  } else if (error) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
