import Link from "@/i18n/link";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { LeadList } from "@/components/leads/lead-list";
import { TrialStartForm, canStartTrial } from "@/components/leads/trial";
import { isThinMarket } from "@/lib/leads/match";
import type { MemberMarket } from "@/lib/leads/load";
import type { SessionContext } from "@/lib/access/access";
import type { CountryCode } from "@/lib/visitor-geo";
import { getLang, getT } from "@/i18n/server";
import { fmt, formatNumber, plural } from "@/i18n/format";
import { regionName, tradeName } from "@/i18n/terms";

/**
 * "Your market this month" on the trade dashboard: honest counts in the
 * company's trades and area, then the leads. Free members see a few leads
 * (no Pro fields) and one quiet offer; Trade Pro / trial members see them
 * all. When the counts are near zero we say so and suggest widening the
 * trades or areas instead of pushing an upgrade.
 */
export function MarketPanel({ market, session, country }: { market: MemberMarket; session: SessionContext; country: CountryCode }) {
  const t = getT("leads");
  const lang = getLang();
  const num = (n: number) => formatNumber(n, lang);
  const { counts, leads } = market;
  const isPro = session.hasTradeAccess;
  const trades = market.tradeNames.map((n) => tradeName(n, lang)).slice(0, 3).join(", ");
  const area = market.areaLabel ? regionName(market.areaLabel, lang) : null;
  const thin = isThinMarket(counts);
  const nameBySlug = market.profile.nameBySlug;

  if (market.missing.trades || market.missing.areas) {
    return (
      <section className="mt-6 rounded-lg border border-border bg-card p-6" data-section="lead-feed">
        <h2 className="text-base font-semibold">{t.market.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{market.missing.trades ? t.market.missingTrades : t.market.missingAreas}</p>
        <Link href="/dashboard/company" className={`${buttonVariants({ variant: "outline" })} mt-4`}>{t.market.setUp}</Link>
      </section>
    );
  }

  return (
    <section className="mt-6" data-section="lead-feed">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.market.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{area ? fmt(t.market.sub, { trades, area }) : fmt(t.market.subNoArea, { trades })}</p>
        </div>
        <Link href="/dashboard/company" className="text-sm font-medium text-teal-700 hover:underline">{t.market.widen}</Link>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.market.counts.bids} value={num(counts.openBids)} hint={t.market.counts.bidsHint} href="/dashboard/rfps" />
        <StatCard
          label={t.market.counts.projects}
          value={country === "CA" ? num(counts.projects) : "–"}
          hint={country === "CA" ? t.market.counts.projectsHint : t.market.projectsCanadaOnly}
        />
        <StatCard label={t.market.counts.winners} value={num(counts.winners)} hint={t.market.counts.winnersHint} />
        <StatCard label={t.market.counts.packages} value={num(counts.packages)} hint={t.market.counts.packagesHint} />
      </div>

      {thin && (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-5" data-section="thin-market">
          <p className="font-semibold text-foreground">{fmt(t.market.thinTitle, { trades, area: area ?? "" })}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {fmt(t.market.thinBody, { bids: num(counts.openBids), projects: num(counts.projects) })}
          </p>
          <Link href="/dashboard/company" className={`${buttonVariants({ variant: "outline" })} mt-3`}>{t.market.widen}</Link>
        </div>
      )}

      {leads.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-foreground">{plural(counts.total, t.market.leadsTitle, { n: num(counts.total) })}</h3>
          <LeadList leads={leads} t={t} lang={lang} tradeNames={nameBySlug} />
        </div>
      ) : (
        !thin && <p className="mt-4 text-sm text-muted-foreground">{t.market.empty}</p>
      )}

      {!isPro && !thin && counts.total > leads.length && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50/60 p-5" data-section="lead-teaser">
          <div className="max-w-2xl">
            <p className="font-semibold text-foreground">{plural(leads.length, t.market.freeMore, { n: num(leads.length), total: num(counts.total) })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.market.freePitch}</p>
            {canStartTrial({ paid: session.paid, trial: session.trial, organizationType: session.organization?.organization_type, organizationStatus: session.organization?.status, organizationProfileStatus: session.organization?.profile_status }) && (
              <p className="mt-1 text-xs text-muted-foreground">{t.trial.note}</p>
            )}
          </div>
          {canStartTrial({ paid: session.paid, trial: session.trial, organizationType: session.organization?.organization_type, organizationStatus: session.organization?.status, organizationProfileStatus: session.organization?.profile_status }) ? (
            <TrialStartForm source="leads" label={getT("trialFirst").cta.start} lang={lang} returnTo="/dashboard" />
          ) : (
            <Link href="/dashboard/billing?plan=pro&interval=annual" className={buttonVariants()}>
              {fmt(t.market.seeAll, { total: num(counts.total) })}
            </Link>
          )}
        </div>
      )}

      {isPro && counts.openBids > 0 && (
        <p className="mt-3 text-sm">
          <Link href="/dashboard/rfps" className="font-medium text-teal-700 hover:underline">{t.market.allBids} →</Link>
        </p>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t.market.dataNote}</p>
    </section>
  );
}
