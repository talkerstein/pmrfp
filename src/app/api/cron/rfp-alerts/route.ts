import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendDailyMatches } from "@/lib/email/send";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";
import { buildDigests, digestSubject, type DigestRfp } from "@/lib/alerts/digest";
import {
  awardLine,
  recentAwardsByUser,
  toDigestAward,
  type AwardRow,
  type DigestAward,
} from "@/lib/alerts/awards";

export const maxDuration = 60;

interface RfpRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  deadline: string | null;
  region_id: string | null;
  rfp_categories: { category_id: string; trade_categories: { name: string } | null }[];
}
type Pair = Record<string, string>;

/**
 * Daily match digest for paying members (Vercel cron, 13:00 UTC — after the
 * Canadian and U.S. tender imports). For RFPs published in the last ~26h,
 * each member gets ONE email listing every new match in their trades and
 * regions (a region covers everything under it). Honors opt-outs
 * (notification_preferences new_rfps='off' / email off), never repeats an RFP
 * (notifications log), and uses the plain-English bid summary when one
 * exists. A digest also carries up to 3 "recently awarded near you" public
 * contracts (lib/alerts/awards). `?dry=1` returns per-member counts without sending.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });
  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  // Dry runs may look further back to exercise matching; real sends are always 26h.
  const hours = dry ? Math.min(Number(params.get("hours")) || 26, 24 * 14) : 26;

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: rfpRows } = await supabase
    .from("rfp_posts")
    .select("id,title,slug,summary,deadline,region_id, rfp_categories(category_id, trade_categories(name))")
    .eq("status", "published")
    .gte("published_at", since)
    // Never alert on something already closed — incl. past public contracts,
    // whose "deadline" is their award date.
    .or(`deadline.is.null,deadline.gte.${today}`)
    .limit(1000);
  const rows = (rfpRows ?? []) as unknown as RfpRow[];
  if (!rows.length) return NextResponse.json({ sent: 0, reason: "no recent RFPs" });

  const { data: paidSubs } = await supabase.from("subscriptions").select("organization_id").in("status", ["active", "comped"]);
  const paidOrgIds = [...new Set(((paidSubs ?? []) as Pair[]).map((s) => s.organization_id))];
  if (!paidOrgIds.length) return NextResponse.json({ sent: 0, reason: "no paid orgs" });

  const [{ data: orgCats }, { data: orgRegs }, { data: members }, { data: regionRows }, { data: checks }] = await Promise.all([
    supabase.from("organization_categories").select("organization_id,category_id").in("organization_id", paidOrgIds),
    supabase.from("organization_regions").select("organization_id,region_id").in("organization_id", paidOrgIds),
    supabase.from("organization_members").select("organization_id,user_id").in("organization_id", paidOrgIds),
    supabase.from("regions").select("id,name,parent_id"),
    // Plain-English summaries from the bid checklist, when they exist (an
    // error here — e.g. the table isn't migrated yet — just means none).
    supabase.from("rfp_bid_checks").select("rfp_id,result").in("rfp_id", rows.map((r) => r.id)).not("result", "is", null),
  ]);

  const tree = (regionRows ?? []) as (RegionNode & { name: string })[];
  const regionName = new Map(tree.map((r) => [r.id, r.name]));
  const plain = new Map(
    ((checks ?? []) as { rfp_id: string; result: { plainSummary?: string } | null }[]).map((c) => [
      c.rfp_id,
      c.result?.plainSummary ?? null,
    ]),
  );
  const rfps: DigestRfp[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    deadline: r.deadline,
    regionId: r.region_id,
    regionName: r.region_id ? regionName.get(r.region_id) ?? null : null,
    categoryIds: r.rfp_categories.map((c) => c.category_id),
    categoryNames: r.rfp_categories.map((c) => c.trade_categories?.name ?? ""),
    summary: plain.get(r.id) ?? r.summary,
  }));

  const userIds = [...new Set(((members ?? []) as Pair[]).map((m) => m.user_id))];
  const ids = userIds.length ? userIds : ["__"];
  const [{ data: profiles }, { data: prefs }, { data: recent }] = await Promise.all([
    supabase.from("users_profile").select("id,email,status").in("id", ids),
    supabase.from("notification_preferences").select("user_id,new_rfps,channel_email").in("user_id", ids),
    supabase
      .from("notifications")
      .select("user_id,link_url")
      .eq("type", "rfp_alert")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .in("user_id", ids),
  ]);

  const membership = {
    paidOrgIds,
    catsByOrg: group((orgCats ?? []) as Pair[], "organization_id", "category_id"),
    regionsByOrg: new Map(
      [...group((orgRegs ?? []) as Pair[], "organization_id", "region_id")].map(([org, regionIds]) => [
        org,
        expandRegionIds(regionIds, tree),
      ]),
    ),
    usersByOrg: group((members ?? []) as Pair[], "organization_id", "user_id"),
  };
  const digests = buildDigests({
    rfps,
    ...membership,
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
      ((recent ?? []) as { user_id: string; link_url: string }[]).map(
        (n) => `${n.user_id}|${n.link_url.replace(/^\/rfps\//, "")}`,
      ),
    ),
  });

  // "Recently awarded near you": award notices that landed in the same window.
  // Only rides along with a digest that's going out anyway — never its own email.
  const awardsByUser = digests.length
    ? await recentAwards(supabase, { since, today, ...membership })
    : new Map<string, DigestAward[]>();

  if (dry) {
    return NextResponse.json({
      dry: true,
      recentRfps: rfps.length,
      members: digests.map((d) => ({
        matches: d.items.length,
        recentAwards: awardsByUser.get(d.userId)?.length ?? 0,
        subject: digestSubject(d),
      })),
    });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com";
  const mailingAddress = process.env.BUSINESS_MAILING_ADDRESS?.trim() || null;
  let sent = 0;
  for (const d of digests) {
    await sendDailyMatches(d.email, {
      subject: digestSubject(d),
      items: d.items.map((i) => ({
        title: i.title,
        slug: i.slug,
        trade: i.categoryNames.find(Boolean) ?? null,
        region: i.regionName,
        deadline: i.deadline,
        summary: i.summary,
      })),
      unsubscribeUrl: unsubscribeUrl(base, d.userId),
      mailingAddress,
      recentAwards: (awardsByUser.get(d.userId) ?? []).map((a) => ({ slug: a.slug, line: awardLine(a, d.tradeLabel) })),
    });
    await supabase.from("notifications").insert(
      d.items.map((i) => ({
        user_id: d.userId,
        type: "rfp_alert",
        title: "New matching opportunity",
        message: i.title,
        link_url: `/rfps/${i.slug}`,
      })),
    );
    sent++;
  }

  return NextResponse.json({ sent, rfpsNotified: digests.reduce((s, d) => s + d.items.length, 0) });
}

/**
 * Award notices first seen in the digest window (created_at, not the award
 * date — notices land days after the award). Any error just means no section.
 */
async function recentAwards(
  supabase: ReturnType<typeof createServiceClient>,
  opts: {
    since: string;
    today: string;
    paidOrgIds: string[];
    catsByOrg: Map<string, Set<string>>;
    regionsByOrg: Map<string, Set<string>>;
    usersByOrg: Map<string, Set<string>>;
  },
): Promise<Map<string, DigestAward[]>> {
  const { data, error } = await supabase
    .from("rfp_posts")
    .select("id,title,slug,summary,deadline,region_id,source_type, rfp_categories(category_id, trade_categories(slug))")
    .eq("status", "published")
    .eq("source_type", "public_source")
    .gte("created_at", opts.since)
    .lte("deadline", opts.today)
    .limit(500);
  if (error || !data) return new Map();
  const rows = data as unknown as (Omit<AwardRow, "categories"> & {
    rfp_categories: { category_id: string; trade_categories: { slug: string } | null }[];
  })[];
  const awards = rows
    .map((r) =>
      toDigestAward(
        { ...r, categories: r.rfp_categories.map((c) => ({ id: c.category_id, slug: c.trade_categories?.slug ?? "" })) },
        opts.today,
      ),
    )
    .filter((a): a is DigestAward => a !== null);
  return recentAwardsByUser({ awards, ...opts });
}

function group(rows: Pair[], keyField: string, valField: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = r[keyField];
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r[valField]);
  }
  return map;
}
