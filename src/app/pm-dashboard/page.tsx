import Link from "next/link";
import { FileText, ArrowRight, Users } from "lucide-react";
import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { StatCard, PageHeader, DemoBanner } from "@/components/dashboard/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { gcFormPath } from "@/lib/gc/packages";
import { getMyTrustedList } from "@/lib/trusted/data";

export const metadata = { title: "Property Manager Dashboard" };

export default async function PmDashboardHome() {
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const demo = isDemoMode();
  // General contractors share this dashboard; they post sub-trade packages.
  const gc = session.organization?.organization_type === "builder";
  const realtor = session.profile.primary_role === "real_estate_agent";
  const trusted = demo ? null : await getMyTrustedList(session.userId);

  let activeRfps = 0;
  let pendingReview = 0;
  let interestedVendors = 0;

  if (!isDemoMode()) {
    const supabase = await createClient();
    const { data: posts } = await supabase
      .from("rfp_posts")
      .select("id,status")
      .eq("posted_by_user_id", session.userId);
    const rows = (posts as { id: string; status: string }[] | null) ?? [];
    activeRfps = rows.filter((r) => r.status === "published").length;
    pendingReview = rows.filter((r) => r.status === "pending_review").length;
    if (rows.length > 0) {
      const { count } = await supabase
        .from("rfp_interests")
        .select("id", { count: "exact", head: true })
        .in("rfp_id", rows.map((r) => r.id));
      interestedVendors = count ?? 0;
    }
  } else {
    activeRfps = 2;
    pendingReview = 1;
    interestedVendors = 5;
  }

  return (
    <div>
      {demo && <DemoBanner />}
      <PageHeader
        title={gc ? "Contractor Dashboard" : "Property Manager Dashboard"}
        description={
          gc
            ? "Post sub-trade packages, review interested trades, and manage your packages."
            : "Post project needs, review interested vendors, and manage your RFPs."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active RFPs" value={activeRfps} href="/pm-dashboard/rfps" />
        <StatCard label="Pending review" value={pendingReview} href="/pm-dashboard/rfps" />
        <StatCard label="Interested vendors" value={interestedVendors} href="/pm-dashboard/rfps" />
        <StatCard label="Trusted trades" value={trusted?.trades.length ?? 0} href="/pm-dashboard/saved-vendors" />
      </div>

      {/* Realtors' first win is their shareable page, not an RFP. */}
      {realtor && trusted?.ready && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-indigo p-6 text-white">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-teal-300 text-indigo">
              <Users className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                {trusted.trades.length ? "Your trusted-trades page" : "Build your trusted-trades page"}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-indigo-100/80">
                {trusted.trades.length
                  ? `${trusted.trades.length} trade${trusted.trades.length === 1 ? "" : "s"} on it. Copy the link and send it to your next client.`
                  : "Save the trades you trust from the directory and send clients one link instead of a phone number."}
              </p>
            </div>
          </div>
          <Link
            href={trusted.trades.length ? "/pm-dashboard/saved-vendors" : "/directory"}
            className={buttonVariants({ size: "lg", variant: "accent" })}
          >
            {trusted.trades.length ? "Open your page" : "Browse the directory"} <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-teal-500 text-indigo">
            <FileText className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">{gc ? "Post a sub-trade package" : "Post an RFP"}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {gc
                ? "One package per trade. Local trades in that trade and region send you quotes. Free."
                : "Describe your project and let qualified Canadian trades come to you."}
            </p>
          </div>
        </div>
        <Link href={gc ? gcFormPath() : "/pm-dashboard/rfps/new"} className={buttonVariants({ size: "lg" })}>
          {gc ? "Post a package" : "Post an RFP"} <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
