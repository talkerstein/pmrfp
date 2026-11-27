import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { keepD1RfpAlive, RFP_EXTENSION_DAYS } from "@/lib/d1/rfp-expiry";

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
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${base}/rfp/kept?status=invalid`);
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    const destination = new URL("/rfp/kept", base);
    try {
      const status = await keepD1RfpAlive(vpsAppDatabase(), token);
      destination.searchParams.set("status", status);
      if (status === "ok") destination.searchParams.set("days", String(RFP_EXTENSION_DAYS));
    } catch {
      destination.searchParams.set("status", "error");
    }
    return NextResponse.redirect(destination, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  if (!isServiceConfigured()) return NextResponse.redirect(`${base}/rfp/kept?status=error`);

  const supabase = createServiceClient();
  const { data: rfp } = await supabase
    .from("rfp_posts")
    .select("id,status")
    .eq("keep_alive_token", token)
    .maybeSingle<{ id: string; status: string }>();
  if (!rfp) return NextResponse.redirect(`${base}/rfp/kept?status=invalid`);

  // A town's sealed quote box can't be kept alive by link: after closing its date is fixed (the database refuses it too).
  const { data: box } = await supabase.from("rfp_posts").select("sealed").eq("id", rfp.id).maybeSingle<{ sealed: boolean | null }>();
  if (box?.sealed) return NextResponse.redirect(`${base}/rfp/kept?status=notlive`);

  // Revive only a live or recently-auto-expired listing — never silently
  // un-close one the PM genuinely awarded / closed / archived.
  if (rfp.status !== "published" && rfp.status !== "expired") {
    return NextResponse.redirect(`${base}/rfp/kept?status=notlive`);
  }

  const newDeadline = new Date(Date.now() + RFP_EXTENSION_DAYS * 86400000).toISOString().slice(0, 10);
  const { error } = await supabase
    .from("rfp_posts")
    .update({ deadline: newDeadline, expiry_notice_sent_at: null, status: "published" })
    .eq("id", rfp.id);
  if (error) return NextResponse.redirect(`${base}/rfp/kept?status=error`);

  return NextResponse.redirect(`${base}/rfp/kept?status=ok&days=${RFP_EXTENSION_DAYS}`);
}
