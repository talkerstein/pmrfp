import Link from "next/link";
import { Lock } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { listRfps } from "@/lib/data/rfps";
import { PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { RfpCard } from "@/components/public/rfp-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "RFP Feed" };

export default async function RfpFeedPage() {
  const session = await requireRole(["trade"]);
  const demo = isDemoMode();
  const rfps = await listRfps();
  const locked = !session.hasTradeAccess && !demo;

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title="RFP Feed"
        description="Commercial property opportunities matched to your categories and regions."
      />

      {locked && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50/60 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="size-4 text-teal-600" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">RFP details are locked.</strong> Activate Trade Pro
              to view full scope and express interest.
            </span>
          </div>
          <Link href="/dashboard/billing" className={buttonVariants()}>
            Activate Trade Pro
          </Link>
        </div>
      )}

      {rfps.length === 0 ? (
        <EmptyState
          title="No matching opportunities yet"
          description="New RFPs that match your categories and regions will appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rfps.map((rfp) => (
            <RfpCard key={rfp.slug} rfp={rfp} locked={locked} />
          ))}
        </div>
      )}
    </div>
  );
}
