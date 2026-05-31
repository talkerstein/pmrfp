import { NextResponse } from "next/server";
import { interestSchema } from "@/lib/validations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/access/access";
import { sendAdminNewInterest, sendInterestConfirmation, sendPmNewInterest } from "@/lib/email/send";
import { EVENT, trackEvent } from "@/lib/analytics";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, "rfp-interest");
  if (limited) return rateLimitResponse(limited);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = interestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!session.hasTradeAccess) {
    return NextResponse.json({ error: "Trade Pro membership required" }, { status: 403 });
  }
  if (!session.organization) {
    return NextResponse.json({ error: "Complete your company profile first" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: rfp } = await supabase
    .from("rfp_posts")
    .select("id,title,posted_by_user_id")
    .eq("id", data.rfpId)
    .maybeSingle<{ id: string; title: string; posted_by_user_id: string | null }>();
  if (!rfp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  const { error } = await supabase.from("rfp_interests").insert({
    rfp_id: rfp.id,
    trade_organization_id: session.organization.id,
    submitted_by_user_id: session.userId,
    message: data.message,
    relevant_experience: data.relevantExperience ?? null,
    availability: data.availability ?? null,
    attachment_url: data.attachmentUrl ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You've already expressed interest in this opportunity." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not submit interest" }, { status: 500 });
  }

  // Look up the PM's email so we can notify them directly (Quest 1.7).
  // Falls back gracefully if the RFP was admin-seeded with no posted_by_user_id.
  let pmEmail: string | null = null;
  if (rfp.posted_by_user_id) {
    const { data: pmProfile } = await supabase
      .from("users_profile")
      .select("email")
      .eq("id", rfp.posted_by_user_id)
      .maybeSingle<{ email: string | null }>();
    pmEmail = pmProfile?.email ?? null;
  }

  await Promise.all([
    sendInterestConfirmation(session.profile.email, rfp.title),
    sendAdminNewInterest({ vendor: session.organization.name, rfpTitle: rfp.title, message: data.message }),
    pmEmail
      ? sendPmNewInterest(pmEmail, {
          vendorName: session.organization.name,
          rfpTitle: rfp.title,
          rfpId: rfp.id,
        })
      : Promise.resolve(),
  ]);
  await trackEvent(EVENT.RFP_INTEREST_SUBMITTED, { rfpId: rfp.id });

  return NextResponse.json({ ok: true });
}
