import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { PRICING } from "@/lib/site";

export const metadata: Metadata = { title: "Admin Overview · PMRFP" };

export default async function AdminOverviewPage() {
  await requireRole(["admin", "super_admin"]);

  let stats = {
    users: 0,
    activeSubs: 0,
    monthlySubs: 0,
    annualSubs: 0,
    pendingProfiles: 0,
    pendingRfps: 0,
    publishedRfps: 0,
    interests: 0,
    newSignups: 0,
  };
  // ARR is computed per-row from each subscription's actual annualized amount,
  // not assumed-flat × count — monthly subs ($29×12=$348/yr) and annual ($249/yr)
  // contribute different ARR. Comped subs contribute $0.
  let arrCad = 0;

  if (isDemoMode()) {
    stats = {
      users: 342,
      activeSubs: 87,
      monthlySubs: 12,
      annualSubs: 75,
      pendingProfiles: 6,
      pendingRfps: 4,
      publishedRfps: 58,
      interests: 213,
      newSignups: 41,
    };
    arrCad = 75 * PRICING.proAnnual + 12 * PRICING.proMonthly * 12;
  } else {
    const supabase = await createClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const monthlyPriceId = process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY ?? null;

    const [
      users,
      activeSubRows,
      pendingProfiles,
      pendingRfps,
      publishedRfps,
      interests,
      newSignups,
    ] = await Promise.all([
      supabase.from("users_profile").select("*", { count: "exact", head: true }),
      // Pull rows (not just count) so we can compute ARR + interval breakdown.
      supabase
        .from("subscriptions")
        .select("status,amount,stripe_price_id")
        .in("status", ["active", "comped"]),
      supabase
        .from("organizations")
        .select("*", { count: "exact", head: true })
        .eq("profile_status", "pending_review"),
      supabase
        .from("rfp_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review"),
      supabase
        .from("rfp_posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "published"),
      supabase.from("rfp_interests").select("*", { count: "exact", head: true }),
      supabase
        .from("users_profile")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since),
    ]);

    const rows = (activeSubRows.data ?? []) as Array<{
      status: string;
      amount: number | null;
      stripe_price_id: string | null;
    }>;
    let monthlyCount = 0;
    let annualCount = 0;
    for (const r of rows) {
      if (r.status === "comped") continue; // comped → $0 ARR
      const isMonthly = !!monthlyPriceId && r.stripe_price_id === monthlyPriceId;
      const monthlyAmount = isMonthly ? (r.amount ?? PRICING.proMonthly) : 0;
      const annualAmount = !isMonthly ? (r.amount ?? PRICING.proAnnual) : 0;
      arrCad += monthlyAmount * 12 + annualAmount;
      if (isMonthly) monthlyCount += 1;
      else annualCount += 1;
    }

    stats = {
      users: users.count ?? 0,
      activeSubs: rows.length,
      monthlySubs: monthlyCount,
      annualSubs: annualCount,
      pendingProfiles: pendingProfiles.count ?? 0,
      pendingRfps: pendingRfps.count ?? 0,
      publishedRfps: publishedRfps.count ?? 0,
      interests: interests.count ?? 0,
      newSignups: newSignups.count ?? 0,
    };
  }

  const arr = `$${Math.round(arrCad).toLocaleString("en-CA")} CAD`;
  const arrHint =
    stats.monthlySubs > 0
      ? `${stats.annualSubs} annual · ${stats.monthlySubs} monthly`
      : `@ $${PRICING.proAnnual}/yr each`;

  return (
    <>
      <PageHeader
        title="Admin Overview"
        description="Platform health at a glance — moderation queues, subscribers, and revenue."
      />
      {isDemoMode() && <DemoBanner />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={stats.users} href="/admin/users" />
        <StatCard
          label="Active trade subscribers"
          value={stats.activeSubs}
          hint="active + comped"
          href="/admin/subscriptions"
        />
        <StatCard label="Annual recurring revenue" value={arr} hint={arrHint} />
        <StatCard label="New signups (30d)" value={stats.newSignups} />
        <StatCard
          label="Pending profiles"
          value={stats.pendingProfiles}
          hint="awaiting review"
          href="/admin/organizations"
        />
        <StatCard
          label="Pending RFPs"
          value={stats.pendingRfps}
          hint="awaiting review"
          href="/admin/rfps"
        />
        <StatCard label="Published RFPs" value={stats.publishedRfps} href="/admin/rfps" />
        <StatCard
          label="Interests submitted"
          value={stats.interests}
          href="/admin/interests"
        />
      </div>
    </>
  );
}
