import Link from "next/link";
import { Camera } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { projectsReady } from "@/lib/projects/server";
import { buttonVariants } from "@/components/ui/button";
import { listRfps } from "@/lib/data/rfps";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";
import { SponsorSlot } from "@/components/sponsors/sponsor-slot";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function TradeDashboardHome() {
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  const org = session.organization;
  const [rfps, photoProjects, tradeSlugs] = await Promise.all([listRfps(), projectsReady(), orgTradeSlugs(org?.id ?? null, demo)]);
  const matchingRfps = rfps.filter((r) => r.status === "open").length;

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title={`Welcome${org?.name ? `, ${org.name}` : ""}`}
        description="Your trade visibility, opportunities, and profile health at a glance."
      />

      {/* Prominent profile-completion meter — single source of truth for "what
          to do next." Replaces the previous trio (stat / checklist / recommended-
          action) which were spread across the page and visually inconsistent. */}
      <ProfileCompletionCard org={org} hasActiveSub={session.hasTradeAccess} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Subscription"
          value={session.hasTradeAccess ? "Trade Pro — Active" : "Free"}
          hint={session.hasTradeAccess ? "Full RFP access" : "Upgrade for full access"}
          href="/dashboard/billing"
        />
        <StatCard label="Matching RFPs" value={matchingRfps} hint="Open opportunities" href="/dashboard/rfps" />
        <StatCard label="Saved RFPs" value={0} href="/dashboard/saved-rfps" />
        <StatCard label="Interests submitted" value={0} href="/dashboard/interests" />
        <StatCard label="Profile views" value={demo ? 42 : 0} hint="Last 30 days" />
      </div>

      {photoProjects && (
        <Link
          href="/dashboard/projects/new"
          className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-6 transition-colors hover:bg-teal-50"
        >
          <div className="flex items-start gap-4">
            <Camera className="mt-0.5 size-6 shrink-0 text-teal-600" />
            <div>
              <h2 className="text-base font-semibold">Show a job you&apos;re proud of</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Snap before and after photos on your phone, say what you did in a line, and we&apos;ll
                write it up. It goes on your profile for property managers to see.
              </p>
            </div>
          </div>
          <span className={buttonVariants()}>Add a project</span>
        </Link>
      )}

      {org?.profile_status === "approved" && org.slug && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/badge/${org.slug}`} alt="Your PMRFP badge" width={160} height={40} className="mt-1 hidden sm:block" />
            <div>
              <h2 className="text-base font-semibold">Your profile is live — add your badge</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Paste it into your website footer and email signature. Property managers who click it
                see your profile, and your profile links back to your site. Two minutes, free.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/badge" className={buttonVariants({ variant: "outline" })}>
              Get the badge
            </Link>
            <Link href="/widgets?w=company" className={buttonVariants({ variant: "outline" })}>
              Company card widget
            </Link>
          </div>
        </div>
      )}

      {!session.hasTradeAccess && (
        <div className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
          <h2 className="text-base font-semibold">Unlock full RFP access with Trade Pro</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See the full scope, documents and buyer contact on every RFP, what similar contracts sold
            for, and get an email the morning each match posts. $29/month or $249 CAD/year.
          </p>
          <div className="mt-4">
            <ActivateButton />
          </div>
        </div>
      )}

      <SponsorSlot
        className="mt-6 max-w-md"
        ctx={{ placement: "trade_dashboard", categories: tradeSlugs, seed: org?.id ?? "" }}
      />
    </div>
  );
}

/** The trades this company lists under, for picking a relevant sponsor. */
async function orgTradeSlugs(orgId: string | null, demo: boolean): Promise<string[]> {
  if (!orgId || demo) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_categories")
    .select("trade_categories(slug)")
    .eq("organization_id", orgId);
  return ((data as unknown as { trade_categories: { slug: string } | null }[] | null) ?? [])
    .map((r) => r.trade_categories?.slug)
    .filter((s): s is string => Boolean(s));
}
