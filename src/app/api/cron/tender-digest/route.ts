import { NextResponse } from "next/server";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendTenderDigest } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { displayTitle } from "@/lib/tenders/title";

export const maxDuration = 60;

/**
 * Weekly free-trade tender digest (Vercel cron, Mondays 13:30 UTC).
 *
 * The public-tender feed fills the board daily, but only PAID members get
 * alerts — free trades never find out work exists in their trade, so they
 * never have a reason to upgrade. This tells each free trade how many open
 * tenders matching their categories were posted in the last week, lists the
 * top few, and links to Trade Pro.
 *
 * Guard rails:
 *  - Refuses to send (dry runs still work) until BUSINESS_MAILING_ADDRESS is
 *    set — CASL requires a mailing address in commercial email.
 *  - Once per user per 6 days, recorded as a 'tender_digest' notification
 *    (also shows in-app) — safe even if the route is triggered repeatedly.
 *  - Skips anyone with notification_preferences new_rfps='off' or email off,
 *    and every org with an active/comped subscription.
 *  - Caps recipients per run.
 * `?dry=1` reports who would get what without sending or writing.
 */
const MAX_RECIPIENTS = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim();
  if (!dry && !mailingAddress) {
    return NextResponse.json({ skipped: "BUSINESS_MAILING_ADDRESS not set (required by CASL)" });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const sixDaysAgo = new Date(now - 6 * 86_400_000).toISOString();
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

  const [{ data: rfps }, { data: orgs }, { data: subs }, { data: regions }] = await Promise.all([
    supabase
      .from("rfp_posts")
      .select("id,title,slug,deadline,region_id,published_at,source_type, rfp_categories(category_id, trade_categories(name))")
      .eq("status", "published")
      .eq("is_demo", false)
      .gte("published_at", weekAgo)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("organizations")
      .select("id,name")
      .in("organization_type", ["trade_company", "supplier"])
      .eq("is_demo", false)
      .eq("status", "active"),
    supabase.from("subscriptions").select("organization_id,status"),
    supabase.from("regions").select("id,slug,parent_id"),
  ]);

  const openRfps = ((rfps ?? []) as unknown as RfpRow[])
    .filter((r) => !r.deadline || r.deadline >= today)
    .map((r) => ({ ...r, title: displayTitle(r.title, r.source_type).title }));
  if (!openRfps.length) return NextResponse.json({ sent: 0, reason: "no new open tenders this week" });

  const paid = new Set(
    ((subs ?? []) as { organization_id: string; status: string }[])
      .filter((s) => s.status === "active" || s.status === "comped")
      .map((s) => s.organization_id),
  );
  const freeOrgs = ((orgs ?? []) as { id: string; name: string }[]).filter((o) => !paid.has(o.id));
  const orgIds = freeOrgs.map((o) => o.id);
  if (!orgIds.length) return NextResponse.json({ sent: 0, reason: "no free trades" });
  const nationalId = ((regions ?? []) as { id: string; slug: string }[]).find((r) => r.slug === "canada")?.id;

  const [{ data: orgCats }, { data: orgRegs }, { data: members }] = await Promise.all([
    supabase.from("organization_categories").select("organization_id,category_id").in("organization_id", orgIds),
    supabase.from("organization_regions").select("organization_id,region_id").in("organization_id", orgIds),
    supabase.from("organization_members").select("organization_id,user_id").in("organization_id", orgIds),
  ]);
  const catsByOrg = group((orgCats ?? []) as Pair[], "organization_id", "category_id");
  // Serving a region means serving everything under it (Ontario → Toronto).
  const tree = (regions ?? []) as RegionNode[];
  const regsByOrg = new Map(
    [...group((orgRegs ?? []) as Pair[], "organization_id", "region_id")].map(([org, ids]) => [org, expandRegionIds(ids, tree)]),
  );
  const usersByOrg = group((members ?? []) as Pair[], "organization_id", "user_id");

  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id as string))];
  const [{ data: profiles }, { data: prefs }, { data: recent }] = await Promise.all([
    supabase.from("users_profile").select("id,email,status").in("id", userIds.length ? userIds : ["__"]),
    supabase.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", userIds.length ? userIds : ["__"]),
    supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "tender_digest")
      .gte("created_at", sixDaysAgo)
      .in("user_id", userIds.length ? userIds : ["__"]),
  ]);
  const emailById = new Map(
    ((profiles ?? []) as { id: string; email: string; status: string }[])
      .filter((p) => p.email && p.status !== "suspended")
      .map((p) => [p.id, p.email]),
  );
  const optedOut = new Set(
    ((prefs ?? []) as { user_id: string; new_rfps: string; channel_email: boolean }[])
      .filter((p) => p.new_rfps === "off" || p.channel_email === false)
      .map((p) => p.user_id),
  );
  const alreadySent = new Set(((recent ?? []) as { user_id: string }[]).map((r) => r.user_id));

  let sent = 0;
  const preview: { org: string; count: number; trade: string }[] = [];
  for (const org of freeOrgs) {
    const cats = catsByOrg.get(org.id);
    if (!cats?.size) continue;
    const regs = regsByOrg.get(org.id) ?? new Set();
    const matches = openRfps.filter(
      (r) =>
        r.rfp_categories.some((c) => cats.has(c.category_id)) &&
        (!r.region_id || r.region_id === nationalId || regs.has(r.region_id)),
    );
    if (!matches.length) continue;

    // Label by the trade that matched most often ("snow removal tenders").
    const counts = new Map<string, number>();
    for (const r of matches)
      for (const c of r.rfp_categories)
        if (cats.has(c.category_id) && c.trade_categories?.name)
          counts.set(c.trade_categories.name, (counts.get(c.trade_categories.name) ?? 0) + 1);
    const trade = ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "commercial").toLowerCase();
    preview.push({ org: org.name, count: matches.length, trade });

    for (const userId of usersByOrg.get(org.id) ?? []) {
      const email = emailById.get(userId);
      if (!email || optedOut.has(userId) || alreadySent.has(userId) || sent >= MAX_RECIPIENTS) continue;
      const unsub = unsubscribeUrl(base, userId);
      if (!unsub) continue;
      if (dry) {
        sent++;
        continue;
      }
      // Record first — a slow/failed send must never cause a resend loop.
      const { error } = await supabase.from("notifications").insert({
        user_id: userId,
        type: "tender_digest",
        title: `${matches.length} new ${trade} tender${matches.length === 1 ? "" : "s"} this week`,
        message: matches.slice(0, 3).map((m) => m.title).join(" · "),
        link_url: "/rfps",
      });
      if (error) continue;
      alreadySent.add(userId);
      await sendTenderDigest(email, {
        count: matches.length,
        tradeLabel: trade,
        items: matches.slice(0, 5).map((m) => ({ title: m.title, slug: m.slug, deadline: m.deadline })),
        upgradeUrl: `${base}/dashboard/billing?plan=pro&interval=annual`,
        unsubscribeUrl: unsub,
        mailingAddress: mailingAddress!,
      });
      sent++;
    }
  }

  return NextResponse.json(dry ? { dry: true, wouldSend: sent, orgs: preview } : { sent, orgs: preview.length });
}

type Pair = Record<string, string>;
interface RfpRow {
  id: string;
  title: string;
  source_type: string | null;
  slug: string;
  deadline: string | null;
  region_id: string | null;
  rfp_categories: { category_id: string; trade_categories: { name: string } | null }[];
}

function group(rows: Pair[], key: string, val: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = m.get(r[key]) ?? new Set<string>();
    s.add(r[val]);
    m.set(r[key], s);
  }
  return m;
}
