import { requireRole, isDemoMode } from "@/lib/access/access";
import { listRfps } from "@/lib/data/rfps";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";

export const metadata = { title: "Dashboard" };

export default async function TradeDashboardHome() {
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  const org = session.organization;
  const matchingRfps = (await listRfps()).length;

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

      {!session.hasTradeAccess && (
        <div className="mt-6 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
          <h2 className="text-base font-semibold">Unlock full RFP access with Trade Pro</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Activate your subscription to view full RFP details, express interest, and appear
            higher in the vendor directory. $249 CAD/year.
          </p>
          <div className="mt-4">
            <ActivateButton />
          </div>
        </div>
      )}
    </div>
  );
}
