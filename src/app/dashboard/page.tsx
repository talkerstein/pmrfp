import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { listRfps } from "@/lib/data/rfps";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Dashboard" };

export default async function TradeDashboardHome() {
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  const org = session.organization;
  const matchingRfps = (await listRfps()).length;

  const checklist = [
    { label: "Add a company logo", done: Boolean(org?.logo_url) },
    { label: "Write a description", done: Boolean(org?.short_description || org?.full_description) },
    { label: "Add a website", done: Boolean(org?.website) },
    { label: "Confirm insurance status", done: Boolean(org?.insurance_status) },
    { label: "Activate your subscription", done: session.hasTradeAccess },
  ];
  const remaining = checklist.find((c) => !c.done);

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title={`Welcome${org?.name ? `, ${org.name}` : ""}`}
        description="Your trade visibility, opportunities, and profile health at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Subscription"
          value={session.hasTradeAccess ? "Trade Pro — Active" : "Free"}
          hint={session.hasTradeAccess ? "Full RFP access" : "Upgrade for full access"}
          href="/dashboard/billing"
        />
        <StatCard
          label="Profile completion"
          value={`${org?.profile_completion_score ?? 0}%`}
          hint="Complete your profile to rank higher"
          href="/dashboard/company"
        />
        <StatCard label="Matching RFPs" value={matchingRfps} hint="Open opportunities" href="/dashboard/rfps" />
        <StatCard label="Saved RFPs" value={0} href="/dashboard/saved-rfps" />
        <StatCard label="Interests submitted" value={0} href="/dashboard/interests" />
        <StatCard label="Profile views" value={demo ? 42 : 0} hint="Last 30 days" />
      </div>

      {!session.hasTradeAccess && (
        <div className="mt-6 rounded-lg border border-gold-300 bg-gold-50/60 p-6">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-base font-semibold">Complete your profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A complete profile gets discovered more often by property managers.
          </p>
          <ul className="mt-4 space-y-2.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm">
                {item.done ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-base font-semibold">Recommended next action</h2>
          {remaining ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{remaining.label}</p>
              <Link
                href={
                  remaining.label.includes("subscription")
                    ? "/dashboard/billing"
                    : "/dashboard/company"
                }
                className={`${buttonVariants({ size: "lg" })} mt-4`}
              >
                Get started <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Your profile is in great shape. Browse the latest opportunities.
              </p>
              <Link href="/dashboard/rfps" className={`${buttonVariants({ size: "lg" })} mt-4`}>
                View RFP feed <ArrowRight className="size-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
