import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isServiceConfigured } from "@/lib/supabase/config";
import { sendMatchingRfpAlert } from "@/lib/email/send";
import { expandRegionIds, type RegionNode } from "@/lib/data/region-tree";

/**
 * Daily matching-alert digest (Vercel cron). For RFPs published in the last
 * ~26h, email paid trades whose category + region match. Live-only.
 * Protect with CRON_SECRET if set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isServiceConfigured()) return NextResponse.json({ skipped: "no service client" });

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  const { data: rfps } = await supabase
    .from("rfp_posts")
    .select("id,title,slug,region_id, rfp_categories(category_id)")
    .eq("status", "published")
    .gte("published_at", since)
    // Never alert on something already closed — incl. past public contracts,
    // whose "deadline" is their award date.
    .or(`deadline.is.null,deadline.gte.${new Date().toISOString().slice(0, 10)}`)
    // A daily run sees ~a day of new tenders (Canada + U.S. federal); 50
    // silently dropped the rest once SAM.gov was added.
    .limit(500);
  if (!rfps?.length) return NextResponse.json({ sent: 0, reason: "no recent RFPs" });

  const { data: paidSubs } = await supabase
    .from("subscriptions")
    .select("organization_id")
    .in("status", ["active", "comped"]);
  const orgIds = (paidSubs ?? []).map((s: { organization_id: string }) => s.organization_id);
  if (!orgIds.length) return NextResponse.json({ sent: 0, reason: "no paid orgs" });

  const [{ data: orgCats }, { data: orgRegs }, { data: members }, { data: regionRows }] = await Promise.all([
    supabase.from("organization_categories").select("organization_id,category_id").in("organization_id", orgIds),
    supabase.from("organization_regions").select("organization_id,region_id").in("organization_id", orgIds),
    supabase.from("organization_members").select("organization_id,user_id").in("organization_id", orgIds),
    supabase.from("regions").select("id,parent_id"),
  ]);

  const catsByOrg = group(orgCats ?? [], "organization_id", "category_id");
  // Serving a region means serving everything under it (Ontario → Toronto).
  const tree = (regionRows ?? []) as RegionNode[];
  const regsByOrg = new Map(
    [...group(orgRegs ?? [], "organization_id", "region_id")].map(([org, ids]) => [org, expandRegionIds(ids, tree)]),
  );
  const usersByOrg = group(members ?? [], "organization_id", "user_id");

  const allUserIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))];
  const { data: profiles } = await supabase.from("users_profile").select("id,email").in("id", allUserIds.length ? allUserIds : ["__"]);
  const emailById = new Map((profiles ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));

  let sent = 0;
  for (const rfp of rfps as RfpRow[]) {
    const rfpCats = new Set(rfp.rfp_categories.map((c) => c.category_id));
    for (const orgId of orgIds) {
      const orgCatSet = catsByOrg.get(orgId) ?? new Set();
      const sharesCat = [...rfpCats].some((c) => orgCatSet.has(c));
      if (!sharesCat) continue;
      const orgRegSet = regsByOrg.get(orgId) ?? new Set();
      const regionOk = !rfp.region_id || orgRegSet.has(rfp.region_id);
      if (!regionOk) continue;

      for (const userId of usersByOrg.get(orgId) ?? new Set<string>()) {
        const email = emailById.get(userId);
        if (!email) continue;
        // Dedupe: skip if we already notified this user about this RFP.
        const { count } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("type", "rfp_alert")
          .eq("link_url", `/rfps/${rfp.slug}`);
        if (count && count > 0) continue;

        await sendMatchingRfpAlert(email, { title: rfp.title, slug: rfp.slug });
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "rfp_alert",
          title: "New matching opportunity",
          message: rfp.title,
          link_url: `/rfps/${rfp.slug}`,
        });
        sent++;
      }
    }
  }

  return NextResponse.json({ sent });
}

interface RfpRow {
  id: string;
  title: string;
  slug: string;
  region_id: string | null;
  rfp_categories: { category_id: string }[];
}

function group<T extends Record<string, string>>(rows: T[], keyField: keyof T, valField: keyof T): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = r[keyField];
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r[valField]);
  }
  return map;
}
