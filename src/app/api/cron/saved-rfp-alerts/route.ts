import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendSavedRfpAlerts } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { displayTitle } from "@/lib/tenders/title";
import {
  addDays,
  buildSavedAlerts,
  CLOSING_SOON_DAYS,
  ENDED_STATUSES,
  rfpLink,
  savedAlertSubject,
  type SavedRfp,
  type SavedRow,
  type SavedAlertDigest,
} from "@/lib/alerts/saved";
import { cronAuthFailure } from "@/lib/cron-auth";
import { vpsAppDatabase } from "@/lib/d1/http-binding";
import { claimD1SavedAlerts, readD1SavedAlerts } from "@/lib/d1/saved-alerts";

export const maxDuration = 60;

/**
 * Daily saved-tender alerts (Vercel cron, 13:45 UTC). For every tender a
 * member saved: email when it closes within 3 days, and when its status
 * changes (closed / awarded / expired / archived) in the last week. One email
 * per member per run. Dedupes through the existing `notifications` log (no new
 * table), honors email opt-outs (same flags as the daily digest, so its unsubscribe link covers these), and fails soft: any query error just skips.
 * `?dry=1` returns counts without sending. Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const rejected = cronAuthFailure(request.headers.get("authorization"));
  if (rejected) return NextResponse.json({ error: rejected === 401 ? "Unauthorized" : "Cron unavailable" }, { status: rejected });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (process.env.PMRFP_VPS_CUSTOMER_ENGINE === "d1") {
    if (!dry && (!process.env.UNSUBSCRIBE_SECRET ||
        !(process.env.PMRFP_SMTP_ENABLED === "enabled" && process.env.PMRFP_SMTP_PASSWORD || process.env.RESEND_API_KEY))) {
      return NextResponse.json({ error: "Saved-tender email unavailable" }, { status: 503 });
    }
    try {
      const db = vpsAppDatabase();
      const now = new Date();
      const { candidates, digests } = await readD1SavedAlerts(db, now);
      if (dry) return dryResult(candidates, digests);
      let sent = 0;
      for (const digest of digests) {
        const claimed = await claimD1SavedAlerts(db, digest, now);
        if (!claimed.items.length) continue;
        await sendDigest(claimed);
        sent++;
      }
      return NextResponse.json({ sent, candidates });
    } catch {
      return NextResponse.json({ error: "Saved-tender alerts unavailable" }, { status: 503 });
    }
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const supabase = createServiceClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();

  // Candidate tenders first (bounded), then who saved them.
  const [closingRes, endedRes] = await Promise.all([
    supabase
      .from("rfp_posts")
      .select("id,slug,title,status,deadline,source_type")
      .eq("status", "published")
      .gte("deadline", today)
      .lte("deadline", addDays(today, CLOSING_SOON_DAYS))
      .limit(2000),
    supabase
      .from("rfp_posts")
      .select("id,slug,title,status,deadline,source_type")
      .in("status", [...ENDED_STATUSES])
      .or(`closed_at.gte.${weekAgo},updated_at.gte.${weekAgo}`)
      .limit(2000),
  ]);
  if (closingRes.error || endedRes.error) {
    console.error("[saved-rfp-alerts] rfp query failed", closingRes.error ?? endedRes.error);
    return NextResponse.json({ skipped: "rfp query failed" });
  }
  type Row = SavedRfp & { source_type: string | null };
  const rfps = new Map<string, SavedRfp>();
  for (const r of [...(closingRes.data ?? []), ...(endedRes.data ?? [])] as Row[]) {
    rfps.set(r.id, { ...r, title: displayTitle(r.title, r.source_type).title });
  }
  if (!rfps.size) return NextResponse.json({ sent: 0, candidates: 0 });

  const saved: SavedRow[] = [];
  const rfpIds = [...rfps.keys()];
  for (let i = 0; i < rfpIds.length; i += 200) {
    const { data, error } = await supabase
      .from("saved_rfps")
      .select("user_id,rfp_id")
      .in("rfp_id", rfpIds.slice(i, i + 200));
    if (error) {
      console.error("[saved-rfp-alerts] saved_rfps query failed", error);
      return NextResponse.json({ skipped: "saved query failed" });
    }
    saved.push(...((data ?? []) as SavedRow[]));
  }
  if (!saved.length) return NextResponse.json({ sent: 0, candidates: rfps.size });

  const ids = [...new Set(saved.map((s) => s.user_id))];
  const [{ data: profiles }, { data: prefs }, { data: recent }] = await Promise.all([
    supabase.from("users_profile").select("id,email,status").in("id", ids),
    supabase.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids),
    supabase
      .from("notifications")
      .select("user_id,type,link_url")
      .like("type", "saved_%")
      .gte("created_at", new Date(now - 90 * 86_400_000).toISOString())
      .in("user_id", ids),
  ]);

  const digests = buildSavedAlerts({
    saved,
    rfps,
    today,
    emailByUser: new Map(
      ((profiles ?? []) as { id: string; email: string; status: string }[])
        .filter((p) => p.email && p.status !== "suspended")
        .map((p) => [p.id, p.email]),
    ),
    optedOut: new Set(
      ((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[])
        .filter((p) => p.new_rfps === "off" || p.channel_email === false)
        .map((p) => p.user_id),
    ),
    alreadySent: new Set(
      ((recent ?? []) as { user_id: string; type: string; link_url: string }[]).map(
        (n) => `${n.user_id}|${n.type}|${n.link_url}`,
      ),
    ),
  });

  if (dry) return dryResult(rfps.size, digests);

  let sent = 0;
  for (const d of digests) {
    // Log first (idempotency) so a slow or failed send can't cause a repeat.
    const { error } = await supabase.from("notifications").insert(
      d.items.map((i) => ({
        user_id: d.userId,
        type: i.type,
        title: i.kind === "closing" ? "Saved tender closing soon" : "Saved tender status changed",
        message: i.rfp.title,
        link_url: rfpLink(i.rfp.slug),
      })),
    );
    if (error) continue;
    await sendDigest(d);
    sent++;
  }

  return NextResponse.json({ sent, candidates: rfps.size });
}

function dryResult(candidates: number, digests: SavedAlertDigest[]) {
  return NextResponse.json({
    dry: true, candidates,
    members: digests.map(d => ({ items: d.items.length, subject: savedAlertSubject(d) })),
  });
}

function sendDigest(digest: SavedAlertDigest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  return sendSavedRfpAlerts(digest.email, {
    subject: savedAlertSubject(digest),
    items: digest.items.map(item => ({ kind: item.kind, ...item.rfp })),
    unsubscribeUrl: unsubscribeUrl(base, digest.userId),
  });
}
