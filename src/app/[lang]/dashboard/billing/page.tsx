import { requireRole, isDemoMode } from "@/lib/access/access";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ActivateButton, ManageBillingButton } from "@/components/dashboard/billing-actions";
import { PRICING } from "@/lib/site";
import { parsePlanIntent, type PlanIntent } from "@/lib/billing/plan-intent";
import type { Metadata } from "next";
import { getLang, getT, setLangFrom } from "@/i18n/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale } from "@/i18n/config";
import { fmt, formatDate } from "@/i18n/format";
import { isLifetimeSubscriptionId } from "@/lib/founding/config";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: getDictionary(hasLocale(lang) ? lang : "en").dash.meta.billing };
}

interface SubRow {
  status: string;
  current_period_end: string | null;
  amount: number | null;
  currency: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id?: string | null;
}

/** The plan-intent price for this page's language (English keeps parsePlanIntent's label). */
function intentPrice(intent: PlanIntent, perMonth: string, perYear: string): string {
  const monthly = intent.interval === "monthly";
  const amount =
    intent.plan === "featured"
      ? PRICING.featuredAnnual
      : intent.plan === "seo"
        ? monthly ? PRICING.seoMonthly : PRICING.seoAnnual
        : monthly ? PRICING.proMonthly : PRICING.proAnnual;
  return fmt(monthly ? perMonth : perYear, { amount, currency: PRICING.currency });
}

export default async function BillingPage({
  searchParams, params }: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
} & { params: Promise<object> }) {
  await setLangFrom(params);
  const lang = getLang();
  const t = getT("dash").billing;
  const session = await requireRole(["trade"]);
  const sp = await searchParams;
  const intent = parsePlanIntent(sp.plan, sp.interval);

  let sub: SubRow | null = null;
  if (!isDemoMode() && session.organization) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status,current_period_end,amount,currency,stripe_price_id,stripe_subscription_id")
      .eq("organization_id", session.organization.id)
      .maybeSingle<SubRow>();
    sub = data ?? null;
  }

  const isActive = sub?.status === "active" || sub?.status === "comped";
  const isLifetime = isLifetimeSubscriptionId(sub?.stripe_subscription_id);
  const tf = getT("founding");
  const isFeatured =
    !!sub?.stripe_price_id &&
    sub.stripe_price_id === process.env.STRIPE_PRICE_FEATURED_ANNUAL;
  const isMonthly =
    !!sub?.stripe_price_id &&
    !!process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY &&
    sub.stripe_price_id === process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY;
  const planName = isLifetime
    ? tf.billingBadge
    : isFeatured
    ? t.plans.featured
    : isMonthly
      ? t.plans.proMonthly
      : t.plans.pro;
  const intentName = intent ? (lang === "en" ? intent.name : t.plans[intent.plan]) : "";
  const intentPriceLabel = intent ? (lang === "en" ? intent.priceLabel : intentPrice(intent, t.perMonth, t.perYear)) : "";
  const annualSaving = PRICING.proMonthly * 12 - PRICING.proAnnual;
  const monthlyEnabled = Boolean(process.env.STRIPE_PRICE_TRADE_PRO_MONTHLY);

  return (
    <div>
      <PageHeader title={t.title} description={t.description} />

      {intent && !isActive && (
        <div className="mb-4 rounded-lg border border-teal-300 bg-teal-50/60 p-5">
          <p className="font-semibold text-foreground">
            {fmt(t.intentLine, { name: intentName, price: intentPriceLabel })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t.intentNote}</p>
          <div className="mt-4">
            <ActivateButton
              plan={intent.plan}
              interval={intent.interval}
              variant="accent"
              label={fmt(t.continueWith, { name: intentName })}
            />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-6">
        {isActive && sub ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-muted-foreground">{t.currentPlan}</div>
                <div className="mt-1 text-xl font-semibold">{planName}</div>
              </div>
              <StatusBadge status={sub.status} />
            </div>
            {isLifetime ? (
              <p className="mt-4 text-sm text-muted-foreground">{tf.billingBody}</p>
            ) : (<>
            {sub.current_period_end && (
              <p className="mt-4 text-sm text-muted-foreground">
                {sub.status === "comped" ? t.comped : t.renews}{" "}
                {sub.status !== "comped" && (
                  <strong className="text-foreground">
                    {formatDate(sub.current_period_end, lang, { month: "long", day: "numeric", year: "numeric" })}
                  </strong>
                )}
              </p>
            )}
            {sub.amount != null && (
              <p className="mt-1 text-sm text-muted-foreground">
                {fmt(isMonthly ? t.perMonth : t.perYear, {
                  amount: sub.amount.toFixed(0),
                  currency: sub.currency?.toUpperCase() ?? "CAD",
                })}
              </p>
            )}
            {sub.status === "active" && isMonthly && (
              <p className="mt-3 text-xs text-muted-foreground">{fmt(t.switchAnnual, { n: annualSaving })}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <ManageBillingButton />
              {sub.status === "active" && !isFeatured && (
                <ActivateButton
                  plan="featured"
                  variant="accent"
                  label={fmt(t.upgradeFeatured, { n: PRICING.featuredAnnual })}
                />
              )}
            </div>
            {sub.status === "active" && !isFeatured && (
              <p className="mt-3 text-xs text-muted-foreground">{t.featuredNote}</p>
            )}
            </>)}
          </>
        ) : (
          <>
            <div className="eyebrow text-muted-foreground">{t.currentPlan}</div>
            <div className="mt-1 text-xl font-semibold">{t.free}</div>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t.freeBody}</p>
            {monthlyEnabled ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {/* Annual — primary */}
                <div className="rounded-lg border border-teal-400 bg-teal-100/30 p-4 ring-2 ring-teal-400/40">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-foreground">
                      {fmt(t.price, { n: PRICING.proAnnual })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(t.currencyYear, { currency: PRICING.currency })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-teal-ink">{fmt(t.bestValue, { n: annualSaving })}</p>
                  <div className="mt-3">
                    <ActivateButton
                      label={t.activateAnnual}
                      interval="annual"
                      className="w-full"
                    />
                  </div>
                </div>
                {/* Monthly — try-before-you-buy */}
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-foreground">
                      {fmt(t.price, { n: PRICING.proMonthly })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmt(t.currencyMonth, { currency: PRICING.currency })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.monthlyNote}</p>
                  <div className="mt-3">
                    <ActivateButton
                      label={t.startMonthly}
                      interval="monthly"
                      variant="outline"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {fmt(t.annualPrice, { n: PRICING.proAnnual, currency: PRICING.currency })}
                </p>
                <div className="mt-5">
                  <ActivateButton />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">{t.earlyBirdNote}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.guaranteeNote}</p>
    </div>
  );
}
