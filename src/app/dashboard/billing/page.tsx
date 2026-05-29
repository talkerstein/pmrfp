import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ActivateButton, ManageBillingButton } from "@/components/dashboard/billing-actions";
import { PRICING } from "@/lib/site";

export const metadata = { title: "Billing" };

interface SubRow {
  status: string;
  current_period_end: string | null;
  amount: number | null;
  currency: string | null;
  stripe_price_id: string | null;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BillingPage() {
  const session = await requireRole(["trade"]);

  let sub: SubRow | null = null;
  if (!isDemoMode() && session.organization) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status,current_period_end,amount,currency,stripe_price_id")
      .eq("organization_id", session.organization.id)
      .maybeSingle<SubRow>();
    sub = data ?? null;
  }

  const isActive = sub?.status === "active" || sub?.status === "comped";
  const isFeatured =
    !!sub?.stripe_price_id &&
    sub.stripe_price_id === process.env.STRIPE_PRICE_FEATURED_ANNUAL;
  const planName = isFeatured ? "Featured" : "Trade Pro";

  return (
    <div>
      <PageHeader title="Billing" description="Manage your Trade Pro subscription." />

      <div className="rounded-lg border border-border bg-card p-6">
        {isActive && sub ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-muted-foreground">Current plan</div>
                <div className="mt-1 text-xl font-semibold">{planName}</div>
              </div>
              <StatusBadge status={sub.status} />
            </div>
            {sub.current_period_end && (
              <p className="mt-4 text-sm text-muted-foreground">
                {sub.status === "comped" ? "Complimentary access." : "Renews"}{" "}
                {sub.status !== "comped" && <strong className="text-foreground">{fmt(sub.current_period_end)}</strong>}
              </p>
            )}
            {sub.amount != null && (
              <p className="mt-1 text-sm text-muted-foreground">
                ${(sub.amount / 100).toFixed(0)} {sub.currency?.toUpperCase() ?? "CAD"}/year
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <ManageBillingButton />
              {sub.status === "active" && !isFeatured && (
                <ActivateButton
                  plan="featured"
                  variant="accent"
                  label={`Upgrade to Featured — $${PRICING.featuredAnnual}/yr`}
                />
              )}
            </div>
            {sub.status === "active" && !isFeatured && (
              <p className="mt-3 text-xs text-muted-foreground">{PRICING.featuredNote}</p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow text-muted-foreground">Current plan</div>
            <div className="mt-1 text-xl font-semibold">Free</div>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Upgrade to Trade Pro to unlock full RFP details, express interest, and rank higher in
              the directory.
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              ${PRICING.proAnnual} {PRICING.currency}/year
            </p>
            <div className="mt-5">
              <ActivateButton />
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{PRICING.earlyBirdNote}</p>
    </div>
  );
}
