import type { Metadata } from "next";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";

export const metadata: Metadata = { title: "Admin Overview · PMRFP" };

const PRICE = 249;

export default async function AdminOverviewPage() {
  await requireRole(["admin", "super_admin"]);

  let stats = {
    users: 0,
    activeSubs: 0,
    pendingProfiles: 0,
    pendingRfps: 0,
    publishedRfps: 0,
    interests: 0,
    newSignups: 0,
  };

  if (isDemoMode()) {
    stats = {
      users: 342,
      activeSubs: 87,
      pendingProfiles: 6,
      pendingRfps: 4,
      publishedRfps: 58,
      interests: 213,
      newSignups: 41,
    };
  } else {
    const supabase = await createClient();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      users,
      activeSubs,
      pendingProfiles,
      pendingRfps,
      publishedRfps,
      interests,
      newSignups,
    ] = await Promise.all([
      supabase.from("users_profile").select("*", { count: "exact", head: true }),
      supabase
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
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

    stats = {
      users: users.count ?? 0,
      activeSubs: activeSubs.count ?? 0,
      pendingProfiles: pendingProfiles.count ?? 0,
      pendingRfps: pendingRfps.count ?? 0,
      publishedRfps: publishedRfps.count ?? 0,
      interests: interests.count ?? 0,
      newSignups: newSignups.count ?? 0,
    };
  }

  const arr = `$${(stats.activeSubs * PRICE).toLocaleString("en-CA")} CAD`;

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
        <StatCard label="Annual recurring revenue" value={arr} hint={`@ $${PRICE}/yr each`} />
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
