import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/access/access";

export async function POST(request: Request) {
  let body: { rfpId?: string; action?: "save" | "unsave" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.rfpId) return NextResponse.json({ error: "Missing rfpId" }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, demo: true });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!session.hasTradeAccess) {
    return NextResponse.json({ error: "Trade Pro membership required" }, { status: 403 });
  }

  const supabase = await createClient();
  if (body.action === "unsave") {
    await supabase.from("saved_rfps").delete().eq("user_id", session.userId).eq("rfp_id", body.rfpId);
  } else {
    await supabase.from("saved_rfps").insert({
      user_id: session.userId,
      organization_id: session.organization?.id ?? null,
      rfp_id: body.rfpId,
    });
  }
  return NextResponse.json({ ok: true });
}
