import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";

/**
 * One-click "keep my RFP live" link from the deadline-expiry email.
 * Token-authed — the unguessable keep_alive_token IS the credential (no login).
 * Pushes the deadline out 30 days, clears the expiry notice, and revives an
 * already-auto-expired listing. Then redirects to a friendly confirmation page.
 *
 * GET is safe here: the only state change is "extend / revive", which errs
 * toward keeping a live job on the board — there is no destructive path behind
 * this link (expiry is cron-driven, never link-driven).
 */
const KEEP_DAYS = 30;

export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${base}/rfp/kept?status=invalid`);
  if (!isServiceConfigured()) return NextResponse.redirect(`${base}/rfp/kept?status=error`);

  const supabase = createServiceClient();
  const { data: rfp } = await supabase
    .from("rfp_posts")
    .select("id,status")
    .eq("keep_alive_token", token)
    .maybeSingle<{ id: string; status: string }>();
  if (!rfp) return NextResponse.redirect(`${base}/rfp/kept?status=invalid`);

  // Revive only a live or recently-auto-expired listing — never silently
  // un-close one the PM genuinely awarded / closed / archived.
  if (rfp.status !== "published" && rfp.status !== "expired") {
    return NextResponse.redirect(`${base}/rfp/kept?status=notlive`);
  }

  const newDeadline = new Date(Date.now() + KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const { error } = await supabase
    .from("rfp_posts")
    .update({ deadline: newDeadline, expiry_notice_sent_at: null, status: "published" })
    .eq("id", rfp.id);
  if (error) return NextResponse.redirect(`${base}/rfp/kept?status=error`);

  return NextResponse.redirect(`${base}/rfp/kept?status=ok&days=${KEEP_DAYS}`);
}
