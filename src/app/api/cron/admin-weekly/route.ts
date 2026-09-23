import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { buildWeeklyReport } from "@/lib/admin/weekly-report";
import { sendAdminWeeklyReport } from "@/lib/email/send";

export const maxDuration = 60;

/**
 * Monday numbers email to the admin inbox (ADMIN_NOTIFICATION_EMAIL, else
 * info@pmrfp.com): signups by type, new paid and cancellations, MRR/ARR,
 * PM-posted RFPs, interest, contact requests, tenders imported — last 7 days
 * with week-over-week where it matters.
 *
 * Vercel cron Mondays 12:30 UTC (8:30 a.m. Toronto in summer, 7:30 in winter).
 * `?dry=1` returns the report as JSON without emailing. CRON_SECRET-protected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const supabase = createServiceClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  const [users, subs, pmRfps, tenders, usTenders, interests, interestsPrev, contacts] = await Promise.all([
    supabase.from("users_profile").select("email,primary_role,created_at").gte("created_at", twoWeeksAgo).limit(5000),
    supabase
      .from("subscriptions")
      .select("status,amount,stripe_price_id,created_at,updated_at,cancel_at_period_end,organizations(name)")
      .limit(5000),
    supabase
      .from("rfp_posts")
      .select("title,slug,created_at")
      .or("source_type.is.null,source_type.neq.public_source")
      .gte("created_at", weekAgo)
      .limit(200),
    supabase.from("rfp_posts").select("id", { count: "exact", head: true }).eq("source_type", "public_source").gte("created_at", weekAgo),
    // SAM.gov slugs end "-us-<32 hex>" (lib/tenders/sources).
    supabase.from("rfp_posts").select("id", { count: "exact", head: true }).eq("source_type", "public_source").like("slug", "%-us-%").gte("created_at", weekAgo),
    supabase.from("rfp_interests").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("rfp_interests").select("id", { count: "exact", head: true }).gte("created_at", twoWeeksAgo).lt("created_at", weekAgo),
    supabase.from("contact_requests").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
  ]);
  const failed = [users, subs, pmRfps].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  type SubRow = {
    status: string;
    amount: number | null;
    stripe_price_id: string | null;
    created_at: string;
    updated_at: string;
    cancel_at_period_end: boolean;
    organizations: { name: string } | { name: string }[] | null;
  };
  const report = buildWeeklyReport({
    now,
    users: users.data ?? [],
    subscriptions: ((subs.data ?? []) as SubRow[]).map(({ organizations: o, ...s }) => ({
      ...s,
      amount: s.amount == null ? null : Number(s.amount),
      orgName: (Array.isArray(o) ? o[0]?.name : o?.name) ?? null,
    })),
    pmRfps: pmRfps.data ?? [],
    tenders: { total: tenders.count ?? 0, us: usTenders.count ?? 0 },
    interests: interests.count ?? 0,
    interestsPrev: interestsPrev.count ?? 0,
    contactRequests: contacts.count ?? 0,
    monthlyPriceIds: [process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY ?? "", process.env.STRIPE_PRICE_SEO_MONTHLY ?? ""],
  });

  if (new URL(request.url).searchParams.get("dry") === "1") {
    // Counts only — the dry run is for checking the numbers, not reading emails.
    return NextResponse.json({ dry: true, ...report, signups: { ...report.signups, latest: report.signups.latest.length } });
  }
  await sendAdminWeeklyReport(report);
  return NextResponse.json({ sent: true, signups: report.signups.count, mrr: report.revenue.mrr });
}
