import Link from "next/link";
import { Check } from "lucide-react";
import { requireRole } from "@/lib/access/access";
import { PageHeader } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/public/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { ActivateButton } from "@/components/dashboard/billing-actions";
import { ShareLink, TrustedPageForm, TrustedTradeRow } from "@/components/trusted/trusted-editor";
import { getMyTrustedList, isRealtorPro } from "@/lib/trusted/data";
import { FREE_LIMIT } from "@/lib/trusted/rules";
import { PRICING, SITE } from "@/lib/site";

export const metadata = { title: "Trusted trades" };

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pmrfp.com").replace(/\/$/, "");

export default async function TrustedTradesPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const session = await requireRole(["property_manager", "real_estate_agent"]);
  const { upgraded } = await searchParams;
  const [{ ready, list, trades }, pro] = await Promise.all([
    getMyTrustedList(session.userId),
    isRealtorPro(session.organization?.id ?? null),
  ]);
  const canCheckout = Boolean(process.env.STRIPE_PRICE_REALTOR_ANNUAL);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your trusted trades"
        description="One page with the trades you'd send a client to. Text or email the link instead of digging for phone numbers."
      />

      {upgraded && (
        <p className="flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50/60 p-4 text-sm font-medium">
          <Check className="size-4 text-teal-700" /> Realtor Pro is on. Your page is unlimited, and you can add your phone and email below.
        </p>
      )}

      {!ready ? (
        <EmptyState title="Almost ready" description="Trusted-trades pages are switching on. Check back in a few minutes." />
      ) : !list || trades.length === 0 ? (
        <EmptyState
          title="Start your page"
          description="Open any company in the directory and tap “Save to my trusted trades”. Your page is created with the first one."
        >
          <Link href="/directory" className={buttonVariants()}>
            Browse the directory
          </Link>
        </EmptyState>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Your page</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {list.published ? "Public. Send this link to clients." : "Hidden. Turn it public below to share it."}
            </p>
            <div className="mt-4">
              <ShareLink url={`${BASE}/trusted/${list.handle}`} path={`/trusted/${list.handle}`} />
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-semibold">Trades on your page</h2>
              <span className="text-sm text-muted-foreground">
                {pro ? `${trades.length} trades` : `${trades.length} of ${FREE_LIMIT} on the free page`}
              </span>
            </div>
            <ul className="mt-3 space-y-3">
              {trades.map((t) => (
                <TrustedTradeRow
                  key={t.organizationId}
                  organizationId={t.organizationId}
                  name={t.vendor.name}
                  slug={t.vendor.slug}
                  detail={[t.vendor.categories.slice(0, 2).join(", "), t.vendor.city].filter(Boolean).join(" · ")}
                  note={t.note}
                />
              ))}
            </ul>
            <Link href="/directory" className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">
              + Add more from the directory
            </Link>
          </section>
        </>
      )}

      {ready && !pro && (
        <section className="rounded-2xl bg-indigo p-6 text-white sm:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-300">Realtor Pro</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Make it your lead page</h2>
          <ul className="mt-4 space-y-2 text-sm text-indigo-100">
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-300" /> Unlimited trades (free pages hold {FREE_LIMIT})</li>
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-300" /> Your phone and email on the page, so every client who opens it can reach you</li>
            <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-300" /> Your notes on each trade, in your words</li>
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            {canCheckout ? (
              <ActivateButton plan="realtor" variant="accent" label={`Start Realtor Pro, $${PRICING.realtorAnnual}/year`} />
            ) : (
              <a
                href={`mailto:${SITE.email}?subject=${encodeURIComponent("Realtor Pro")}&body=${encodeURIComponent(
                  `Hi, I'd like Realtor Pro ($${PRICING.realtorAnnual}/year) for my trusted-trades page${list ? ` (pmrfp.com/trusted/${list.handle})` : ""}.`,
                )}`}
                className={buttonVariants({ variant: "accent", size: "lg" })}
              >
                Get Realtor Pro, ${PRICING.realtorAnnual}/year
              </a>
            )}
            <span className="text-sm text-indigo-100/70">{PRICING.currency}. Cancel anytime.</span>
          </div>
        </section>
      )}

      {ready && list && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">Page settings</h2>
          <div className="mt-4">
            <TrustedPageForm
              pro={pro}
              defaults={{
                handle: list.handle,
                displayName: list.displayName,
                brokerage: list.brokerage ?? "",
                headline: list.headline ?? "",
                contactPhone: list.contactPhone ?? "",
                contactEmail: list.contactEmail ?? "",
                published: list.published,
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
